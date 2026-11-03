import { describe, expect, it } from "vitest";
import type { NodeMap, TreeNode } from "@/types/models";
import { aliveIndex, isNodeComplete, leavesUnder, parsePastedList, structureFromRows, toggleNonRepeating } from "./tree";

const n = (parentId: string | null, position: number, extra: Partial<TreeNode> = {}): TreeNode => ({
  parentId,
  title: "x",
  position,
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

const tree = (): NodeMap => ({
  a: n(null, 1),
  a1: n("a", 1),
  a2: n("a", 2),
  b: n(null, 2),
});

const none = { completedAt: null, completedOn: null };

describe("tree", () => {
  it("leaves", () => {
    const idx = aliveIndex(tree());
    expect(leavesUnder(idx, null).sort()).toEqual(["a1", "a2", "b"]);
    expect(leavesUnder(idx, "a")).toEqual(["a1", "a2"]);
  });

  it("checking a parent checks all its descendants", () => {
    const res = toggleNonRepeating(tree(), none, "a", true, 100, "2026-11-02");
    expect(Object.keys(res.nodePatches).sort()).toEqual(["a", "a1", "a2"]);
    expect(res.completedLeaves.sort()).toEqual(["a1", "a2"]);
    expect(res.root.completedAt).toBeNull();
  });

  it("unchecking a child leaves the parent incomplete", () => {
    const nodes = tree();
    for (const id of ["a", "a1", "a2", "b"]) nodes[id].completedAt = 1;
    const res = toggleNonRepeating(nodes, { completedAt: 1, completedOn: "2026-11-01" }, "a1", false, 100, "2026-11-02");
    expect(res.nodePatches.a.completedAt).toBeNull();
    expect(res.nodePatches.a1.completedAt).toBeNull();
    expect(res.root.completedAt).toBeNull();
    expect(res.uncompletedLeaves.map((l) => l.id)).toEqual(["a1"]);
  });

  it("completing the last leaf completes the root", () => {
    const nodes = tree();
    nodes.a1.completedAt = 1;
    nodes.b.completedAt = 1;
    const res = toggleNonRepeating(nodes, none, "a2", true, 100, "2026-11-02");
    expect(res.nodePatches.a.completedAt).toBe(100);
    expect(res.root.completedAt).toBe(100);
  });

  it("root without subtasks toggles directly", () => {
    const res = toggleNonRepeating({}, none, null, true, 5, "2026-11-02");
    expect(res.root).toEqual({ completedAt: 5, completedOn: "2026-11-02" });
    expect(isNodeComplete({}, 5, null)).toBe(true);
  });

  it("removed nodes are ignored", () => {
    const nodes = tree();
    nodes.b.removedOn = "2026-11-02";
    nodes.a1.completedAt = 1;
    nodes.a2.completedAt = 1;
    expect(isNodeComplete(nodes, null, null)).toBe(true);
  });

  it("parses a pasted list with indentation and bullets", () => {
    const rows = parsePastedList("- Lavar\n  - Ropa blanca\n  - Ropa de color\n- Tender\n1. Guardar\n\t* Doblar");
    expect(rows.map((r) => [r.title, r.depth])).toEqual([
      ["Lavar", 0],
      ["Ropa blanca", 1],
      ["Ropa de color", 1],
      ["Tender", 0],
      ["Guardar", 0],
      ["Doblar", 1],
    ]);
  });

  it("structureFromRows assigns parents by depth", () => {
    const s = structureFromRows([
      { id: "1", title: "A", depth: 0 },
      { id: "2", title: "A1", depth: 1 },
      { id: "3", title: "A1a", depth: 3 },
      { id: "4", title: "", depth: 0 },
      { id: "5", title: "B", depth: 0 },
    ]);
    expect(s.map((r) => [r.id, r.parentId])).toEqual([
      ["1", null],
      ["2", "1"],
      ["3", "2"],
      ["5", null],
    ]);
  });
});
