import { describe, expect, it } from "vitest";
import type { Item, Occurrence, RecurrenceRule } from "@/types/models";
import { occurrenceId } from "@/types/models";
import { datesBetween, effectiveEndDate, nextDates, ruleContext } from "./engine";
import { computeStats, historyOf, occurrencesInRange } from "./occurrences";
import { weekdayOf } from "@/lib/date/dateKey";

const rule = (r: Partial<RecurrenceRule>): RecurrenceRule => ({
  type: "daily",
  weekdays: null,
  interval: null,
  cycle: null,
  startDate: "2026-11-02", // Monday
  endType: "never",
  endDate: null,
  endCount: null,
  ...r,
});

const item = (r: RecurrenceRule, extra: Partial<Item> = {}): Item => ({
  id: "gym",
  title: "Gimnasio",
  notes: null,
  color: null,
  category: null,
  scheduleMode: "repeat",
  timeMode: "timed",
  startTime: "18:30",
  endTime: "19:30",
  recurrence: r,
  pauses: [],
  completion: "check",
  background: false,
  status: "active",
  statusChangedAt: 0,
  dueDate: null,
  estimateMin: null,
  completedAt: null,
  completedOn: null,
  nodes: {},
  pinned: false,
  pinnedPosition: null,
  splitFromItemId: null,
  createdOn: "2026-11-01",
  createdAt: 0,
  updatedAt: 0,
  ...extra,
});

const occ = (originalDate: string, o: Partial<Occurrence>): Occurrence => ({
  id: occurrenceId("gym", originalDate),
  itemId: "gym",
  originalDate,
  effectiveDate: o.movedToDate ?? originalDate,
  movedToDate: null,
  startTime: null,
  endTime: null,
  status: "pending",
  done: {},
  doneCount: 0,
  totalCount: 1,
  updatedAt: 0,
  ...o,
});

describe("recurrence engine", () => {
  it("scenario 1: only Monday, Tuesday and Wednesday", () => {
    const ctx = ruleContext(rule({ type: "weekdays", weekdays: [1, 2, 3] }));
    const dates = datesBetween(ctx, "2026-11-02", "2026-11-15");
    expect(dates).toEqual(["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-09", "2026-11-10", "2026-11-11"]);
  });

  it("scenario 2: week cycle A = L M X, B = L M", () => {
    const ctx = ruleContext(rule({ type: "week_cycle", cycle: [{ weekdays: [1, 2, 3] }, { weekdays: [1, 2] }] }));
    const dates = datesBetween(ctx, "2026-11-02", "2026-11-22");
    expect(dates).toEqual([
      "2026-11-02", "2026-11-03", "2026-11-04", // A
      "2026-11-09", "2026-11-10", // B
      "2026-11-16", "2026-11-17", "2026-11-18", // A
    ]);
  });

  it("cycle anchors on the start week even if it starts mid-week", () => {
    const ctx = ruleContext(rule({ type: "week_cycle", startDate: "2026-11-04", cycle: [{ weekdays: [1, 3] }, { weekdays: [5] }] }));
    expect(datesBetween(ctx, "2026-11-01", "2026-11-20")).toEqual(["2026-11-04", "2026-11-13", "2026-11-16", "2026-11-18"]);
  });

  it("every N days", () => {
    const ctx = ruleContext(rule({ type: "every_n_days", interval: 3 }));
    expect(nextDates(ctx, "2026-11-02", 4)).toEqual(["2026-11-02", "2026-11-05", "2026-11-08", "2026-11-11"]);
  });

  it("every N weeks on certain days", () => {
    const ctx = ruleContext(rule({ type: "every_n_weeks", interval: 2, weekdays: [1, 3] }));
    expect(datesBetween(ctx, "2026-11-02", "2026-11-22")).toEqual(["2026-11-02", "2026-11-04", "2026-11-16", "2026-11-18"]);
  });

  it("scenario 18: 30-day challenge ends after 30 times", () => {
    const r = rule({ type: "daily", endType: "count", endCount: 30 });
    expect(effectiveEndDate(r)).toBe("2026-12-01");
    const ctx = ruleContext(r);
    expect(datesBetween(ctx, "2026-11-01", "2027-01-31")).toHaveLength(30);
  });

  it("ends on a date (inclusive)", () => {
    const ctx = ruleContext(rule({ type: "daily", endType: "date", endDate: "2026-11-05" }));
    expect(datesBetween(ctx, "2026-11-01", "2026-11-30")).toHaveLength(4);
  });

  it("paused days do not generate occurrences", () => {
    const ctx = ruleContext(rule({ type: "daily" }), [{ from: "2026-11-04", to: "2026-11-06" }]);
    expect(datesBetween(ctx, "2026-11-02", "2026-11-08")).toEqual(["2026-11-02", "2026-11-03", "2026-11-07", "2026-11-08"]);
  });

  it("weekdayOf is ISO", () => {
    expect(weekdayOf("2026-11-02")).toBe(1);
    expect(weekdayOf("2026-11-08")).toBe(7);
  });
});

