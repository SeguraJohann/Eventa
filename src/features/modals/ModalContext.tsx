import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { DateKey, Placement, RecurrenceRule, TimeKey } from "@/types/models";
import type { EditorRow } from "@/lib/tree/tree";

/** Every intermediate view (M1–M14 and helpers). */
export type ModalSpec =
  | { type: "addToDay"; date: DateKey; startTime?: TimeKey; endTime?: TimeKey }
  | { type: "itemForm"; mode: "create"; date?: DateKey; startTime?: TimeKey; endTime?: TimeKey }
  | { type: "itemForm"; mode: "edit"; itemId: string; fromOccurrence?: { originalDate: DateKey } }
  | { type: "recurrence"; rule: RecurrenceRule; onDone: (rule: RecurrenceRule) => void }
  | { type: "place"; date?: DateKey; itemId?: string; nodeId?: string | null; startTime?: TimeKey; endTime?: TimeKey }
  | { type: "occurrence"; itemId: string; originalDate: DateKey }
  | { type: "scope"; date: DateKey; onPick: (scope: "only" | "following" | "all") => void; allowOnly: boolean }
  | { type: "itemMenu"; itemId: string }
  | { type: "subtask"; itemId: string; nodeId: string }
  | { type: "moveNode"; itemId: string; nodeId: string }
  | { type: "pastOccurrence"; itemId: string; originalDate: DateKey }
  | { type: "confirm"; title: string; lines: string[]; confirmLabel: string; danger?: boolean; onConfirm: () => void }
  | { type: "completed"; itemId: string }
  | { type: "reschedule"; placement: Placement }
  | { type: "dayNote"; date: DateKey }
  | { type: "paste"; onAdd: (rows: EditorRow[]) => void }
  | { type: "pickDate"; title: string; initial: DateKey; onPick: (date: DateKey) => void }
  | { type: "pickTime"; title: string; startTime: TimeKey; endTime: TimeKey; onPick: (start: TimeKey, end: TimeKey) => void };

interface Entry {
  id: number;
  spec: ModalSpec;
}

interface ModalContextValue {
  stack: Entry[];
  open: (spec: ModalSpec) => void;
  /** Closes the top-most modal. */
  close: () => void;
  /** Replaces the top-most modal (e.g. M1 → M2). */
  replace: (spec: ModalSpec) => void;
  closeAll: () => void;
}

const ModalContext = createContext<ModalContextValue | null>(null);
let seq = 0;

export function ModalProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<Entry[]>([]);
  const open = useCallback((spec: ModalSpec) => setStack((s) => [...s, { id: ++seq, spec }]), []);
  const close = useCallback(() => setStack((s) => s.slice(0, -1)), []);
  const replace = useCallback((spec: ModalSpec) => setStack((s) => [...s.slice(0, -1), { id: ++seq, spec }]), []);
  const closeAll = useCallback(() => setStack([]), []);
  const value = useMemo(() => ({ stack, open, close, replace, closeAll }), [stack, open, close, replace, closeAll]);
  return <ModalContext.Provider value={value}>{children}</ModalContext.Provider>;
}

export function useModals(): ModalContextValue {
  const ctx = useContext(ModalContext);
  if (!ctx) throw new Error("useModals must be used inside ModalProvider");
  return ctx;
}
