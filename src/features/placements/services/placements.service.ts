import { getDocs, onSnapshot, query, serverTimestamp, where, type DocumentData, type Query } from "firebase/firestore";
import type { DateKey, Item, Placement, TimeKey, TimeMode } from "@/types/models";
import { placementDoc, placementsCol } from "@/lib/firebase/collections";
import { ChunkedBatch, commitInBackground } from "@/lib/firebase/batch";
import { reportError } from "@/lib/utils/errors";
import { newDocId } from "@/lib/utils/id";
import { placementShouldBeOpen } from "@/lib/agenda/items";

export interface PlacementInput {
  itemId: string;
  nodeId: string | null;
  date: DateKey;
  timeMode: TimeMode;
  startTime: TimeKey | null;
  endTime: TimeKey | null;
}

function listen(q: Query<Placement, DocumentData>, cb: (list: Placement[]) => void): () => void {
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => d.data())),
    (e) => {
      reportError(e);
      cb([]);
    },
  );
}

export function subscribePlacementsRange(uid: string, from: DateKey, to: DateKey, cb: (list: Placement[]) => void) {
  return listen(query(placementsCol(uid), where("date", ">=", from), where("date", "<=", to)), cb);
}

export function subscribeOpenPlacements(uid: string, cb: (list: Placement[]) => void) {
  return listen(query(placementsCol(uid), where("open", "==", true)), cb);
}

export function subscribeItemPlacements(uid: string, itemId: string, cb: (list: Placement[]) => void) {
  return listen(query(placementsCol(uid), where("itemId", "==", itemId)), cb);
}

export async function getItemPlacements(uid: string, itemId: string): Promise<Placement[]> {
  const snap = await getDocs(query(placementsCol(uid), where("itemId", "==", itemId)));
  return snap.docs.map((d) => d.data());
}

function cleanTimes(input: Pick<PlacementInput, "timeMode" | "startTime" | "endTime">) {
  return input.timeMode === "timed"
    ? { timeMode: "timed" as const, startTime: input.startTime, endTime: input.endTime }
    : { timeMode: input.timeMode, startTime: null, endTime: null };
}

/** Adds a placement write to an existing batch. Returns its id. */
export function addPlacementToBatch(batch: ChunkedBatch, uid: string, item: Item, input: PlacementInput, position: number): string {
  const id = newDocId(uid);
  batch.set(placementDoc(uid, id), {
    itemId: input.itemId,
    nodeId: input.nodeId,
    date: input.date,
    ...cleanTimes(input),
    position,
    dismissed: false,
    open: placementShouldBeOpen(item, { nodeId: input.nodeId, dismissed: false }),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return id;
}

export function createPlacement(uid: string, item: Item, input: PlacementInput): string {
  const batch = new ChunkedBatch();
  const id = addPlacementToBatch(batch, uid, item, input, Date.now());
  commitInBackground(batch);
  return id;
}

export interface PlacementPatch {
  date?: DateKey;
  timeMode?: TimeMode;
  startTime?: TimeKey | null;
  endTime?: TimeKey | null;
  position?: number;
}

export function updatePlacement(uid: string, p: Placement, patch: PlacementPatch): void {
  const merged = { ...p, ...patch };
  const batch = new ChunkedBatch();
  batch.update(placementDoc(uid, p.id), {
    date: merged.date,
    ...cleanTimes(merged),
    position: merged.position,
    updatedAt: serverTimestamp(),
  });
  commitInBackground(batch);
}

/** "Pasar a hoy" / reschedule a past pending placement. */
export function reschedulePlacement(uid: string, p: Placement, date: DateKey, time?: { timeMode: TimeMode; startTime: TimeKey | null; endTime: TimeKey | null }): void {
  updatePlacement(uid, p, { date, ...(time ?? {}) });
}

export function dismissPlacement(uid: string, p: Placement): void {
  const batch = new ChunkedBatch();
  batch.update(placementDoc(uid, p.id), { dismissed: true, open: false, updatedAt: serverTimestamp() });
  commitInBackground(batch);
}

export function deletePlacement(uid: string, id: string): void {
  const batch = new ChunkedBatch();
  batch.delete(placementDoc(uid, id));
  commitInBackground(batch);
}

/** Adds `open` corrections for the item's placements to a batch. */
export function syncPlacementsOpen(batch: ChunkedBatch, uid: string, item: Item, placements: Placement[]): void {
  for (const p of placements) {
    if (p.itemId !== item.id) continue;
    const open = placementShouldBeOpen(item, p);
    if (open !== p.open) batch.update(placementDoc(uid, p.id), { open, updatedAt: serverTimestamp() });
  }
}
