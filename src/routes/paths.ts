import type { DateKey } from "@/types/models";

export type CalendarMode = "mes" | "semana" | "dia";

export const paths = {
  today: "/hoy",
  calendar: "/calendario",
  events: "/eventos",
  calendarAt: (mode: CalendarMode, date: DateKey) => `/calendario?modo=${mode}&fecha=${date}`,
  item: (id: string, opts: { node?: string | null; date?: DateKey } = {}) => {
    const q = new URLSearchParams();
    if (opts.node) q.set("nodo", opts.node);
    if (opts.date) q.set("fecha", opts.date);
    const s = q.toString();
    return `/eventos/${id}${s ? `?${s}` : ""}`;
  },
};
