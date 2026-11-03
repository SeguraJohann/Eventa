import { deleteField, getDoc, onSnapshot, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import type { DateKey, Day, DayLogEntry } from "@/types/models";
import { dayDoc, daysCol } from "@/lib/firebase/collections";
import { ts } from "@/lib/firebase/converters";
import type { ChunkedBatch } from "@/lib/firebase/batch";
import { reportError } from "@/lib/utils/errors";
import { dayConverter } from "@/lib/firebase/converters";

export function logKey(itemId: string, nodeId: string | null, occurrenceDate: DateKey | null = null): string {
  const base = `${itemId}_${nodeId ?? "_root"}`;
  return occurrenceDate ? `${base}_${occurrenceDate}` : base;
}

export function addLogEntry(batch: ChunkedBatch, uid: string, date: DateKey, key: string, entry: DayLogEntry): void {
  batch.set(
    dayDoc(uid, date),
    { date, log: { [key]: { ...entry, at: ts(entry.at) } }, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

export function removeLogEntry(batch: ChunkedBatch, uid: string, date: DateKey, key: string): void {
  batch.set(dayDoc(uid, date), { date, log: { [key]: deleteField() }, updatedAt: serverTimestamp() }, { merge: true });
}

export function subscribeDay(uid: string, date: DateKey, cb: (day: Day | null) => void): () => void {
  return onSnapshot(
    dayDoc(uid, date).withConverter(dayConverter),
    (snap) => cb(snap.exists() ? snap.data() : null),
    (e) => {
      reportError(e);
      cb(null);
    },
  );
}

export function subscribeDaysRange(uid: string, from: DateKey, to: DateKey, cb: (days: Day[]) => void): () => void {
  return onSnapshot(
    query(daysCol(uid), where("date", ">=", from), where("date", "<=", to)),
    (snap) => cb(snap.docs.map((d) => d.data())),
    (e) => {
      reportError(e);
      cb([]);
    },
  );
}

export function setDayNote(uid: string, date: DateKey, note: string): void {
  const text = note.trim();
  setDoc(dayDoc(uid, date), { date, note: text === "" ? null : text, updatedAt: serverTimestamp() }, { merge: true }).catch(reportError);
}

export async function getDay(uid: string, date: DateKey): Promise<Day | null> {
  const snap = await getDoc(dayDoc(uid, date).withConverter(dayConverter));
  return snap.exists() ? snap.data() : null;
}
