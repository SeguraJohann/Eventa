import { deleteDoc, getDocs, onSnapshot, query, serverTimestamp, where } from "firebase/firestore";
import type { DateKey, Item, Millis, Occurrence, OccurrenceStatus, TimeKey } from "@/types/models";
import { ROOT_KEY, occurrenceId } from "@/types/models";
import { occurrenceDoc, occurrencesCol } from "@/lib/firebase/collections";
import { ts } from "@/lib/firebase/converters";
import { ChunkedBatch, commitInBackground } from "@/lib/firebase/batch";
import { reportError } from "@/lib/utils/errors";
import { leavesUnder, occurrenceProgress, templateIndex, toggleInOccurrence } from "@/lib/tree/tree";
import { addLogEntry, logKey, removeLogEntry } from "@/features/days/services/days.service";

/**
 * Stored occurrences relevant to [from, to]: those whose original OR effective
 * date falls in the range (two single-field queries, merged).
 */
export function subscribeOccurrencesRange(uid: string, from: DateKey, to: DateKey, cb: (docs: Occurrence[]) => void): () => void {
  let a: Occurrence[] = [];
  let b: Occurrence[] = [];
  let readyA = false;
  let readyB = false;
  const emit = () => {
    if (!readyA || !readyB) return;
    const map = new Map<string, Occurrence>();
    for (const o of a) map.set(o.id, o);
    for (const o of b) map.set(o.id, o);
    cb([...map.values()]);
  };
  const onErr = (e: unknown) => {
    reportError(e);
    readyA = readyB = true;
    emit();
  };
  const u1 = onSnapshot(
    query(occurrencesCol(uid), where("originalDate", ">=", from), where("originalDate", "<=", to)),
    (s) => {
      a = s.docs.map((d) => d.data());
      readyA = true;
      emit();
    },
    onErr,
  );
  const u2 = onSnapshot(
    query(occurrencesCol(uid), where("effectiveDate", ">=", from), where("effectiveDate", "<=", to)),
    (s) => {
      b = s.docs.map((d) => d.data());
      readyB = true;
      emit();
    },
    onErr,
  );
  return () => {
    u1();
    u2();
  };
}

export function subscribeItemOccurrences(uid: string, itemId: string, cb: (docs: Occurrence[]) => void): () => void {
  return onSnapshot(
    query(occurrencesCol(uid), where("itemId", "==", itemId)),
    (s) => cb(s.docs.map((d) => d.data())),
    (e) => {
      reportError(e);
      cb([]);
    },
  );
}

export async function getItemOccurrences(uid: string, itemId: string): Promise<Occurrence[]> {
  const s = await getDocs(query(occurrencesCol(uid), where("itemId", "==", itemId)));
  return s.docs.map((d) => d.data());
}

function baseDoc(item: Item, originalDate: DateKey, existing: Occurrence | null): Occurrence {
  return (
    existing ?? {
      id: occurrenceId(item.id, originalDate),
      itemId: item.id,
      originalDate,
      effectiveDate: originalDate,
      movedToDate: null,
      startTime: null,
      endTime: null,
      status: "pending",
      done: {},
      doneCount: 0,
      totalCount: 0,
      updatedAt: 0,
    }
  );
}

function statusFrom(doneCount: number, totalCount: number, skipped: boolean): OccurrenceStatus {
  if (skipped) return "skipped";
  if (totalCount > 0 && doneCount >= totalCount) return "done";
  if (doneCount > 0) return "partial";
  return "pending";
}

function writeOcc(batch: ChunkedBatch, uid: string, o: Occurrence): void {
  const done: Record<string, ReturnType<typeof ts>> = {};
  for (const [k, v] of Object.entries(o.done)) done[k] = ts(v);
  batch.set(occurrenceDoc(uid, o.id), {
    itemId: o.itemId,
    originalDate: o.originalDate,
    effectiveDate: o.movedToDate ?? o.originalDate,
    movedToDate: o.movedToDate,
    startTime: o.startTime,
    endTime: o.endTime,
    status: o.status,
    done,
    doneCount: o.doneCount,
    totalCount: o.totalCount,
    updatedAt: serverTimestamp(),
  });
}

