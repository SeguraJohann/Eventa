import { deleteField, getDoc, onSnapshot, query, serverTimestamp, where, type DocumentData } from "firebase/firestore";
import type {
  Category,
  ColorKey,
  Completion,
  DateKey,
  Item,
  ItemStatus,
  Millis,
  NodeMap,
  Pause,
  Placement,
  RecurrenceRule,
  ScheduleMode,
  TimeKey,
  TimeMode,
  TreeNode,
  Weekday,
} from "@/types/models";
import { dayDoc, itemDoc, itemsCol, occurrenceDoc, placementDoc } from "@/lib/firebase/collections";
import { dayConverter, itemConverter, nodesToDb, ts, tsOrNull } from "@/lib/firebase/converters";
import { ChunkedBatch, commitInBackground } from "@/lib/firebase/batch";
import { reportError } from "@/lib/utils/errors";
import { newDocId } from "@/lib/utils/id";
import { addDays, todayKey } from "@/lib/date/dateKey";
import {
  aliveIndex,
  descendantsOf,
  emptyNode,
  positionAfterLast,
  recomputeCompletion,
  structureFromRows,
  toggleNonRepeating,
  wouldCycle,
  type EditorRow,
} from "@/lib/tree/tree";
import { addPlacementToBatch, getItemPlacements, syncPlacementsOpen } from "@/features/placements/services/placements.service";
import { getItemOccurrences } from "@/features/occurrences/services/occurrences.service";
import { addLogEntry, logKey, removeLogEntry } from "@/features/days/services/days.service";
import { effectiveEndDate } from "@/lib/recurrence/engine";

// ---------- reads ----------

export function subscribeItems(uid: string, statuses: ItemStatus[], cb: (items: Item[]) => void, onError?: (e: unknown) => void): () => void {
  return onSnapshot(
    query(itemsCol(uid), where("status", "in", statuses)),
    (snap) => cb(snap.docs.map((d) => d.data())),
    (e) => {
      reportError(e);
      onError?.(e);
    },
  );
}

export async function fetchItem(uid: string, id: string): Promise<Item | null> {
  const snap = await getDoc(itemDoc(uid, id).withConverter(itemConverter));
  return snap.exists() ? snap.data() : null;
}

// ---------- drafts (form M2) ----------

export interface DayDraft {
  /** Existing placement id when editing. */
  placementId: string | null;
  date: DateKey;
  timeMode: TimeMode;
  startTime: TimeKey | null;
  endTime: TimeKey | null;
}

export interface ItemDraft {
  title: string;
  notes: string | null;
  color: ColorKey | null;
  category: Category | null;
  scheduleMode: ScheduleMode;
  timeMode: TimeMode;
  startTime: TimeKey | null;
  endTime: TimeKey | null;
  recurrence: RecurrenceRule | null;
  completion: Completion;
  background: boolean;
  dueDate: DateKey | null;
  estimateMin: number | null;
  rows: EditorRow[];
  days: DayDraft[];
}

function itemPayload(item: Item): DocumentData {
  const { id: _id, createdAt, statusChangedAt, updatedAt: _u, completedAt, nodes, ...rest } = item;
  return {
    ...rest,
    nodes: nodesToDb(nodes),
    completedAt: tsOrNull(completedAt),
    statusChangedAt: ts(statusChangedAt),
    createdAt: ts(createdAt),
    updatedAt: serverTimestamp(),
  };
}

/** Builds the node map from the editor rows, reusing existing nodes. */
function nodesFromRows(rows: EditorRow[], existing: NodeMap, repeating: boolean, today: DateKey): { nodes: NodeMap; removed: string[] } {
  const structure = structureFromRows(rows);
  const nodes: NodeMap = {};
  const keep = new Set<string>();
  for (const r of structure) {
    keep.add(r.id);
    const prev = existing[r.id];
    nodes[r.id] = prev
      ? { ...prev, title: r.title, parentId: r.parentId, position: r.position, removedOn: null }
      : emptyNode({ title: r.title, parentId: r.parentId, position: r.position, addedOn: today });
  }
  const removed: string[] = [];
  for (const [id, n] of Object.entries(existing)) {
    if (keep.has(id)) continue;
    if (n.removedOn !== null) {
      nodes[id] = n; // already removed earlier: keep the history
      continue;
    }
    removed.push(id);
    // Repeating items keep removed template nodes for past occurrences.
    if (repeating && n.addedOn < today) nodes[id] = { ...n, removedOn: today };
  }
  return { nodes, removed };
}

