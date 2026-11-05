// Builds what a day shows: the "no time" list and the timed schedule. Pure.

import type { ColorKey, DateKey, Item, Occurrence, OccurrenceState, Placement, TimeKey, TimeMode } from "@/types/models";
import { aliveIndex, hasChildren, isNodeComplete, pathTitles, progressOf, stateOf, type NodeState, type Progress } from "@/lib/tree/tree";
import { occurrencesInRange, type ResolvedOccurrence } from "@/lib/recurrence/occurrences";
import { timeToMinutes } from "@/lib/date/dateKey";
import { isRepeating } from "./items";

/** Schedule color by behavior: repeat+check = orange, once+check = blue, block = slate. */
export type Tone = "repeat" | "once" | "block" | "background";

export interface AgendaEntry {
  key: string;
  kind: "placement" | "occurrence";
  date: DateKey;
  item: Item;
  nodeId: string | null;
  placement: Placement | null;
  occurrence: ResolvedOccurrence | null;
  title: string;
  /** Ancestors (item title first) for subtasks; empty for the root. */
  path: string[];
  timeMode: TimeMode;
  startTime: TimeKey | null;
  endTime: TimeKey | null;
  checkable: boolean;
  state: NodeState | OccurrenceState;
  /** Set when the target has subtasks. */
  progress: Progress | null;
  tone: Tone;
  color: ColorKey | null;
}

export function toneOf(item: Item): Tone {
  if (item.completion === "block") return item.background && item.timeMode !== "none" ? "background" : "block";
  return isRepeating(item) ? "repeat" : "once";
}

function placementTone(item: Item, p: Placement): Tone {
  if (item.completion === "block") return item.background && p.timeMode === "timed" ? "background" : "block";
  return "once";
}

export function placementEntry(item: Item, p: Placement): AgendaEntry | null {
  if (p.nodeId !== null && (!item.nodes[p.nodeId] || item.nodes[p.nodeId].removedOn !== null)) return null;
  const idx = aliveIndex(item.nodes);
  const nodeHasChildren = p.nodeId === null ? idx.order.length > 0 : hasChildren(idx, p.nodeId);
  const progress = nodeHasChildren ? progressOf(idx, p.nodeId, (l) => item.nodes[l].completedAt !== null) : null;
  const complete = isNodeComplete(item.nodes, item.completedAt, p.nodeId);
  const title = p.nodeId === null ? item.title : item.nodes[p.nodeId].title;
  const path = p.nodeId === null ? [] : [item.title, ...pathTitles(item.nodes, p.nodeId)];
  return {
    key: `p_${p.id}`,
    kind: "placement",
    date: p.date,
    item,
    nodeId: p.nodeId,
    placement: p,
    occurrence: null,
    title,
    path,
    timeMode: p.timeMode,
    startTime: p.startTime,
    endTime: p.endTime,
    checkable: item.completion === "check",
    state: progress ? stateOf(progress) : complete ? "done" : "pending",
    progress,
    tone: placementTone(item, p),
    color: item.color,
  };
}

export function occurrenceEntry(item: Item, o: ResolvedOccurrence): AgendaEntry {
  const hasTree = o.total > 1 || aliveIndex(item.nodes, o.originalDate).order.length > 0;
  const timeMode: TimeMode = o.timeOverridden ? "timed" : item.timeMode;
  return {
    key: `o_${o.id}`,
    kind: "occurrence",
    date: o.date,
    item,
    nodeId: null,
    placement: null,
    occurrence: o,
    title: item.title,
    path: [],
    timeMode,
    startTime: timeMode === "timed" ? o.startTime : null,
    endTime: timeMode === "timed" ? o.endTime : null,
    checkable: item.completion === "check",
    state: o.state,
    progress: hasTree ? { done: o.done, total: o.total } : null,
    tone: toneOf(item),
    color: item.color,
  };
}

export interface AgendaSources {
  items: Item[];
  lookupItem: (id: string) => Item | undefined;
  placements: Placement[];
  occurrences: Map<string, Occurrence>;
  today: DateKey;
}