describe("occurrences and streaks", () => {
  const r = rule({ type: "weekdays", weekdays: [1, 2, 3] });

  it("scenario 3: skipping Wednesday keeps the streak", () => {
    const it1 = item(r);
    const docs = new Map<string, Map<string, Occurrence>>([
      [
        "gym",
        new Map([
          [occurrenceId("gym", "2026-11-02"), occ("2026-11-02", { status: "done", done: { _root: 1 } })],
          [occurrenceId("gym", "2026-11-03"), occ("2026-11-03", { status: "done", done: { _root: 1 } })],
          [occurrenceId("gym", "2026-11-04"), occ("2026-11-04", { status: "skipped" })],
          [occurrenceId("gym", "2026-11-09"), occ("2026-11-09", { status: "done", done: { _root: 1 } })],
        ]),
      ],
    ]);
    const stats = computeStats(historyOf([it1], docs, "2026-11-10"), "2026-11-10");
    // Today's (Tue 10) pending occurrence does not break it.
    expect(stats.current).toBe(3);
    expect(stats.best).toBe(3);
    expect(stats.rate).toBe(1);
  });

  it("a missed day breaks the streak", () => {
    const docs = new Map([["gym", new Map([[occurrenceId("gym", "2026-11-02"), occ("2026-11-02", { done: { _root: 1 } })]])]]);
    const stats = computeStats(historyOf([item(r)], docs, "2026-11-04"), "2026-11-04");
    expect(stats.current).toBe(0);
    expect(stats.best).toBe(1);
    expect(stats.rate).toBe(0.5);
  });

  it("scenario 4: moving Monday to Tuesday", () => {
    const docs = new Map([[occurrenceId("gym", "2026-11-02"), occ("2026-11-02", { movedToDate: "2026-11-03" })]]);
    const list = occurrencesInRange(item(r), "2026-11-02", "2026-11-03", docs, "2026-11-01");
    expect(list.map((o) => [o.originalDate, o.date])).toEqual([
      ["2026-11-02", "2026-11-03"],
      ["2026-11-03", "2026-11-03"],
    ]);
    // Not shown on Monday any more.
    expect(occurrencesInRange(item(r), "2026-11-02", "2026-11-02", docs, "2026-11-01")).toHaveLength(0);
    // Shown on Tuesday even when the range excludes Monday.
    expect(occurrencesInRange(item(r), "2026-11-03", "2026-11-03", docs, "2026-11-01")).toHaveLength(2);
  });

  it("time override only for one occurrence", () => {
    const docs = new Map([[occurrenceId("gym", "2026-11-03"), occ("2026-11-03", { startTime: "06:00", endTime: "07:00" })]]);
    const list = occurrencesInRange(item(r), "2026-11-02", "2026-11-03", docs, "2026-11-01");
    expect(list.map((o) => o.startTime)).toEqual(["18:30", "06:00"]);
  });

  it("scenario 5: split keeps the streak across the chain", () => {
    const old = item(rule({ type: "daily", endType: "date", endDate: "2026-11-03" }));
    const next = item(rule({ type: "daily", startDate: "2026-11-04" }), { id: "gym2", splitFromItemId: "gym", startTime: "06:00" });
    const docs = new Map<string, Map<string, Occurrence>>([
      ["gym", new Map([
        [occurrenceId("gym", "2026-11-02"), occ("2026-11-02", { done: { _root: 1 } })],
        [occurrenceId("gym", "2026-11-03"), occ("2026-11-03", { done: { _root: 1 } })],
      ])],
      ["gym2", new Map([[occurrenceId("gym2", "2026-11-04"), { ...occ("2026-11-04", { done: { _root: 1 } }), id: occurrenceId("gym2", "2026-11-04"), itemId: "gym2" }]])],
    ]);
    const stats = computeStats(historyOf([old, next], docs, "2026-11-05"), "2026-11-05");
    expect(stats.current).toBe(3);
  });

  it("subtasks limited to certain days only count on those days", () => {
    const withNodes = item(r, {
      nodes: {
        legs: { parentId: null, title: "Piernas", position: 1, notes: null, dueDate: null, estimateMin: null, completedAt: null, completedOn: null, weekdays: [1], addedOn: "2026-11-01", removedOn: null },
        warm: { parentId: null, title: "Calentar", position: 2, notes: null, dueDate: null, estimateMin: null, completedAt: null, completedOn: null, weekdays: null, addedOn: "2026-11-01", removedOn: null },
      },
    });
    const docs = new Map([[occurrenceId("gym", "2026-11-03"), occ("2026-11-03", { done: { warm: 1 } })]]);
    const [mon, tue] = occurrencesInRange(withNodes, "2026-11-02", "2026-11-03", docs, "2026-11-04");
    expect(mon.total).toBe(2);
    expect(tue.total).toBe(1);
    expect(tue.state).toBe("done");
    expect(mon.state).toBe("missed");
  });
});