function normalizeDraft(d: ItemDraft): ItemDraft {
  const repeat = d.scheduleMode === "repeat";
  const timed = repeat && d.timeMode === "timed";
  return {
    ...d,
    title: d.title.trim(),
    notes: d.notes && d.notes.trim() !== "" ? d.notes.trim() : null,
    timeMode: repeat ? d.timeMode : "none",
    startTime: timed ? d.startTime : null,
    endTime: timed ? d.endTime : null,
    recurrence: repeat ? d.recurrence : null,
    background: d.completion === "block" ? d.background : false,
    dueDate: repeat ? null : d.dueDate,
    days: d.scheduleMode === "days" ? d.days : [],
  };
}

/** Creates an item (and its days). Returns the new id. */
export function createItem(uid: string, draftIn: ItemDraft, now: Millis = Date.now()): string {
  const draft = normalizeDraft(draftIn);
  const today = todayKey();
  const id = newDocId(uid);
  const { nodes } = nodesFromRows(draft.rows, {}, draft.scheduleMode === "repeat", today);
  const item: Item = {
    id,
    title: draft.title,
    notes: draft.notes,
    color: draft.color,
    category: draft.category,
    scheduleMode: draft.scheduleMode,
    timeMode: draft.timeMode,
    startTime: draft.startTime,
    endTime: draft.endTime,
    recurrence: draft.recurrence,
    pauses: [],
    completion: draft.completion,
    background: draft.background,
    status: "active",
    statusChangedAt: now,
    dueDate: draft.dueDate,
    estimateMin: draft.estimateMin,
    completedAt: null,
    completedOn: null,
    nodes,
    pinned: false,
    pinnedPosition: null,
    splitFromItemId: null,
    createdOn: today,
    createdAt: now,
    updatedAt: now,
  };
  const batch = new ChunkedBatch();
  batch.set(itemDoc(uid, id), itemPayload(item));
  draft.days.forEach((day, i) => {
    addPlacementToBatch(batch, uid, item, { itemId: id, nodeId: null, ...day }, now + i);
  });
  commitInBackground(batch);
  return id;
}

/** Saves the whole form over an existing item (scope "all"). */
export async function updateItem(uid: string, before: Item, draftIn: ItemDraft, now: Millis = Date.now()): Promise<void> {
  const draft = normalizeDraft(draftIn);
  const today = todayKey();
  const repeating = draft.scheduleMode === "repeat";
  const { nodes: rawNodes, removed } = nodesFromRows(draft.rows, before.nodes, repeating, today);

  let nodes = rawNodes;
  let root = { completedAt: before.completedAt, completedOn: before.completedOn };
  if (!repeating) {
    const r = recomputeCompletion(nodes, root, now, today);
    nodes = r.nodes;
    root = r.root;
  }

  const item: Item = {
    ...before,
    title: draft.title,
    notes: draft.notes,
    color: draft.color,
    category: draft.category,
    scheduleMode: draft.scheduleMode,
    timeMode: draft.timeMode,
    startTime: draft.startTime,
    endTime: draft.endTime,
    recurrence: draft.recurrence,
    completion: draft.completion,
    background: draft.background,
    dueDate: draft.dueDate,
    estimateMin: draft.estimateMin,
    nodes,
    completedAt: root.completedAt,
    completedOn: root.completedOn,
  };

  const placements = await getItemPlacements(uid, before.id).catch(() => [] as Placement[]);
  const batch = new ChunkedBatch();
  batch.set(itemDoc(uid, item.id), itemPayload(item));

  const removedSet = new Set(removed);
  const keptRootIds = new Set(draft.days.map((d) => d.placementId).filter((x): x is string => !!x));
  const survivors: Placement[] = [];
  for (const p of placements) {
    const dropForMode = repeating || (p.nodeId === null && (draft.scheduleMode !== "days" || !keptRootIds.has(p.id)));
    const dropForNode = p.nodeId !== null && removedSet.has(p.nodeId);
    if (dropForMode || dropForNode) batch.delete(placementDoc(uid, p.id));
    else survivors.push(p);
  }

  // Root days ("certain days"): diff against existing root placements.
  if (draft.scheduleMode === "days") {
    const rootPlacements = survivors.filter((p) => p.nodeId === null);
    draft.days.forEach((day, i) => {
      const prev = day.placementId ? rootPlacements.find((p) => p.id === day.placementId) : undefined;
      if (prev) {
        const timed = day.timeMode === "timed";
        batch.update(placementDoc(uid, prev.id), {
          date: day.date,
          timeMode: day.timeMode,
          startTime: timed ? day.startTime : null,
          endTime: timed ? day.endTime : null,
          updatedAt: serverTimestamp(),
        });
      } else {
        addPlacementToBatch(batch, uid, item, { itemId: item.id, nodeId: null, ...day }, now + i);
      }
    });
  }

  syncPlacementsOpen(batch, uid, item, survivors);
  commitInBackground(batch);
}

