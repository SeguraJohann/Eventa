// Subtask tree helpers — pure. The tree is a flat map `nodeId → node` with parentId.

import type { DateKey, Millis, NodeMap, TreeNode, Weekday } from "@/types/models";
import { weekdayOf } from "@/lib/date/dateKey";

export type NodeState = "pending" | "partial" | "done";
export type ParentKey = string | null;

export const POSITION_STEP = 1024;

export function newNodeId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function emptyNode(partial: Partial<TreeNode> & { title: string; addedOn: DateKey }): TreeNode {
  return {
    parentId: null,
    position: POSITION_STEP,
    notes: null,
    dueDate: null,
    estimateMin: null,
    completedAt: null,
    completedOn: null,
    weekdays: null,
    removedOn: null,
    ...partial,
  };
}

// ---------- filters ----------

/** Nodes that exist (not removed) on `date`. With date = null, all non-removed nodes. */
export function isNodeAlive(node: TreeNode, date: DateKey | null): boolean {
  if (date === null) return node.removedOn === null;
  return node.addedOn <= date && (node.removedOn === null || node.removedOn > date);
}

export type NodeFilter = (id: string, node: TreeNode) => boolean;

export interface TreeIndex {
  nodes: NodeMap;
  children: Map<ParentKey, string[]>;
  /** Ids included by the filter, in DFS order. */
  order: string[];
}

/**
 * Builds the children index for the nodes accepted by `filter`. A node is only
 * included when its whole ancestor chain is included too.
 */
export function buildIndex(nodes: NodeMap, filter: NodeFilter = () => true): TreeIndex {
  const raw = new Map<ParentKey, string[]>();
  for (const [id, node] of Object.entries(nodes)) {
    if (!filter(id, node)) continue;
    const key = node.parentId && nodes[node.parentId] ? node.parentId : null;
    const list = raw.get(key);
    if (list) list.push(id);
    else raw.set(key, [id]);
  }
  for (const list of raw.values()) {
    list.sort((a, b) => nodes[a].position - nodes[b].position || a.localeCompare(b));
  }
  // Walk from the root so orphaned branches (parent filtered out) disappear.
  const children = new Map<ParentKey, string[]>();
  const order: string[] = [];
  const walk = (parent: ParentKey) => {
    const list = raw.get(parent);
    if (!list) return;
    children.set(parent, list);
    for (const id of list) {
      order.push(id);
      walk(id);
    }
  };
  walk(null);
  return { nodes, children, order };
}

/** Index of the current (today's) tree. */
export function aliveIndex(nodes: NodeMap, date: DateKey | null = null): TreeIndex {
  return buildIndex(nodes, (_, n) => isNodeAlive(n, date));
}

/**
 * Template for an occurrence of a repeating item on `date`: alive nodes whose
 * own weekday restriction (and their ancestors') allows that weekday.
 */
export function templateIndex(nodes: NodeMap, date: DateKey): TreeIndex {
  const wd = weekdayOf(date);
  return buildIndex(nodes, (_, n) => isNodeAlive(n, date) && (n.weekdays === null || n.weekdays.includes(wd)));
}

export function childrenOf(index: TreeIndex, parent: ParentKey): string[] {
  return index.children.get(parent) ?? [];
}

export function hasChildren(index: TreeIndex, id: ParentKey): boolean {
  return childrenOf(index, id).length > 0;
}

export function descendantsOf(index: TreeIndex, id: ParentKey): string[] {
  const out: string[] = [];
  const walk = (p: ParentKey) => {
    for (const c of childrenOf(index, p)) {
      out.push(c);
      walk(c);
    }
  };
  walk(id);
  return out;
}

/** Leaves under `id` (the node itself when it has no children). id = null → whole tree. */
export function leavesUnder(index: TreeIndex, id: ParentKey): string[] {
  if (id !== null && !hasChildren(index, id)) return [id];
  return descendantsOf(index, id).filter((d) => !hasChildren(index, d));
}

export function depthOf(nodes: NodeMap, id: string): number {
  let depth = 0;
  let cur = nodes[id]?.parentId ?? null;
  while (cur && nodes[cur] && depth < 1000) {
    depth++;
    cur = nodes[cur].parentId;
  }
  return depth;
}

export function ancestorsOf(nodes: NodeMap, id: string): string[] {
  const out: string[] = [];
  let cur = nodes[id]?.parentId ?? null;
  while (cur && nodes[cur] && out.length < 1000) {
    out.push(cur);
    cur = nodes[cur].parentId;
  }
  return out;
}

/** Titles from the root child down to the node's parent. */
export function pathTitles(nodes: NodeMap, id: string): string[] {
  return ancestorsOf(nodes, id).reverse().map((a) => nodes[a].title);
}

// ---------- progress (items that do NOT repeat) ----------

export interface Progress {
  done: number;
  total: number;
}

