// Resolves the occurrences of repeating items for a date range, and computes
// streaks, completion rate and the heatmap. Pure.

import type { DateKey, Item, Occurrence, OccurrenceState, TimeKey } from "@/types/models";
import { ROOT_KEY, occurrenceId } from "@/types/models";
import { addDays, startOfWeek } from "@/lib/date/dateKey";
import { datesBetween, occursOn, ruleContext, type RuleContext } from "./engine";
import { occurrenceProgress, templateIndex } from "@/lib/tree/tree";

export interface ResolvedOccurrence {
  id: string;
  itemId: string;
  originalDate: DateKey;
  /** Day it is shown on (moved date if moved). */
  date: DateKey;
  moved: boolean;
  startTime: TimeKey | null;
  endTime: TimeKey | null;
  timeOverridden: boolean;
  doc: Occurrence | null;
  state: OccurrenceState;
  done: number;
  total: number;
}

const ctxCache = new WeakMap<Item, RuleContext>();

export function itemRuleContext(item: Item): RuleContext | null {
  if (item.scheduleMode !== "repeat" || !item.recurrence) return null;
  const cached = ctxCache.get(item);
  if (cached) return cached;
  const ctx = ruleContext(item.recurrence, item.pauses);
  ctxCache.set(item, ctx);
  return ctx;
}

/** Computed state of an occurrence (adds "missed" for past days). */
export function occurrenceState(
  item: Item,
  originalDate: DateKey,
  shownDate: DateKey,
  doc: Occurrence | null,
  today: DateKey,
): { state: OccurrenceState; done: number; total: number } {
  const template = templateIndex(item.nodes, originalDate);
  const progress = occurrenceProgress(template, doc?.done ?? {}, ROOT_KEY);
  if (doc?.status === "skipped") return { state: "skipped", ...progress };
  let state: OccurrenceState;
  if (progress.total > 0 && progress.done === progress.total) state = "done";
  else if (progress.done > 0) state = "partial";
  else state = "pending";
  if (item.completion === "check" && state !== "done" && shownDate < today && shownDate >= item.createdOn) {
    state = state === "partial" ? "partial" : "missed";
  }
  return { state, ...progress };
}

function resolve(item: Item, originalDate: DateKey, doc: Occurrence | null, today: DateKey): ResolvedOccurrence {
  const date = doc?.movedToDate ?? originalDate;
  const { state, done, total } = occurrenceState(item, originalDate, date, doc, today);
  const timeOverridden = !!doc && (doc.startTime !== null || doc.endTime !== null);
  return {
    id: occurrenceId(item.id, originalDate),
    itemId: item.id,
    originalDate,
    date,
    moved: date !== originalDate,
    startTime: timeOverridden ? doc!.startTime : item.startTime,
    endTime: timeOverridden ? doc!.endTime : item.endTime,
    timeOverridden,
    doc,
    state,
    done,
    total,
  };
}

/**
 * Occurrences of `item` shown in [from, to]. `docs` must contain the stored
 * occurrences of the item whose originalDate OR effectiveDate falls in the range.
 */
export function occurrencesInRange(
  item: Item,
  from: DateKey,
  to: DateKey,
  docs: Map<string, Occurrence>,
  today: DateKey,
): ResolvedOccurrence[] {
  const ctx = itemRuleContext(item);
  if (!ctx) return [];
  const out: ResolvedOccurrence[] = [];
  const seen = new Set<string>();
  for (const d of datesBetween(ctx, from, to)) {
    const id = occurrenceId(item.id, d);
    const doc = docs.get(id) ?? null;
    seen.add(id);
    const r = resolve(item, d, doc, today);
    if (r.date >= from && r.date <= to) out.push(r);
  }
  // Occurrences moved INTO the range from outside it.
  for (const doc of docs.values()) {
    if (doc.itemId !== item.id || seen.has(doc.id)) continue;
    if (doc.effectiveDate < from || doc.effectiveDate > to) continue;
    if (!occursOn(ctx, doc.originalDate) && doc.movedToDate === null) continue;
    out.push(resolve(item, doc.originalDate, doc, today));
  }
  return out;
}

// ---------- statistics ----------

export interface OccurrenceRecord {
  date: DateKey;
  state: OccurrenceState;
}

/**
 * Chronological records of an item chain (oldest predecessor first) from the
 * first occurrence up to `today` inclusive.
 */