/**
 * "This and following": the original rule ends the day before `fromDate` and a
 * new item continues with the edited data.
 */
export async function splitItem(uid: string, before: Item, fromDate: DateKey, draftIn: ItemDraft, now: Millis = Date.now()): Promise<string> {
  const draft = normalizeDraft(draftIn);
  const today = todayKey();
  if (!before.recurrence || draft.scheduleMode !== "repeat" || !draft.recurrence) {
    await updateItem(uid, before, draftIn, now);
    return before.id;
  }
  const endDate = addDays(fromDate, -1);
  const batch = new ChunkedBatch();
  batch.update(itemDoc(uid, before.id), {
    "recurrence.endType": "date",
    "recurrence.endDate": endDate,
    "recurrence.endCount": null,
    updatedAt: serverTimestamp(),
  });

  const id = newDocId(uid);
  const fromRows = nodesFromRows(draft.rows, before.nodes, true, today).nodes;
  const nodes: NodeMap = {};
  for (const [nid, n] of Object.entries(fromRows)) {
    if (n.removedOn !== null) continue;
    nodes[nid] = { ...n, addedOn: fromDate, removedOn: null };
  }
  // Keep the remaining count when the original ended after N times.
  let recurrence: RecurrenceRule = { ...draft.recurrence, startDate: fromDate };
  if (before.recurrence.endType === "count" && draft.recurrence.endType === "count") {
    const originalEnd = effectiveEndDate(before.recurrence, before.pauses);
    recurrence = { ...recurrence, endType: "date", endDate: originalEnd, endCount: null };
  }
  const item: Item = {
    ...before,
    id,
    title: draft.title,
    notes: draft.notes,
    color: draft.color,
    category: draft.category,
    timeMode: draft.timeMode,
    startTime: draft.startTime,
    endTime: draft.endTime,
    recurrence,
    pauses: [],
    completion: draft.completion,
    background: draft.background,
    estimateMin: draft.estimateMin,
    status: "active",
    statusChangedAt: now,
    nodes,
    pinned: before.pinned,
    splitFromItemId: before.id,
    createdOn: today,
    createdAt: now,
    updatedAt: now,
  };
  batch.set(itemDoc(uid, id), itemPayload(item));
  if (before.pinned) batch.update(itemDoc(uid, before.id), { pinned: false });
  commitInBackground(batch);
  return id;
}

// ---------- completion ----------

/**
 * Checks/unchecks a node (or the root) of an item that does NOT repeat.
 * Returns true when this action completed the whole item (to offer M12).
 */
export function toggleItemNode(uid: string, item: Item, nodeId: string | null, checked: boolean, placements: Placement[], now: Millis = Date.now()): boolean {
  const today = todayKey();
  const root = { completedAt: item.completedAt, completedOn: item.completedOn };
  const res = toggleNonRepeating(item.nodes, root, nodeId, checked, now, today);

  const update: DocumentData = {
    completedAt: tsOrNull(res.root.completedAt),
    completedOn: res.root.completedOn,
    updatedAt: serverTimestamp(),
  };
  const nodes: NodeMap = { ...item.nodes };
  for (const [id, patch] of Object.entries(res.nodePatches)) {
    update[`nodes.${id}.completedAt`] = tsOrNull(patch.completedAt);
    update[`nodes.${id}.completedOn`] = patch.completedOn;
    nodes[id] = { ...nodes[id], ...patch };
  }

  const batch = new ChunkedBatch();
  batch.update(itemDoc(uid, item.id), update);
  const after: Item = { ...item, nodes, completedAt: res.root.completedAt, completedOn: res.root.completedOn };
  syncPlacementsOpen(batch, uid, after, placements);

  for (const leaf of res.completedLeaves) {
    const nid = leaf === "_root" ? null : leaf;
    addLogEntry(batch, uid, today, logKey(item.id, nid), {
      itemId: item.id,
      nodeId: nid,
      occurrenceDate: null,
      title: nid ? item.nodes[nid].title : item.title,
      itemTitle: item.title,
      at: now,
    });
  }
  for (const leaf of res.uncompletedLeaves) {
    const nid = leaf.id === "_root" ? null : leaf.id;
    if (leaf.completedOn) removeLogEntry(batch, uid, leaf.completedOn, logKey(item.id, nid));
  }
  commitInBackground(batch);
  return item.completedAt === null && res.root.completedAt !== null;
}