export function progressOf(index: TreeIndex, id: ParentKey, isLeafDone: (leafId: string) => boolean): Progress {
  const leaves = leavesUnder(index, id);
  let done = 0;
  for (const l of leaves) if (isLeafDone(l)) done++;
  return { done, total: leaves.length };
}

export function stateOf(p: Progress): NodeState {
  if (p.total === 0) return "pending";
  if (p.done === 0) return "pending";
  if (p.done === p.total) return "done";
  return "partial";
}

export function ratio(p: Progress): number {
  return p.total === 0 ? 0 : p.done / p.total;
}

export interface CompletionPatch {
  completedAt: Millis | null;
  completedOn: DateKey | null;
}

export interface ToggleResult {
  /** Field patches for nodes whose completion changed. */
  nodePatches: Record<string, CompletionPatch>;
  /** Completion of the root item after the change. */
  root: CompletionPatch;
  /** Leaves (or the root when there is no tree) that became complete. */
  completedLeaves: string[];
  /** Leaves that became incomplete, with the day they had counted for. */
  uncompletedLeaves: { id: string; completedOn: DateKey | null }[];
}

/**
 * Checks or unchecks a node (or the root with nodeId = null) of an item that does
 * not repeat. Checking a parent checks all its leaves; ancestors are recomputed.
 */
export function toggleNonRepeating(
  nodes: NodeMap,
  rootCompletion: CompletionPatch,
  nodeId: string | null,
  checked: boolean,
  now: Millis,
  today: DateKey,
): ToggleResult {
  const index = aliveIndex(nodes);
  const nodePatches: Record<string, CompletionPatch> = {};
  const completedLeaves: string[] = [];
  const uncompletedLeaves: { id: string; completedOn: DateKey | null }[] = [];
  const doneNow = { completedAt: now, completedOn: today };
  const cleared = { completedAt: null, completedOn: null };

  // Root without subtasks: toggle directly.
  if (index.order.length === 0) {
    const wasDone = rootCompletion.completedAt !== null;
    if (checked && !wasDone) completedLeaves.push("_root");
    if (!checked && wasDone) uncompletedLeaves.push({ id: "_root", completedOn: rootCompletion.completedOn });
    return {
      nodePatches,
      root: checked ? (wasDone ? rootCompletion : doneNow) : cleared,
      completedLeaves,
      uncompletedLeaves,
    };
  }

  const leafDone = (id: string) => {
    const patch = nodePatches[id];
    return patch ? patch.completedAt !== null : nodes[id].completedAt !== null;
  };

  for (const leaf of leavesUnder(index, nodeId)) {
    const was = nodes[leaf].completedAt !== null;
    if (checked && !was) {
      nodePatches[leaf] = doneNow;
      completedLeaves.push(leaf);
    } else if (!checked && was) {
      nodePatches[leaf] = cleared;
      uncompletedLeaves.push({ id: leaf, completedOn: nodes[leaf].completedOn });
    }
  }

  // Recompute every parent node bottom-up (DFS order reversed).
  for (const id of [...index.order].reverse()) {
    if (!hasChildren(index, id)) continue;
    const full = leavesUnder(index, id).every(leafDone);
    const was = nodes[id].completedAt !== null;
    if (full && !was) nodePatches[id] = doneNow;
    if (!full && was) nodePatches[id] = cleared;
  }

  const allDone = leavesUnder(index, null).every(leafDone);
  const rootWas = rootCompletion.completedAt !== null;
  const root = allDone ? (rootWas ? rootCompletion : doneNow) : cleared;
  return { nodePatches, root, completedLeaves, uncompletedLeaves };
}

/** Is a node (or root, nodeId = null) complete in an item that does not repeat? */
export function isNodeComplete(nodes: NodeMap, rootCompletedAt: Millis | null, nodeId: string | null): boolean {
  const index = aliveIndex(nodes);
  if (nodeId === null) {
    if (index.order.length === 0) return rootCompletedAt !== null;
    return leavesUnder(index, null).every((l) => nodes[l].completedAt !== null);
  }
  if (!nodes[nodeId] || !index.order.includes(nodeId)) return true;
  return leavesUnder(index, nodeId).every((l) => nodes[l].completedAt !== null);
}

// ---------- occurrences (items that repeat) ----------

/** Toggles a node inside an occurrence; returns the new `done` map. */
export function toggleInOccurrence(
  template: TreeIndex,
  done: Record<string, Millis>,
  nodeId: string | null,
  checked: boolean,
  now: Millis,
  rootKey: string,
): Record<string, Millis> {
  const next = { ...done };
  const leaves = template.order.length === 0 ? [rootKey] : leavesUnder(template, nodeId);
  for (const l of leaves) {
    if (checked) next[l] = next[l] ?? now;
    else delete next[l];
  }
  return next;
}

