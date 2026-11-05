import { describe, expect, it } from "vitest";
import type { Item, Placement, TreeNode } from "@/types/models";
import { agendaForRange, daySummary, finishedLast, layoutTimed, splitDay, type AgendaEntry } from "./agenda";
import { placementShouldBeOpen, suggestedCategory } from "./items";

const node = (parentId: string | null, extra: Partial<TreeNode> = {}): TreeNode => ({
  parentId,
  title: "n",
  position: 1,
  notes: null,
  dueDate: null,
  estimateMin: null,
  completedAt: null,
  completedOn: null,
  weekdays: null,
  addedOn: "2026-11-01",
  removedOn: null,
  ...extra,
});

const item = (id: string, extra: Partial<Item> = {}): Item => ({
  id,
  title: id,
  notes: null,
  color: null,
  category: null,
  scheduleMode: "none",
  timeMode: "none",
  startTime: null,
  endTime: null,
  recurrence: null,
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

const placement = (id: string, itemId: string, extra: Partial<Placement> = {}): Placement => ({
  id,
  itemId,
  nodeId: null,
  date: "2026-11-02",
  timeMode: "none",
  startTime: null,
  endTime: null,
  position: 0,
  dismissed: false,
  open: true,
  createdAt: 0,
  updatedAt: 0,
  ...extra,
});

const office = item("office", {
  scheduleMode: "repeat",
  timeMode: "timed",
  startTime: "08:00",
  endTime: "17:00",
  completion: "block",
  background: true,
  recurrence: { type: "weekdays", weekdays: [1, 2, 3], interval: null, cycle: null, startDate: "2026-11-02", endType: "never", endDate: null, endCount: null },
});

const inventory = item("inv", { nodes: { a: node(null), b: node(null, { completedAt: 1 }) } });
const bread = item("bread", { scheduleMode: "days" });

describe("agenda", () => {
  const src = {
    items: [office, inventory, bread],
    lookupItem: (id: string) => [office, inventory, bread].find((i) => i.id === id),
    placements: [
      placement("p1", "inv", { nodeId: "a", timeMode: "timed", startTime: "09:00", endTime: "11:00" }),
      placement("p2", "bread"),
    ],
    occurrences: new Map(),
    today: "2026-11-02",
  };

  it("scenario 6/7: office in the background, a subtask on top", () => {
    const day = agendaForRange(src, "2026-11-02", "2026-11-02").get("2026-11-02")!;
    const { list, timed } = splitDay(day);
    expect(list.map((e) => e.item.id)).toEqual(["bread"]);
    expect(timed.map((e) => e.tone).sort()).toEqual(["background", "once"]);
    const laid = layoutTimed(timed);
    const fg = laid.find((l) => !l.background)!;
    expect(fg.cols).toBe(1);
    expect(laid.find((l) => l.background)!.entry.item.id).toBe("office");
  });

  it("finished entries go to the bottom, keeping their order", () => {
    const e = (key: string, state: AgendaEntry["state"]) => ({ key, state }) as AgendaEntry;
    const sorted = finishedLast([e("a", "done"), e("b", "pending"), e("c", "skipped"), e("d", "partial"), e("e", "missed")]);
    expect(sorted.map((x) => x.key)).toEqual(["b", "d", "e", "a", "c"]);
  });

  it("timed entries with subtasks also show in the task list, by start time", () => {
    const e = (key: string, startTime: string | null, withTasks: boolean) =>
      ({
        key,
        state: "pending",
        timeMode: startTime ? "timed" : "none",
        startTime,
        endTime: startTime ? "23:00" : null,
        progress: withTasks ? { done: 0, total: 3 } : null,
      }) as AgendaEntry;
    const { list, timed } = splitDay([e("gym", "18:00", true), e("meeting", "09:00", false), e("bread", null, false), e("run", "07:00", true)]);
    expect(list.map((x) => x.key)).toEqual(["bread", "run", "gym"]);
    expect(timed.map((x) => x.key)).toEqual(["gym", "meeting", "run"]);
  });

  it("office does not count as something to check", () => {
    const day = agendaForRange(src, "2026-11-02", "2026-11-02").get("2026-11-02")!;
    expect(daySummary(day)).toEqual({ done: 0, total: 2 });
  });

  it("overlapping blocks go side by side", () => {
    const day = agendaForRange(
      {
        ...src,
        placements: [
          placement("x", "bread", { timeMode: "timed", startTime: "10:00", endTime: "11:00" }),
          placement("y", "bread", { timeMode: "timed", startTime: "10:30", endTime: "12:00" }),
          placement("z", "bread", { timeMode: "timed", startTime: "13:00", endTime: "14:00" }),
        ],
      },
      "2026-11-02",
      "2026-11-02",
    ).get("2026-11-02")!;
    const laid = layoutTimed(day.filter((e) => e.kind === "placement"));
    const byId = new Map(laid.map((l) => [l.entry.placement!.id, l]));
    expect([byId.get("x")!.col, byId.get("y")!.col, byId.get("x")!.cols]).toEqual([0, 1, 2]);
    expect(byId.get("z")!.cols).toBe(1);
  });

  it("paused items do not appear", () => {
    const paused = { ...office, status: "paused" as const };
    const day = agendaForRange({ ...src, items: [paused], placements: [] }, "2026-11-02", "2026-11-02").get("2026-11-02") ?? [];
    expect(day).toHaveLength(0);
  });

  it("scenario 9: something today without time is in the no-time list", () => {
    const day = agendaForRange(src, "2026-11-02", "2026-11-02").get("2026-11-02")!;
    const breadEntry = day.find((e) => e.item.id === "bread")!;
    expect(breadEntry.timeMode).toBe("none");
    expect(breadEntry.checkable).toBe(true);
  });

  it("subtask placements show progress and path", () => {
    const day = agendaForRange(src, "2026-11-02", "2026-11-02").get("2026-11-02")!;
    const e = day.find((x) => x.nodeId === "a")!;
    expect(e.path).toEqual(["inv"]);
    expect(e.state).toBe("pending");
  });
});

describe("items", () => {
  it("suggested category", () => {
    expect(suggestedCategory(office)).toBe("event");
    expect(suggestedCategory(inventory)).toBe("project");
    expect(suggestedCategory(bread)).toBe("task");
  });

  it("placement open flag", () => {
    expect(placementShouldBeOpen(inventory, { nodeId: "a", dismissed: false })).toBe(true);
    expect(placementShouldBeOpen(inventory, { nodeId: "b", dismissed: false })).toBe(false);
    expect(placementShouldBeOpen(inventory, { nodeId: "a", dismissed: true })).toBe(false);
    expect(placementShouldBeOpen({ ...inventory, status: "paused" }, { nodeId: "a", dismissed: false })).toBe(false);
  });
});