/** Entries for every day in [from, to], keyed by date. */
export function agendaForRange(src: AgendaSources, from: DateKey, to: DateKey): Map<DateKey, AgendaEntry[]> {
  const byDay = new Map<DateKey, AgendaEntry[]>();
  const push = (e: AgendaEntry) => {
    const list = byDay.get(e.date);
    if (list) list.push(e);
    else byDay.set(e.date, [e]);
  };

  for (const item of src.items) {
    if (item.status !== "active" || !isRepeating(item)) continue;
    for (const o of occurrencesInRange(item, from, to, src.occurrences, src.today)) {
      push(occurrenceEntry(item, o));
    }
  }

  for (const p of src.placements) {
    if (p.date < from || p.date > to) continue;
    const item = src.lookupItem(p.itemId);
    if (!item || item.status === "archived" || item.status === "paused") continue;
    if (isRepeating(item)) continue;
    const e = placementEntry(item, p);
    if (e) push(e);
  }

  for (const list of byDay.values()) list.sort(compareEntries);
  return byDay;
}

export function compareEntries(a: AgendaEntry, b: AgendaEntry): number {
  const ta = a.startTime ? timeToMinutes(a.startTime) : -1;
  const tb = b.startTime ? timeToMinutes(b.startTime) : -1;
  if (ta !== tb) return ta - tb;
  if (a.kind !== b.kind) return a.kind === "occurrence" ? -1 : 1;
  const pa = a.placement?.position ?? 0;
  const pb = b.placement?.position ?? 0;
  if (pa !== pb) return pa - pb;
  return a.title.localeCompare(b.title);
}

export function isTimed(e: AgendaEntry): boolean {
  return e.timeMode === "timed" && e.startTime !== null && e.endTime !== null;
}

/**
 * Splits a day into the task list and the schedule.
 * The list holds everything without a time, plus timed entries that have
 * subtasks (so they can be checked off from the list); those stay on the schedule too.
 */
export function splitDay(entries: AgendaEntry[]): { list: AgendaEntry[]; timed: AgendaEntry[] } {
  const untimed: AgendaEntry[] = [];
  const timed: AgendaEntry[] = [];
  for (const e of entries) (isTimed(e) ? timed : untimed).push(e);
  const timedWithTasks = timed
    .filter((e) => e.progress !== null)
    .sort((a, b) => timeToMinutes(a.startTime ?? "00:00") - timeToMinutes(b.startTime ?? "00:00"));
  return { list: finishedLast([...untimed, ...timedWithTasks]), timed };
}

/** Done or skipped: nothing left to do on that entry today. */
export function isFinished(e: AgendaEntry): boolean {
  return e.state === "done" || e.state === "skipped";
}

/** Pending entries first, finished ones at the bottom; keeps the order inside each group. */
export function finishedLast(entries: AgendaEntry[]): AgendaEntry[] {
  return [...entries.filter((e) => !isFinished(e)), ...entries.filter(isFinished)];
}

/** "X of Y done" for a day: checkable, not skipped. */
export function daySummary(entries: AgendaEntry[]): { done: number; total: number } {
  const relevant = entries.filter((e) => e.checkable && e.state !== "skipped");
  return { done: relevant.filter((e) => e.state === "done").length, total: relevant.length };
}

// ---------- schedule layout ----------

export interface LaidOut {
  entry: AgendaEntry;
  startMin: number;
  endMin: number;
  col: number;
  cols: number;
  background: boolean;
}

const MIN_DURATION = 15;

/** Overlapping blocks go side by side; background blocks sit behind at full width. */
export function layoutTimed(entries: AgendaEntry[]): LaidOut[] {
  const out: LaidOut[] = [];
  const fg: LaidOut[] = [];
  for (const entry of entries) {
    if (!isTimed(entry)) continue;
    const startMin = timeToMinutes(entry.startTime!);
    let endMin = timeToMinutes(entry.endTime!);
    if (endMin <= startMin) endMin = Math.min(24 * 60, startMin + MIN_DURATION);
    const lo: LaidOut = { entry, startMin, endMin: Math.max(endMin, startMin + MIN_DURATION), col: 0, cols: 1, background: entry.tone === "background" };
    if (lo.background) out.push(lo);
    else fg.push(lo);
  }
  fg.sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);

  let cluster: LaidOut[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const colEnds: number[] = [];
    for (const lo of cluster) {
      let col = colEnds.findIndex((end) => end <= lo.startMin);
      if (col === -1) {
        col = colEnds.length;
        colEnds.push(lo.endMin);
      } else colEnds[col] = lo.endMin;
      lo.col = col;
    }
    for (const lo of cluster) lo.cols = colEnds.length;
    out.push(...cluster);
    cluster = [];
  };
  for (const lo of fg) {
    if (cluster.length > 0 && lo.startMin >= clusterEnd) {
      flush();
      clusterEnd = -1;
    }
    cluster.push(lo);
    clusterEnd = Math.max(clusterEnd, lo.endMin);
  }
  flush();
  return out;
}
