import type { DateKey, Item, Placement } from "@/types/models";
import { es, fmt } from "@/i18n";
import { dayMonth, formatTimeRange, relativeDate, ruleTag } from "@/lib/date/format";
import { isRepeating, ruleEnded, subtaskCount } from "@/lib/agenda/items";

export interface Tag {
  text: string;
  kind?: "rep" | "warn";
}

/** Automatic tags of a list row: "↻ sábados", "◷ 9:00–11:00", "racha 6", … */
export function itemTags(item: Item, upcoming: Placement[], today: DateKey, streak: number | null): Tag[] {
  const t = es.events;
  const tags: Tag[] = [];
  const n = subtaskCount(item);
  if (isRepeating(item) && item.recurrence) {
    tags.push({ text: `↻ ${ruleTag(item.recurrence)}`, kind: "rep" });
    if (item.timeMode === "timed" && item.startTime) {
      tags.push({ text: `◷ ${formatTimeRange(item.startTime, item.endTime)}${item.background ? ` · ${t.background}` : ""}` });
    } else if (item.timeMode === "all_day") tags.push({ text: `◷ ${es.common.allDay}` });
    if (n > 0) tags.push({ text: `☰ ${fmt(t.steps, { n })}` });
    if (item.completion === "check" && streak !== null && streak > 0) tags.push({ text: fmt(t.streak, { n: streak }) });
    if (ruleEnded(item, today)) tags.push({ text: t.ended });
  } else {
    if (n > 0) tags.push({ text: `☰ ${fmt(t.subtasks, { n })}` });
    const days = [...new Set(upcoming.map((p) => p.date))].sort();
    if (days.length === 1) {
      const p = upcoming.find((x) => x.date === days[0])!;
      const time = p.timeMode === "timed" ? ` ${formatTimeRange(p.startTime, p.endTime)}` : "";
      tags.push({ text: `▦ ${relativeDate(days[0], today, false)}${time}` });
    } else if (days.length > 1) tags.push({ text: `▦ ${fmt(t.inDays, { n: days.length })}` });
    if (item.dueDate) tags.push({ text: `⚑ ${fmt(t.due, { date: dayMonth(item.dueDate) })}`, kind: item.dueDate < today && !item.completedAt ? "warn" : undefined });
    if (days.length === 0 && item.scheduleMode !== "days" && !item.dueDate) tags.push({ text: t.noDate });
  }
  if (item.completion === "block") tags.push({ text: t.blockOnly });
  if (item.status === "paused") tags.push({ text: t.paused, kind: "warn" });
  return tags;
}
