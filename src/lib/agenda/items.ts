// Item-level derived values — pure.

import type { Category, DateKey, Item, Placement } from "@/types/models";
import { aliveIndex, isNodeComplete, progressOf, type Progress } from "@/lib/tree/tree";
import { itemRuleContext } from "@/lib/recurrence/occurrences";

export function suggestedCategory(item: Pick<Item, "completion" | "scheduleMode" | "nodes">): Category {
  if (item.completion === "block") return "event";
  const hasNodes = Object.values(item.nodes).some((n) => n.removedOn === null);
  if (hasNodes && item.scheduleMode !== "repeat") return "project";
  return "task";
}

export function displayCategory(item: Item): Category {
  return item.category ?? suggestedCategory(item);
}

export function isRepeating(item: Item): boolean {
  return item.scheduleMode === "repeat" && item.recurrence !== null;
}

/** Progress of an item that does not repeat. */
export function itemProgress(item: Item): Progress {
  const idx = aliveIndex(item.nodes);
  if (idx.order.length === 0) return { done: item.completedAt ? 1 : 0, total: 1 };
  return progressOf(idx, null, (l) => item.nodes[l].completedAt !== null);
}

export function subtaskCount(item: Item): number {
  return aliveIndex(item.nodes).order.length;
}

/** Is a placement still "open" (target incomplete, not dismissed, item active)? */
export function placementShouldBeOpen(item: Item, p: Pick<Placement, "nodeId" | "dismissed">): boolean {
  if (p.dismissed) return false;
  if (item.status !== "active") return false;
  if (item.completion === "block") return false;
  return !isNodeComplete(item.nodes, item.completedAt, p.nodeId);
}

/**
 * A repeating item that was split ("this and following") and whose rule already
 * ended is hidden from the list; its successor carries the history.
 */
export function isSupersededSplit(item: Item, today: DateKey, all: Item[]): boolean {
  if (!isRepeating(item)) return false;
  const ctx = itemRuleContext(item);
  if (!ctx || ctx.end === null || ctx.end >= today) return false;
  return all.some((o) => o.splitFromItemId === item.id);
}

/** Has the rule of a repeating item ended before today? */
export function ruleEnded(item: Item, today: DateKey): boolean {
  const ctx = itemRuleContext(item);
  return !!ctx && ctx.end !== null && ctx.end < today;
}