// ---------- status ----------

function closePauses(pauses: Pause[], today: DateKey): Pause[] {
  const yesterday = addDays(today, -1);
  return pauses
    .map((p) => (p.to === null ? { ...p, to: yesterday } : p))
    .filter((p) => p.to === null || p.to >= p.from);
}

export function setItemStatus(uid: string, item: Item, status: ItemStatus, placements: Placement[], now: Millis = Date.now()): void {
  const today = todayKey();
  let pauses = item.pauses;
  if (status === "paused" && item.status !== "paused") pauses = [...closePauses(pauses, today), { from: today, to: null }];
  if (status !== "paused" && item.status === "paused") pauses = closePauses(pauses, today);
  const batch = new ChunkedBatch();
  batch.update(itemDoc(uid, item.id), { status, pauses, statusChangedAt: ts(now), updatedAt: serverTimestamp() });
  syncPlacementsOpen(batch, uid, { ...item, status, pauses }, placements);
  commitInBackground(batch);
}

export function setPinned(uid: string, item: Item, pinned: boolean): void {
  const batch = new ChunkedBatch();
  batch.update(itemDoc(uid, item.id), { pinned, pinnedPosition: pinned ? Date.now() : null, updatedAt: serverTimestamp() });
  commitInBackground(batch);
}

export function duplicateItem(uid: string, item: Item, titleSuffix: string, now: Millis = Date.now()): string {
  const today = todayKey();
  const id = newDocId(uid);
  const nodes: NodeMap = {};
  for (const [nid, n] of Object.entries(item.nodes)) {
    if (n.removedOn !== null) continue;
    nodes[nid] = { ...n, completedAt: null, completedOn: null, addedOn: today };
  }
  const copy: Item = {
    ...item,
    id,
    title: `${item.title}${titleSuffix}`,
    nodes,
    status: "active",
    statusChangedAt: now,
    completedAt: null,
    completedOn: null,
    pauses: [],
    pinned: false,
    pinnedPosition: null,
    splitFromItemId: null,
    recurrence: item.recurrence ? { ...item.recurrence, startDate: today > item.recurrence.startDate ? today : item.recurrence.startDate } : null,
    scheduleMode: item.scheduleMode === "days" ? "none" : item.scheduleMode,
    createdOn: today,
    createdAt: now,
    updatedAt: now,
  };
  const batch = new ChunkedBatch();
  batch.set(itemDoc(uid, id), itemPayload(copy));
  commitInBackground(batch);
  return id;
}

/** Deletes an item with its placements, occurrences and day-log entries. */
export async function deleteItem(uid: string, item: Item): Promise<void> {
  const [placements, occurrences] = await Promise.all([
    getItemPlacements(uid, item.id).catch(() => [] as Placement[]),
    getItemOccurrences(uid, item.id).catch(() => []),
  ]);
  const batch = new ChunkedBatch();
  for (const p of placements) batch.delete(placementDoc(uid, p.id));
  for (const o of occurrences) batch.delete(occurrenceDoc(uid, o.id));

  const dates = new Set<DateKey>();
  if (item.completedOn) dates.add(item.completedOn);
  for (const n of Object.values(item.nodes)) if (n.completedOn) dates.add(n.completedOn);
  for (const o of occurrences) if (Object.keys(o.done).length > 0) dates.add(o.effectiveDate);
  const days = await Promise.all(
    [...dates].map((d) => getDoc(dayDoc(uid, d).withConverter(dayConverter)).then((s) => (s.exists() ? s.data() : null)).catch(() => null)),
  );
  for (const day of days) {
    if (!day) continue;
    const patch: DocumentData = {};
    for (const [key, entry] of Object.entries(day.log)) if (entry.itemId === item.id) patch[`log.${key}`] = deleteField();
    if (Object.keys(patch).length > 0) batch.update(dayDoc(uid, day.date), patch);
  }
  batch.delete(itemDoc(uid, item.id));
  await batch.commit().catch((e) => {
    reportError(e);
  });
}

