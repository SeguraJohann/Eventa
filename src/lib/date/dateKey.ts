// DateKey helpers. All arithmetic is done on calendar dates (UTC math on Y-M-D),
// so the result never depends on the host time zone or DST.
// Never use `toISOString()` to derive a local day.

import type { DateKey, TimeKey, Weekday } from "@/types/models";

const DAY_MS = 86_400_000;

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Local calendar day of a JS Date (device time zone). */
export function toDateKey(date: Date): DateKey {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayKey(now: Date = new Date()): DateKey {
  return toDateKey(now);
}

export function parseDateKey(key: DateKey): { y: number; m: number; d: number } {
  const [y, m, d] = key.split("-").map(Number);
  return { y, m, d };
}

function toUtcMs(key: DateKey): number {
  const { y, m, d } = parseDateKey(key);
  return Date.UTC(y, m - 1, d);
}

function fromUtcMs(ms: number): DateKey {
  const dt = new Date(ms);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function isValidDateKey(key: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  return fromUtcMs(toUtcMs(key)) === key;
}

export function addDays(key: DateKey, n: number): DateKey {
  return fromUtcMs(toUtcMs(key) + n * DAY_MS);
}

/** b - a in whole days. */
export function diffDays(a: DateKey, b: DateKey): number {
  return Math.round((toUtcMs(b) - toUtcMs(a)) / DAY_MS);
}

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export function weekdayOf(key: DateKey): Weekday {
  const js = new Date(toUtcMs(key)).getUTCDay(); // 0 = Sunday
  return (js === 0 ? 7 : js) as Weekday;
}

/** Monday of the week containing `key`. */
export function startOfWeek(key: DateKey): DateKey {
  return addDays(key, 1 - weekdayOf(key));
}

/** Whole weeks between the Mondays of a and b (b - a). */
export function weeksBetween(a: DateKey, b: DateKey): number {
  return Math.round(diffDays(startOfWeek(a), startOfWeek(b)) / 7);
}

export function startOfMonth(key: DateKey): DateKey {
  const { y, m } = parseDateKey(key);
  return `${y}-${pad(m)}-01`;
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function endOfMonth(key: DateKey): DateKey {
  const { y, m } = parseDateKey(key);
  return `${y}-${pad(m)}-${pad(daysInMonth(y, m))}`;
}

export function addMonths(key: DateKey, n: number): DateKey {
  const { y, m, d } = parseDateKey(key);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${pad(nm)}-${pad(Math.min(d, daysInMonth(ny, nm)))}`;
}

/** Inclusive list of days from a to b. */
export function eachDay(a: DateKey, b: DateKey): DateKey[] {
  const out: DateKey[] = [];
  for (let k = a; k <= b; k = addDays(k, 1)) out.push(k);
  return out;
}

/** 6×7 grid (Monday first) covering the month of `key`. */
export function monthGrid(key: DateKey): DateKey[] {
  const first = startOfWeek(startOfMonth(key));
  return Array.from({ length: 42 }, (_, i) => addDays(first, i));
}

export function minDateKey(a: DateKey, b: DateKey): DateKey {
  return a < b ? a : b;
}

export function maxDateKey(a: DateKey, b: DateKey): DateKey {
  return a > b ? a : b;
}

// ---------- time ----------

export function timeToMinutes(t: TimeKey): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTime(min: number): TimeKey {
  const clamped = Math.max(0, Math.min(24 * 60, Math.round(min)));
  return `${pad(Math.floor(clamped / 60))}:${pad(clamped % 60)}`;
}

export function nowMinutes(now: Date = new Date()): number {
  return now.getHours() * 60 + now.getMinutes();
}

export function addMinutesToTime(t: TimeKey, min: number): TimeKey {
  return minutesToTime(timeToMinutes(t) + min);
}

export function isValidTimeKey(t: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(t)) return false;
  const [h, m] = t.split(":").map(Number);
  return (h < 24 && m < 60) || (h === 24 && m === 0);
}