/** Marks or unmarks a node (or the whole occurrence with nodeId = null). */
export function toggleOccurrence(
  uid: string,
  item: Item,
  originalDate: DateKey,
  existing: Occurrence | null,
  nodeId: string | null,
  checked: boolean,
  now: Millis = Date.now(),
): void {
  const occ = baseDoc(item, originalDate, existing);
  const template = templateIndex(item.nodes, originalDate);
  const done = toggleInOccurrence(template, occ.done, nodeId, checked, now, ROOT_KEY);
  const p = occurrenceProgress(template, done, ROOT_KEY);
  const next: Occurrence = {
    ...occ,
    done,
    doneCount: p.done,
    totalCount: p.total,
    status: statusFrom(p.done, p.total, false),
  };
  const batch = new ChunkedBatch();
  writeOcc(batch, uid, next);

  // Day log: the day the occurrence is shown on.
  const day = occ.movedToDate ?? originalDate;
  const leaves = template.order.length === 0 ? [ROOT_KEY] : leavesUnder(template, nodeId);
  for (const leaf of leaves) {
    const nid = leaf === ROOT_KEY ? null : leaf;
    const key = logKey(item.id, nid, originalDate);
    const wasDone = occ.done[leaf] !== undefined;
    const isDone = done[leaf] !== undefined;
    if (isDone && !wasDone) {
      addLogEntry(batch, uid, day, key, {
        itemId: item.id,
        nodeId: nid,
        occurrenceDate: originalDate,
        title: nid ? item.nodes[nid].title : item.title,
        itemTitle: item.title,
        at: now,
      });
    } else if (!isDone && wasDone) removeLogEntry(batch, uid, day, key);
  }
  commitInBackground(batch);
}

/** Skip this time (justified; keeps the streak) or undo the skip. */
export function setOccurrenceSkipped(uid: string, item: Item, originalDate: DateKey, existing: Occurrence | null, skipped: boolean): void {
  const occ = baseDoc(item, originalDate, existing);
  const batch = new ChunkedBatch();
  writeOcc(batch, uid, { ...occ, status: statusFrom(occ.doneCount, occ.totalCount, skipped) });
  commitInBackground(batch);
}

/** Move this occurrence to another day (null = back to its original day). */
export function moveOccurrence(uid: string, item: Item, originalDate: DateKey, existing: Occurrence | null, toDate: DateKey | null): void {
  const occ = baseDoc(item, originalDate, existing);
  const movedToDate = toDate === null || toDate === originalDate ? null : toDate;
  const batch = new ChunkedBatch();
  writeOcc(batch, uid, { ...occ, movedToDate });
  commitInBackground(batch);
}

/** Change the time only for this occurrence (null, null = back to the usual time). */
export function setOccurrenceTime(
  uid: string,
  item: Item,
  originalDate: DateKey,
  existing: Occurrence | null,
  startTime: TimeKey | null,
  endTime: TimeKey | null,
): void {
  const occ = baseDoc(item, originalDate, existing);
  const batch = new ChunkedBatch();
  writeOcc(batch, uid, { ...occ, startTime, endTime });
  commitInBackground(batch);
}

/** Change the date and the time of one occurrence at once (drag & drop, M7 "only this"). */
export function rescheduleOccurrence(
  uid: string,
  item: Item,
  originalDate: DateKey,
  existing: Occurrence | null,
  toDate: DateKey,
  startTime: TimeKey | null,
  endTime: TimeKey | null,
): void {
  const occ = baseDoc(item, originalDate, existing);
  const movedToDate = toDate === originalDate ? null : toDate;
  const batch = new ChunkedBatch();
  writeOcc(batch, uid, { ...occ, movedToDate, startTime, endTime });
  commitInBackground(batch);
}

export function deleteOccurrenceDoc(uid: string, id: string): void {
  deleteDoc(occurrenceDoc(uid, id)).catch(reportError);
}
