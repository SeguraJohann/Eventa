// Human-readable dates and durations (Spanish, 24 h, week starts Monday).

import type { DateKey, RecurrenceRule, Weekday } from "@/types/models";
import { es, fmt, capitalize } from "@/i18n";
import { addDays, diffDays, parseDateKey, todayKey, weekdayOf } from "./dateKey";

const D = es.dates;

export function weekdayName(key: DateKey): string {
  return D.weekdays[weekdayOf(key) - 1];
}

/** "2 de noviembre" (adds the year when it is not the current one). */
export function longDate(key: DateKey, today: DateKey = todayKey()): string {
  const { y, m, d } = parseDateKey(key);
  const ty = parseDateKey(today).y;
  return y === ty ? fmt(D.longDate, { d, month: D.months[m - 1] }) : fmt(D.longDateYear, { d, month: D.months[m - 1], y });
}

/** "lun 2 nov" */
export function shortDate(key: DateKey): string {
  const { m, d } = parseDateKey(key);
  return fmt(D.shortDate, { wd: D.weekdaysShort[weekdayOf(key) - 1], d, month: D.monthsShort[m - 1] });
}

/** "2 nov" */
export function dayMonth(key: DateKey): string {
  const { m, d } = parseDateKey(key);
  return `${d} ${D.monthsShort[m - 1]}`;
}

/** "Hoy" / "Mañana" / "Ayer" / "lun 2 nov". */
export function relativeDate(key: DateKey, today: DateKey = todayKey(), capital = true): string {
  const diff = diffDays(today, key);
  if (diff === 0) return capital ? D.Today : D.today;
  if (diff === 1) return capital ? D.Tomorrow : D.tomorrow;
  if (diff === -1) return capital ? D.Yesterday : D.yesterday;
  return shortDate(key);
}

/** "Hoy, lun 2 nov" style label for day rows. */
export function dayRowLabel(key: DateKey, today: DateKey = todayKey()): string {
  const diff = diffDays(today, key);
  if (diff >= -1 && diff <= 1) return `${relativeDate(key, today)}, ${shortDate(key)}`;
  return capitalize(shortDate(key));
}

/** "Noviembre 2026" */
export function monthYear(key: DateKey): string {
  const { y, m } = parseDateKey(key);
  return capitalize(fmt(D.monthYear, { month: D.months[m - 1], y }));
}

export function formatDuration(min: number): string {
  if (min < 60) return fmt(es.time.minutes, { n: min });
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (m === 0) return fmt(es.time.hours, { n: h });
  return fmt(es.time.hoursMinutes, { h, m });
}

/** Parses "2 h", "1.5h", "30 min", "1h 30m", "90" → minutes. */
export function parseEstimate(text: string): number | null {
  const s = text.trim().toLowerCase().replace(",", ".");
  if (s === "") return null;
  let total = 0;
  let matched = false;
  const re = /(\d+(?:\.\d+)?)\s*(h|hr|hrs|hora|horas|m|min|mins|minutos?)?/g;
  for (const m of s.matchAll(re)) {
    const n = Number(m[1]);
    if (Number.isNaN(n)) continue;
    matched = true;
    const unit = m[2] ?? (s.includes("h") ? "h" : "min");
    total += unit.startsWith("h") ? n * 60 : n;
  }
  if (!matched) return null;
  const rounded = Math.round(total);
  return rounded > 0 ? rounded : null;
}

export function formatTime(t: string): string {
  // "09:00" → "9:00" like the maqueta.
  return t.startsWith("0") ? t.slice(1) : t;
}

export function formatTimeRange(start: string | null, end: string | null): string {
  if (!start) return "";
  return end ? `${formatTime(start)}–${formatTime(end)}` : formatTime(start);
}

/** "lunes, martes y miércoles" (plural for single day: "sábados"). */
export function weekdaysLong(days: Weekday[]): string {
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.length === 1) return D.weekdaysPlural[sorted[0] - 1];
  const names = sorted.map((d) => D.weekdays[d - 1]);
  if (names.length === 0) return "";
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} ${D.and} ${names[names.length - 1]}`;
}

/** "L M X" */
export function weekdaysLetters(days: Weekday[]): string {
  return [...days]
    .sort((a, b) => a - b)
    .map((d) => D.weekdaysLetter[d - 1])
    .join(" ");
}

// ---------- recurrence summaries ----------

const R = es.recurrence;
const LETTERS = "ABCDEFGHIJ";

export function cycleLetter(i: number): string {
  return LETTERS[i] ?? String(i + 1);
}

/** Main line: "Cada semana, sábados". */
export function ruleSummary(rule: RecurrenceRule): string {
  switch (rule.type) {
    case "daily":
      return R.sumDaily;
    case "weekdays":
      return fmt(R.sumWeekdays, { days: weekdaysLong(rule.weekdays ?? []) });
    case "every_n_days":
      return fmt(R.sumEveryNDays, { n: rule.interval ?? 1 });
    case "every_n_weeks":
      return fmt(R.sumEveryNWeeks, { n: rule.interval ?? 1, days: weekdaysLong(rule.weekdays ?? []) });
    case "week_cycle":
      return fmt(R.sumCycle, { n: (rule.cycle ?? []).length });
  }
}

/** Secondary line: "Desde el 7 nov · sin fin". */
export function ruleRangeSummary(rule: RecurrenceRule): string {
  const from = fmt(R.sumFrom, { date: dayMonth(rule.startDate) });
  let end: string = R.sumNoEnd;
  if (rule.endType === "date" && rule.endDate) end = fmt(R.sumUntil, { date: dayMonth(rule.endDate) });
  if (rule.endType === "count") end = fmt(R.sumTimes, { n: rule.endCount ?? 1 });
  return `${from} · ${end}`;
}

/** Compact tag for lists: "↻ sábados", "↻ L M X", "↻ ciclo A: L M X · B: L M". */
export function ruleTag(rule: RecurrenceRule): string {
  switch (rule.type) {
    case "daily":
      return R.tagDaily;
    case "weekdays": {
      const days = rule.weekdays ?? [];
      return days.length === 1 ? D.weekdaysPlural[days[0] - 1] : weekdaysLetters(days);
    }
    case "every_n_days":
      return fmt(R.tagEveryNDays, { n: rule.interval ?? 1 });
    case "every_n_weeks":
      return fmt(R.tagEveryNWeeks, { n: rule.interval ?? 1, days: weekdaysLetters(rule.weekdays ?? []) });
    case "week_cycle":
      return fmt(R.shortCycle, {
        weeks: (rule.cycle ?? []).map((w, i) => fmt(R.weekLetter, { letter: cycleLetter(i), days: weekdaysLetters(w.weekdays) })).join(" · "),
      });
  }
}

export function upcomingList(dates: DateKey[]): string {
  return dates.map(shortDate).join(", ");
}

export function nextDayKey(key: DateKey): DateKey {
  return addDays(key, 1);
}