// ---------- tree editing (detail view) ----------

export interface NodePatch {
  title?: string;
  notes?: string | null;
  dueDate?: DateKey | null;
  estimateMin?: number | null;
  weekdays?: Weekday[] | null;
}

export function addNode(uid: string, item: Item, parentId: string | null, title: string, now: Millis = Date.now()): string {
  const today = todayKey();
  const idx = aliveIndex(item.nodes);
  const id = Math.random().toString(36).slice(2, 10) + now.toString(36).slice(-4);
  const node: TreeNode = emptyNode({ title: title.trim(), parentId, position: positionAfterLast(idx, parentId), addedOn: today });
  const nodes = { ...item.nodes, [id]: node };
  void writeTree(uid, item, nodes, now);
  return id;
}

export function updateNode(uid: string, item: Item, nodeId: string, patch: NodePatch): void {
  const update: DocumentData = { updatedAt: serverTimestamp() };
  for (const [k, v] of Object.entries(patch)) update[`nodes.${nodeId}.${k}`] = v;
  const batch = new ChunkedBatch();
  batch.update(itemDoc(uid, item.id), update);
  commitInBackground(batch);
}

export function moveNode(uid: string, item: Item, nodeId: string, newParent: string | null, position: number, now: Millis = Date.now()): boolean {
  if (wouldCycle(item.nodes, nodeId, newParent)) return false;
  const nodes = { ...item.nodes, [nodeId]: { ...item.nodes[nodeId], parentId: newParent, position } };
  void writeTree(uid, item, nodes, now);
  return true;
}

/** Deletes a node with all its descendants (soft-delete in repeating items). */
export async function deleteNode(uid: string, item: Item, nodeId: string, now: Millis = Date.now()): Promise<void> {
  const idx = aliveIndex(item.nodes);
  const ids = [nodeId, ...descendantsOf(idx, nodeId)];
  const today = todayKey();
  const repeating = item.scheduleMode === "repeat";
  const nodes: NodeMap = { ...item.nodes };
  for (const id of ids) {
    if (repeating && nodes[id].addedOn < today) nodes[id] = { ...nodes[id], removedOn: today };
    else delete nodes[id];
  }
  await writeTree(uid, item, nodes, now, new Set(ids));
}

async function writeTree(uid: string, item: Item, nodesIn: NodeMap, now: Millis, removedIds?: Set<string>): Promise<void> {
  const today = todayKey();
  const placements = item.scheduleMode === "repeat" ? [] : await getItemPlacements(uid, item.id).catch(() => [] as Placement[]);
  let nodes = nodesIn;
  let root = { completedAt: item.completedAt, completedOn: item.completedOn };
  if (item.scheduleMode !== "repeat") {
    const r = recomputeCompletion(nodes, root, now, today);
    nodes = r.nodes;
    root = r.root;
  }
  const batch = new ChunkedBatch();
  const update: DocumentData = {
    completedAt: tsOrNull(root.completedAt),
    completedOn: root.completedOn,
    updatedAt: serverTimestamp(),
  };
  // Full map rewrite for structural changes keeps deleted keys out.
  update.nodes = nodesToDb(nodes);
  batch.update(itemDoc(uid, item.id), update);
  const after: Item = { ...item, nodes, completedAt: root.completedAt, completedOn: root.completedOn };
  const kept: Placement[] = [];
  for (const p of placements) {
    if (p.nodeId && removedIds?.has(p.nodeId)) batch.delete(placementDoc(uid, p.id));
    else kept.push(p);
  }
  syncPlacementsOpen(batch, uid, after, kept);
  commitInBackground(batch);
}

/** Recompute placements' `open` after structure changes when the caller has them. */
export async function refreshPlacementsOpen(uid: string, item: Item): Promise<void> {
  const placements = await getItemPlacements(uid, item.id);
  const batch = new ChunkedBatch();
  syncPlacementsOpen(batch, uid, item, placements);
  if (batch.size > 0) commitInBackground(batch);
}

