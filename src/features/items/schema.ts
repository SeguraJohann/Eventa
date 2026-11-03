import { z } from "zod";
import { es } from "@/i18n";
import { isValidDateKey, isValidTimeKey, timeToMinutes } from "@/lib/date/dateKey";
import { ruleHasDays } from "@/lib/recurrence/engine";
import type { RecurrenceRule } from "@/types/models";

const dateKey = z.string().refine(isValidDateKey);
const timeKey = z.string().refine(isValidTimeKey);

const timeRange = (start: string | null, end: string | null) => !!start && !!end && timeToMinutes(end) > timeToMinutes(start);

const daySchema = z
  .object({
    placementId: z.string().nullable(),
    date: dateKey,
    timeMode: z.enum(["none", "all_day", "timed"]),
    startTime: timeKey.nullable(),
    endTime: timeKey.nullable(),
  })
  .refine((d) => d.timeMode !== "timed" || timeRange(d.startTime, d.endTime), { message: es.form.timeError, path: ["endTime"] });

/** Validation of the event form (M2). Messages are user-facing. */
export const itemDraftSchema = z
  .object({
    title: z.string().trim().min(1, es.form.nameRequired),
    scheduleMode: z.enum(["none", "days", "repeat"]),
    timeMode: z.enum(["none", "all_day", "timed"]),
    startTime: timeKey.nullable(),
    endTime: timeKey.nullable(),
    recurrence: z.custom<RecurrenceRule | null>(),
    days: z.array(daySchema),
  })
  .superRefine((d, ctx) => {
    if (d.scheduleMode === "repeat") {
      if (!d.recurrence || !ruleHasDays(d.recurrence)) ctx.addIssue({ code: "custom", message: es.form.ruleError, path: ["recurrence"] });
      if (d.timeMode === "timed" && !timeRange(d.startTime, d.endTime)) ctx.addIssue({ code: "custom", message: es.form.timeError, path: ["endTime"] });
    }
  });

export type DraftErrors = Partial<Record<"title" | "recurrence" | "endTime" | "days", string>>;

export function validateDraft(input: unknown): DraftErrors {
  const res = itemDraftSchema.safeParse(input);
  if (res.success) return {};
  const errors: DraftErrors = {};
  for (const issue of res.error.issues) {
    const key = issue.path[0] === "days" ? "days" : (issue.path[0] as keyof DraftErrors);
    if (!errors[key]) errors[key] = issue.message;
  }
  return errors;
}