export function occurrenceProgress(template: TreeIndex, done: Record<string, Millis>, rootKey: string): Progress {
  if (template.order.length === 0) return { done: done[rootKey] ? 1 : 0, total: 1 };
  return progressOf(template, null, (l) => done[l] !== undefined);
}

// ---------- positions ----------

export function positionAfterLast(index: TreeIndex, parent: ParentKey): number {
  const list = childrenOf(index, parent);
  if (list.length === 0) return POSITION_STEP;
  return index.nodes[list[list.length - 1]].position + POSITION_STEP;
}

export function positionBetween(before: number | null, after: number | null): number {
  if (before === null && after === null) return POSITION_STEP;
  if (before === null) return (after as number) - POSITION_STEP;
  if (after === null) return before + POSITION_STEP;
  return (before + after) / 2;
}

/** Would making `newParent` the parent of `id` create a cycle? */
export function wouldCycle(nodes: NodeMap, id: string, newParent: string | null): boolean {
  if (newParent === null) return false;
  if (newParent === id) return true;
  return ancestorsOf(nodes, newParent).includes(id);
}

// ---------- flat editor rows ----------

export interface EditorRow {
  id: string;
  title: string;
  depth: number;
}

export function rowsFromNodes(index: TreeIndex): EditorRow[] {
  return index.order.map((id) => ({ id, title: index.nodes[id].title, depth: depthOf(index.nodes, id) }));
}

/** Normalizes depths so each row is at most one level deeper than the previous one. */
export function normalizeRows(rows: EditorRow[]): EditorRow[] {
  let prev = -1;
  return rows.map((r) => {
    const depth = Math.max(0, Math.min(r.depth, prev + 1));
    prev = depth;
    return { ...r, depth };
  });
}

/**
 * Turns editor rows into parentId/position assignments.
 * Empty titles are dropped (their children move up to the closest valid parent).
 */
export function structureFromRows(rows: EditorRow[]): { id: string; title: string; parentId: string | null; position: number }[] {
  const clean = normalizeRows(rows.filter((r) => r.title.trim() !== ""));
  const stack: string[] = [];
  const counters = new Map<string | null, number>();
  return clean.map((r) => {
    stack.length = r.depth;
    const parentId = r.depth === 0 ? null : stack[r.depth - 1] ?? null;
    stack[r.depth] = r.id;
    const n = (counters.get(parentId) ?? 0) + 1;
    counters.set(parentId, n);
    return { id: r.id, title: r.title.trim(), parentId, position: n * POSITION_STEP };
  });
}

/** Parses a pasted list (indentation, bullets or numbering) into editor rows. */
export function parsePastedList(text: string): EditorRow[] {
  const lines = text.replace(/\r/g, "").split("\n");
  const rows: EditorRow[] = [];
  const indents: number[] = [];
  for (const line of lines) {
    if (line.trim() === "") continue;
    const ws = /^[\t ]*/.exec(line)?.[0] ?? "";
    const indent = ws.replace(/\t/g, "    ").length;
    const title = line
      .trim()
      .replace(/^(?:[-*+•·▪◦‣–—]|\d+[.)]|[a-zA-Z][.)](?=\s)|\[[ xX]?\])\s*/, "")
      .replace(/^\[[ xX]?\]\s*/, "")
      .trim();
    if (title === "") continue;
    while (indents.length > 0 && indent < indents[indents.length - 1]) indents.pop();
    if (indents.length === 0 || indent > indents[indents.length - 1]) indents.push(indent);
    rows.push({ id: newNodeId(), title, depth: indents.length - 1 });
  }
  return normalizeRows(rows);
}

export function weekdaysAllow(days: Weekday[] | null, date: DateKey): boolean {
  return days === null || days.includes(weekdayOf(date));
}

/**
 * Recomputes the completion of every parent and of the root after a structural
 * change (add/move/delete) in an item that does not repeat. Leaves keep theirs.
 */
export function recomputeCompletion(
  nodes: NodeMap,
  root: CompletionPatch,
  now: Millis,
  today: DateKey,
): { nodes: NodeMap; root: CompletionPatch } {
  const index = aliveIndex(nodes);
  const next: NodeMap = { ...nodes };
  const doneNow = { completedAt: now, completedOn: today };
  const leafDone = (id: string) => next[id].completedAt !== null;
  for (const id of [...index.order].reverse()) {
    if (!hasChildren(index, id)) continue;
    const full = leavesUnder(index, id).every(leafDone);
    const was = next[id].completedAt !== null;
    if (full && !was) next[id] = { ...next[id], ...doneNow };
    if (!full && was) next[id] = { ...next[id], completedAt: null, completedOn: null };
  }
  if (index.order.length === 0) return { nodes: next, root };
  const all = leavesUnder(index, null).every(leafDone);
  const rootWas = root.completedAt !== null;
  return { nodes: next, root: all ? (rootWas ? root : doneNow) : { completedAt: null, completedOn: null } };
}
