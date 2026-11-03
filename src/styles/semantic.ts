// Semantic mapping TS → CSS tokens (for inline styles that need a variable).
import type { Category, ColorKey } from "@/types/models";
import type { Tone } from "@/lib/agenda/agenda";

const SOLID: Record<ColorKey, string> = {
  blue: "var(--blue)",
  orange: "var(--orange-s)",
  teal: "var(--teal)",
  violet: "var(--violet)",
  rose: "var(--rose)",
  slate: "var(--slate)",
  green: "var(--green)",
};

const TINT: Record<ColorKey, string> = {
  blue: "var(--blue-t)",
  orange: "var(--orange-t)",
  teal: "var(--teal-t)",
  violet: "var(--violet-t)",
  rose: "var(--rose-t)",
  slate: "var(--slate-t)",
  green: "var(--green-t)",
};

const INK: Record<ColorKey, string> = {
  blue: "var(--blue)",
  orange: "var(--orange)",
  teal: "var(--teal)",
  violet: "var(--violet)",
  rose: "var(--rose)",
  slate: "var(--slate)",
  green: "var(--green)",
};

/** Default color when the item has none: by behavior. */
export function defaultColorFor(tone: Tone): ColorKey {
  if (tone === "repeat") return "orange";
  if (tone === "once") return "blue";
  return "slate";
}

export function colorSolid(color: ColorKey | null, tone: Tone = "once"): string {
  return SOLID[color ?? defaultColorFor(tone)];
}

export function colorTint(color: ColorKey | null, tone: Tone = "once"): string {
  return TINT[color ?? defaultColorFor(tone)];
}

export function colorInk(color: ColorKey | null, tone: Tone = "once"): string {
  return INK[color ?? defaultColorFor(tone)];
}

export const CATEGORY_CLASS: Record<Category, string> = {
  task: "task",
  project: "project",
  event: "event",
};
