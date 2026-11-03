// Recurrence engine — pure, no Firebase. Semantics documented in docs/DATA_MODEL.md.

import type { DateKey, Pause, RecurrenceRule, Weekday } from "@/types/models";
import { addDays, diffDays, weekdayOf, weeksBetween } from "@/lib/date/dateKey";

/** Hard cap so a malformed rule can never loop forever. */
const MAX_SCAN_DAYS = 366 * 30;

function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

/** Does the rule pattern produce `date`? Ignores the end condition and pauses. */
export function patternMatches(rule: RecurrenceRule, date: DateKey): boolean {
  if (date < rule.startDate) return false;
  const wd = weekdayOf(date);
  switch (rule.type) {
    case "daily":
      return true;
    case "weekdays":
      return (rule.weekdays ?? []).includes(wd);
    case "every_n_days": {
      const n = Math.max(1, rule.interval ?? 1);
      return diffDays(rule.startDate, date) % n === 0;
    }
    case "every_n_weeks": {
      const n = Math.max(1, rule.interval ?? 1);
      const weeks = weeksBetween(rule.startDate, date);
      return mod(weeks, n) === 0 && (rule.weekdays ?? []).includes(wd);
    }
    case "week_cycle": {
      const cycle = rule.cycle ?? [];
      if (cycle.length === 0) return false;
      const idx = mod(weeksBetween(rule.startDate, date), cycle.length);
      return cycle[idx].weekdays.includes(wd);
    }
  }
}

export function isPaused(pauses: Pause[], date: DateKey): boolean {
  return pauses.some((p) => date >= p.from && (p.to === null || date <= p.to));
}

/** Can the rule produce any date at all? */
export function ruleHasDays(rule: RecurrenceRule): boolean {
  switch (rule.type) {
    case "daily":
    case "every_n_days":
      return true;
    case "weekdays":
    case "every_n_weeks":
      return (rule.weekdays ?? []).length > 0;
    case "week_cycle":
      return (rule.cycle ?? []).some((w) => w.weekdays.length > 0);
  }
}

/**
 * Last date the rule can produce, or null if it never ends.
 * For "count" rules, the N-th generated (non-paused) date.
 */
export function effectiveEndDate(rule: RecurrenceRule, pauses: Pause[] = []): DateKey | null {
  if (rule.endType === "date") return rule.endDate;
  if (rule.endType === "never") return null;
  const count = Math.max(1, rule.endCount ?? 1);
  if (!ruleHasDays(rule)) return rule.startDate;
  let seen = 0;
  let d = rule.startDate;
  for (let i = 0; i < MAX_SCAN_DAYS; i++, d = addDays(d, 1)) {
    if (patternMatches(rule, d) && !isPaused(pauses, d)) {
      seen++;
      if (seen === count) return d;
    }
  }
  return d;
}

export interface RuleContext {
  rule: RecurrenceRule;
  pauses: Pause[];
  /** Cached result of effectiveEndDate. */
  end: DateKey | null;
}

export function ruleContext(rule: RecurrenceRule, pauses: Pause[] = []): RuleContext {
  return { rule, pauses, end: effectiveEndDate(rule, pauses) };
}

/** Is `date` an occurrence of the rule (end condition and pauses included)? */
export function occursOn(ctx: RuleContext, date: DateKey): boolean {
  if (ctx.end !== null && date > ctx.end) return false;
  if (isPaused(ctx.pauses, date)) return false;
  return patternMatches(ctx.rule, date);
}

/** All occurrence dates in [from, to] (inclusive). */
export function datesBetween(ctx: RuleContext, from: DateKey, to: DateKey): DateKey[] {
  const out: DateKey[] = [];
  let start = from < ctx.rule.startDate ? ctx.rule.startDate : from;
  const last = ctx.end !== null && ctx.end < to ? ctx.end : to;
  if (start > last || !ruleHasDays(ctx.rule)) return out;
  for (let d = start, i = 0; d <= last && i < MAX_SCAN_DAYS; d = addDays(d, 1), i++) {
    if (occursOn(ctx, d)) out.push(d);
  }
  return out;
}

/** Next `n` occurrence dates on or after `from` (for the editor preview). */
export function nextDates(ctx: RuleContext, from: DateKey, n: number): DateKey[] {
  const out: DateKey[] = [];
  if (!ruleHasDays(ctx.rule)) return out;
  let d = from < ctx.rule.startDate ? ctx.rule.startDate : from;
  for (let i = 0; i < MAX_SCAN_DAYS && out.length < n; i++, d = addDays(d, 1)) {
    if (ctx.end !== null && d > ctx.end) break;
    if (occursOn(ctx, d)) out.push(d);
  }
  return out;
}

/** Most recent occurrence date strictly before `date`, or null. */
export function previousDate(ctx: RuleContext, date: DateKey, maxBack = 400): DateKey | null {
  let d = addDays(date, -1);
  for (let i = 0; i < maxBack && d >= ctx.rule.startDate; i++, d = addDays(d, -1)) {
    if (occursOn(ctx, d)) return d;
  }
  return null;
}

export function sortWeekdays(days: Weekday[]): Weekday[] {
  return [...new Set(days)].sort((a, b) => a - b);
}
