import { useMemo, useState } from "react";
import type { RecurrenceRule, RecurrenceType, Weekday } from "@/types/models";
import { nextDates, ruleContext, ruleHasDays, sortWeekdays } from "@/lib/recurrence/engine";
import { cycleLetter, upcomingList } from "@/lib/date/format";
import { useToday } from "@/features/data/ClockContext";
import { AddIcon, CloseIcon } from "@/components/icons";
import { Sheet } from "@/components/ui/Sheet";
import { fmt, useT } from "@/i18n";

const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 7];

function DayChips({ days, onChange, small }: { days: Weekday[]; onChange: (d: Weekday[]) => void; small?: boolean }) {
  const t = useT();
  return (
    <>
      {WEEKDAYS.map((d) => (
        <button
          key={d}
          type="button"
          className={`dchip ${small ? "s" : ""} ${days.includes(d) ? "on" : ""}`}
          aria-pressed={days.includes(d)}
          aria-label={t.dates.weekdays[d - 1]}
          onClick={() => onChange(sortWeekdays(days.includes(d) ? days.filter((x) => x !== d) : [...days, d]))}
        >
          {t.dates.weekdaysLetter[d - 1]}
        </button>
      ))}
    </>
  );
}

/** M4 — recurrence rule editor with a preview of the next dates. */
export function RecurrenceEditor({ rule: initial, onDone, onClose }: { rule: RecurrenceRule; onDone: (r: RecurrenceRule) => void; onClose: () => void }) {
  const t = useT();
  const today = useToday();
  const [rule, setRule] = useState<RecurrenceRule>(() => ({
    ...initial,
    weekdays: initial.weekdays ?? [],
    cycle: initial.cycle ?? [{ weekdays: initial.weekdays ?? [1] }, { weekdays: [] }],
    interval: initial.interval ?? 2,
  }));
  const patch = (p: Partial<RecurrenceRule>) => setRule((r) => ({ ...r, ...p }));

  const clean = (r: RecurrenceRule): RecurrenceRule => ({
    type: r.type,
    weekdays: r.type === "weekdays" || r.type === "every_n_weeks" ? r.weekdays : null,
    interval: r.type === "every_n_days" || r.type === "every_n_weeks" ? Math.max(1, Math.round(r.interval ?? 1)) : null,
    cycle: r.type === "week_cycle" ? r.cycle : null,
    startDate: r.startDate,
    endType: r.endType,
    endDate: r.endType === "date" ? (r.endDate ?? r.startDate) : null,
    endCount: r.endType === "count" ? Math.max(1, Math.round(r.endCount ?? 10)) : null,
  });

  const cleaned = clean(rule);
  const valid = ruleHasDays(cleaned);
  const preview = useMemo(() => (valid ? nextDates(ruleContext(cleaned), today > cleaned.startDate ? today : cleaned.startDate, 5) : []), [cleaned, valid, today]);

  const option = (type: RecurrenceType, label: string) => (
    <button type="button" className={`radio ${rule.type === type ? "on" : ""}`} onClick={() => patch({ type })}>
      {label}
    </button>
  );

  return (
    <Sheet
      title={t.recurrence.title}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            {t.common.cancel}
          </button>
          <button
            type="button"
            className="btn pri"
            disabled={!valid}
            onClick={() => {
              onDone(cleaned);
              onClose();
            }}
          >
            {t.common.done}
          </button>
        </>
      }
    >
      {option("daily", t.recurrence.daily)}
      {option("weekdays", t.recurrence.weekdays)}
      {rule.type === "weekdays" && (
        <div className="chips">
          <DayChips days={rule.weekdays ?? []} onChange={(weekdays) => patch({ weekdays })} />
        </div>
      )}
      {option("every_n_days", t.recurrence.everyNDays)}
      {rule.type === "every_n_days" && (
        <div className="row">
          {t.recurrence.every}
          <input className="inp" style={{ width: 80 }} type="number" min={1} value={rule.interval ?? 1} aria-label={t.recurrence.daysWord} onChange={(e) => patch({ interval: Number(e.target.value) })} />
          {t.recurrence.daysWord}
        </div>
      )}
      {option("every_n_weeks", t.recurrence.everyNWeeks)}
      {rule.type === "every_n_weeks" && (
        <div className="row" style={{ flexWrap: "wrap" }}>
          {t.recurrence.every}
          <input className="inp" style={{ width: 80 }} type="number" min={1} value={rule.interval ?? 2} aria-label={t.recurrence.weeksWord} onChange={(e) => patch({ interval: Number(e.target.value) })} />
          {t.recurrence.weeksWord}
          <DayChips days={rule.weekdays ?? []} onChange={(weekdays) => patch({ weekdays })} />
        </div>
      )}
      {option("week_cycle", t.recurrence.cycle)}
      {rule.type === "week_cycle" && (
        <div className="box">
          {(rule.cycle ?? []).map((w, i) => (
            <div className="row" key={i} style={{ flexWrap: "wrap" }}>
              <span className="lbl" style={{ width: 76 }}>
                {fmt(t.detail.weekLabel, { letter: cycleLetter(i) })}
              </span>
              <DayChips small days={w.weekdays} onChange={(weekdays) => patch({ cycle: (rule.cycle ?? []).map((x, k) => (k === i ? { weekdays } : x)) })} />
              {(rule.cycle ?? []).length > 1 && (
                <button type="button" className="ib" aria-label={t.recurrence.removeWeek} onClick={() => patch({ cycle: (rule.cycle ?? []).filter((_, k) => k !== i) })}>
                  <CloseIcon size={14} />
                </button>
              )}
            </div>
          ))}
          <button type="button" className="lnk" onClick={() => patch({ cycle: [...(rule.cycle ?? []), { weekdays: [] }] })}>
            <AddIcon size={16} />
            {t.recurrence.addWeek}
          </button>
        </div>
      )}
      <div className="pair">
        <div className="field">
          <label htmlFor="r-start">{t.recurrence.starts}</label>
          <input id="r-start" className="inp" type="date" value={rule.startDate} onChange={(e) => e.target.value && patch({ startDate: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="r-end">{t.recurrence.ends}</label>
          <select id="r-end" className="inp" value={rule.endType} onChange={(e) => patch({ endType: e.target.value as RecurrenceRule["endType"] })}>
            <option value="never">{t.recurrence.endNever}</option>
            <option value="date">{t.recurrence.endDate}</option>
            <option value="count">{t.recurrence.endCount}</option>
          </select>
        </div>
      </div>
      {rule.endType === "date" && (
        <div className="field">
          <label htmlFor="r-end-date">{t.recurrence.endDateLabel}</label>
          <input id="r-end-date" className="inp" type="date" min={rule.startDate} value={rule.endDate ?? rule.startDate} onChange={(e) => patch({ endDate: e.target.value || null })} />
        </div>
      )}
      {rule.endType === "count" && (
        <div className="field">
          <label htmlFor="r-count">{t.recurrence.endCountLabel}</label>
          <input id="r-count" className="inp" type="number" min={1} value={rule.endCount ?? 10} onChange={(e) => patch({ endCount: Number(e.target.value) })} />
        </div>
      )}
      <div className="note">
        {valid && preview.length > 0 ? (
          <>
            <b style={{ color: "var(--ink)" }}>{t.recurrence.next}</b> {upcomingList(preview)}…
          </>
        ) : (
          t.recurrence.noNext
        )}
      </div>
    </Sheet>
  );
}