export function historyOf(
  chain: Item[],
  docsByItem: Map<string, Map<string, Occurrence>>,
  today: DateKey,
  /** Optional lower bound to limit the scan (e.g. list views). */
  since: DateKey | null = null,
): OccurrenceRecord[] {
  const out: OccurrenceRecord[] = [];
  for (const item of chain) {
    const ctx = itemRuleContext(item);
    if (!ctx) continue;
    const from = ctx.rule.startDate > item.createdOn ? ctx.rule.startDate : item.createdOn;
    // Allow marking occurrences before creation if they were explicitly recorded.
    const docs = docsByItem.get(item.id) ?? new Map<string, Occurrence>();
    let earliest = from;
    for (const d of docs.values()) if (d.originalDate < earliest) earliest = d.originalDate;
    let start = earliest < ctx.rule.startDate ? ctx.rule.startDate : earliest;
    if (since && start < since) start = since;
    for (const d of datesBetween(ctx, start, today)) {
      const doc = docs.get(occurrenceId(item.id, d)) ?? null;
      const shown = doc?.movedToDate ?? d;
      out.push({ date: shown, state: occurrenceState(item, d, shown, doc, today).state });
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export interface Stats {
  current: number;
  best: number;
  /** 0..1, null when there is nothing to measure yet. */
  rate: number | null;
}

/**
 * Current streak: consecutive "done" going back from today. Skipped occurrences
 * and today's still-open occurrence do not break it.
 */
export function computeStats(history: OccurrenceRecord[], today: DateKey, window = 30): Stats {
  let current = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const r = history[i];
    if (r.state === "skipped") continue;
    if (r.date >= today && r.state !== "done") continue;
    if (r.date > today) continue;
    if (r.state === "done") current++;
    else break;
  }
  let best = 0;
  let run = 0;
  for (const r of history) {
    if (r.date > today) break;
    if (r.state === "skipped") continue;
    if (r.date === today && r.state !== "done") continue;
    if (r.state === "done") {
      run++;
      best = Math.max(best, run);
    } else run = 0;
  }
  const measurable = history.filter((r) => r.state !== "skipped" && r.date <= today && !(r.date === today && r.state !== "done"));
  const last = measurable.slice(-window);
  const rate = last.length === 0 ? null : last.filter((r) => r.state === "done").length / last.length;
  return { current, best: Math.max(best, current), rate };
}

export type HeatLevel = "none" | "future" | "missed" | "skipped" | "partial" | "done";

export interface HeatCell {
  date: DateKey;
  level: HeatLevel;
}

/** 14 columns (weeks) × 7 rows (Mon..Sun) ending with the current week. */
export function heatmap(item: Item, docs: Map<string, Occurrence>, today: DateKey, weeks = 14): HeatCell[][] {
  const first = addDays(startOfWeek(today), -(weeks - 1) * 7);
  const last = addDays(first, weeks * 7 - 1);
  const byDate = new Map<DateKey, ResolvedOccurrence>();
  for (const o of occurrencesInRange(item, first, last, docs, today)) byDate.set(o.date, o);
  const cols: HeatCell[][] = [];
  for (let w = 0; w < weeks; w++) {
    const col: HeatCell[] = [];
    for (let d = 0; d < 7; d++) {
      const date = addDays(first, w * 7 + d);
      const o = byDate.get(date);
      let level: HeatLevel = "none";
      if (o) {
        if (date > today) level = "future";
        else if (o.state === "done") level = "done";
        else if (o.state === "partial") level = "partial";
        else if (o.state === "skipped") level = "skipped";
        else if (o.state === "missed") level = "missed";
        else level = date === today ? "future" : "missed";
      }
      col.push({ date, level });
    }
    cols.push(col);
  }
  return cols;
}

/** Chain of items linked by splitFromItemId, oldest first. */
export function itemChain(item: Item, lookup: (id: string) => Item | undefined): Item[] {
  const chain: Item[] = [item];
  let cur = item;
  const guard = new Set<string>([item.id]);
  while (cur.splitFromItemId) {
    const prev = lookup(cur.splitFromItemId);
    if (!prev || guard.has(prev.id)) break;
    guard.add(prev.id);
    chain.unshift(prev);
    cur = prev;
  }
  return chain;
}
