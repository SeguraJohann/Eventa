// Domain types — exact mirror of docs/DATA_MODEL.md.
// Firestore Timestamps are represented as epoch milliseconds (`Millis`) in the
// domain; the converters in lib/firebase translate them.

/** "YYYY-MM-DD" in local time (America/Costa_Rica). */
export type DateKey = string;
/** "HH:mm", 24 h. `"24:00"` is allowed as an end time. */
export type TimeKey = string;
/** 1 = Monday … 7 = Sunday (ISO). */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;
/** Epoch milliseconds. */
export type Millis = number;

export type Category = "task" | "project" | "event";
export type ScheduleMode = "none" | "days" | "repeat";
export type TimeMode = "none" | "all_day" | "timed";
export type Completion = "check" | "block";
export type ItemStatus = "active" | "paused" | "done" | "archived";

export type ColorKey = "blue" | "orange" | "teal" | "violet" | "rose" | "slate" | "green";

export type RecurrenceType = "daily" | "weekdays" | "every_n_days" | "every_n_weeks" | "week_cycle";
export type RecurrenceEndType = "never" | "date" | "count";

export interface RecurrenceRule {
  type: RecurrenceType;
  weekdays: Weekday[] | null;
  interval: number | null;
  cycle: { weekdays: Weekday[] }[] | null;
  startDate: DateKey;
  endType: RecurrenceEndType;
  endDate: DateKey | null;
  endCount: number | null;
}

export interface Pause {
  from: DateKey;
  /** Inclusive last paused day; null = still paused. */
  to: DateKey | null;
}

export interface TreeNode {
  parentId: string | null;
  title: string;
  position: number;
  notes: string | null;
  dueDate: DateKey | null;
  estimateMin: number | null;
  completedAt: Millis | null;
  completedOn: DateKey | null;
  weekdays: Weekday[] | null;
  addedOn: DateKey;
  removedOn: DateKey | null;
}

export type NodeMap = Record<string, TreeNode>;

export interface Item {
  id: string;
  title: string;
  notes: string | null;
  color: ColorKey | null;
  category: Category | null;
  scheduleMode: ScheduleMode;
  timeMode: TimeMode;
  startTime: TimeKey | null;
  endTime: TimeKey | null;
  recurrence: RecurrenceRule | null;
  pauses: Pause[];
  completion: Completion;
  background: boolean;
  status: ItemStatus;
  statusChangedAt: Millis;
  dueDate: DateKey | null;
  estimateMin: number | null;
  completedAt: Millis | null;
  completedOn: DateKey | null;
  nodes: NodeMap;
  pinned: boolean;
  pinnedPosition: number | null;
  splitFromItemId: string | null;
  /** Local day the item was created (derived from createdAt). */
  createdOn: DateKey;
  createdAt: Millis;
  updatedAt: Millis;
}

export interface Placement {
  id: string;
  itemId: string;
  /** null = the root event. */
  nodeId: string | null;
  date: DateKey;
  timeMode: TimeMode;
  startTime: TimeKey | null;
  endTime: TimeKey | null;
  position: number;
  dismissed: boolean;
  open: boolean;
  createdAt: Millis;
  updatedAt: Millis;
}

export type OccurrenceStatus = "pending" | "partial" | "done" | "skipped";
/** Computed status (adds "missed", never stored). */
export type OccurrenceState = OccurrenceStatus | "missed";

export const ROOT_KEY = "_root";

export interface Occurrence {
  /** `${itemId}_${originalDate}` */
  id: string;
  itemId: string;
  originalDate: DateKey;
  effectiveDate: DateKey;
  movedToDate: DateKey | null;
  startTime: TimeKey | null;
  endTime: TimeKey | null;
  status: OccurrenceStatus;
  /** Completed leaves (or ROOT_KEY when the item has no subtasks). */
  done: Record<string, Millis>;
  doneCount: number;
  totalCount: number;
  updatedAt: Millis;
}

export interface DayLogEntry {
  itemId: string;
  nodeId: string | null;
  occurrenceDate: DateKey | null;
  title: string;
  itemTitle: string;
  at: Millis;
}

export interface Day {
  date: DateKey;
  note: string | null;
  log: Record<string, DayLogEntry>;
  updatedAt: Millis;
}

export interface UserProfile {
  email: string;
  displayName: string;
  photoURL: string | null;
  timezone: string;
}

export const occurrenceId = (itemId: string, originalDate: DateKey) => `${itemId}_${originalDate}`;
