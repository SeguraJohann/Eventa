import type { ColorKey } from "@/types/models";

// Single point of configuration for this instance.
export const APP_CONFIG = {
  appName: "Eventa",
  locale: "es-CR",
  timezone: "America/Costa_Rica",

  schedule: {
    /** Default visible range of the schedule (hours). Scrollable to 0–24. */
    defaultStartHour: 6,
    defaultEndHour: 23,
    /** Pixel height of one hour (mirrors --hr in tokens.css). */
    hourHeight: 56,
    /** Snap step when dragging or resizing (minutes). */
    snapMinutes: 15,
    /** Duration used when creating from an empty slot (minutes). */
    defaultDurationMin: 60,
    /** Long-press delay before dragging on touch screens (ms). */
    longPressMs: 350,
  },

  stats: {
    rateWindow: 30,
    heatmapWeeks: 14,
  },

  colors: ["blue", "orange", "teal", "violet", "rose", "slate", "green"] as ColorKey[],
} as const;
