// Firestore ⇄ domain converters. Timestamps become epoch millis in the domain.

import {
  Timestamp,
  type DocumentData,
  type FirestoreDataConverter,
  type QueryDocumentSnapshot,
  type SnapshotOptions,
} from "firebase/firestore";
import type { Day, DayLogEntry, Item, NodeMap, Occurrence, Placement, TreeNode } from "@/types/models";
import { toDateKey } from "@/lib/date/dateKey";

export function toMillis(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Timestamp) return v.toMillis();
  if (typeof v === "number") return v;
  if (typeof v === "object" && v !== null && "seconds" in v) {
    const s = v as { seconds: number; nanoseconds?: number };
    return s.seconds * 1000 + Math.floor((s.nanoseconds ?? 0) / 1e6);
  }
  return null;
}

export function ts(ms: number): Timestamp {
  return Timestamp.fromMillis(ms);
}

export function tsOrNull(ms: number | null): Timestamp | null {
  return ms === null ? null : Timestamp.fromMillis(ms);
}

function readData(snap: QueryDocumentSnapshot, options?: SnapshotOptions): DocumentData {
  return snap.data({ ...options, serverTimestamps: "estimate" });
}

function nodeFromDb(d: DocumentData): TreeNode {
  return {
    parentId: d.parentId ?? null,
    title: d.title ?? "",
    position: typeof d.position === "number" ? d.position : 0,
    notes: d.notes ?? null,
    dueDate: d.dueDate ?? null,
    estimateMin: d.estimateMin ?? null,
    completedAt: toMillis(d.completedAt),
    completedOn: d.completedOn ?? null,
    weekdays: Array.isArray(d.weekdays) ? d.weekdays : null,
    addedOn: d.addedOn ?? "1970-01-01",
    removedOn: d.removedOn ?? null,
  };
}

export function nodeToDb(n: TreeNode): DocumentData {
  return { ...n, completedAt: tsOrNull(n.completedAt) };
}

export function nodesToDb(nodes: NodeMap): DocumentData {
  const out: DocumentData = {};
  for (const [id, n] of Object.entries(nodes)) out[id] = nodeToDb(n);
  return out;
}

export function itemFromDb(id: string, d: DocumentData): Item {
  const nodes: NodeMap = {};
  for (const [nid, raw] of Object.entries((d.nodes ?? {}) as Record<string, DocumentData>)) {
    if (raw) nodes[nid] = nodeFromDb(raw);
  }
  const createdAt = toMillis(d.createdAt) ?? Date.now();
  return {
    id,
    title: d.title ?? "",
    notes: d.notes ?? null,
    color: d.color ?? null,
    category: d.category ?? null,
    scheduleMode: d.scheduleMode ?? "none",
    timeMode: d.timeMode ?? "none",
    startTime: d.startTime ?? null,
    endTime: d.endTime ?? null,
    recurrence: d.recurrence ?? null,
    pauses: Array.isArray(d.pauses) ? d.pauses : [],
    completion: d.completion ?? "check",
    background: !!d.background,
    status: d.status ?? "active",
    statusChangedAt: toMillis(d.statusChangedAt) ?? createdAt,
    dueDate: d.dueDate ?? null,
    estimateMin: d.estimateMin ?? null,
    completedAt: toMillis(d.completedAt),
    completedOn: d.completedOn ?? null,
    nodes,
    pinned: !!d.pinned,
    pinnedPosition: d.pinnedPosition ?? null,
    splitFromItemId: d.splitFromItemId ?? null,
    createdOn: d.createdOn ?? toDateKey(new Date(createdAt)),
    createdAt,
    updatedAt: toMillis(d.updatedAt) ?? createdAt,
  };
}

export const itemConverter: FirestoreDataConverter<Item> = {
  toFirestore: (item) => {
    const { id: _id, ...rest } = item as Item;
    return { ...rest, nodes: nodesToDb(rest.nodes) };
  },
  fromFirestore: (snap, options) => itemFromDb(snap.id, readData(snap, options)),
};

export const placementConverter: FirestoreDataConverter<Placement> = {
  toFirestore: (p) => {
    const { id: _id, ...rest } = p as Placement;
    return rest;
  },
  fromFirestore: (snap, options) => {
    const d = readData(snap, options);
    return {
      id: snap.id,
      itemId: d.itemId,
      nodeId: d.nodeId ?? null,
      date: d.date,
      timeMode: d.timeMode ?? "none",
      startTime: d.startTime ?? null,
      endTime: d.endTime ?? null,
      position: d.position ?? 0,
      dismissed: !!d.dismissed,
      open: !!d.open,
      createdAt: toMillis(d.createdAt) ?? 0,
      updatedAt: toMillis(d.updatedAt) ?? 0,
    };
  },
};

export const occurrenceConverter: FirestoreDataConverter<Occurrence> = {
  toFirestore: (o) => {
    const { id: _id, ...rest } = o as Occurrence;
    return rest;
  },
  fromFirestore: (snap, options) => {
    const d = readData(snap, options);
    const done: Record<string, number> = {};
    for (const [k, v] of Object.entries((d.done ?? {}) as Record<string, unknown>)) {
      const ms = toMillis(v);
      if (ms !== null) done[k] = ms;
    }
    return {
      id: snap.id,
      itemId: d.itemId,
      originalDate: d.originalDate,
      effectiveDate: d.effectiveDate ?? d.originalDate,
      movedToDate: d.movedToDate ?? null,
      startTime: d.startTime ?? null,
      endTime: d.endTime ?? null,
      status: d.status ?? "pending",
      done,
      doneCount: d.doneCount ?? 0,
      totalCount: d.totalCount ?? 0,
      updatedAt: toMillis(d.updatedAt) ?? 0,
    };
  },
};

export const dayConverter: FirestoreDataConverter<Day> = {
  toFirestore: (day) => {
    const { ...rest } = day as Day;
    return rest;
  },
  fromFirestore: (snap, options) => {
    const d = readData(snap, options);
    const log: Record<string, DayLogEntry> = {};
    for (const [k, v] of Object.entries((d.log ?? {}) as Record<string, DocumentData>)) {
      if (!v) continue;
      log[k] = {
        itemId: v.itemId,
        nodeId: v.nodeId ?? null,
        occurrenceDate: v.occurrenceDate ?? null,
        title: v.title ?? "",
        itemTitle: v.itemTitle ?? "",
        at: toMillis(v.at) ?? 0,
      };
    }
    return {
      date: d.date ?? snap.id,
      note: d.note ?? null,
      log,
      updatedAt: toMillis(d.updatedAt) ?? 0,
    };
  },
};
