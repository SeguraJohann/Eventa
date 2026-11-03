import { useEffect, useMemo, useRef, useState } from "react";
import type { Category, ColorKey, DateKey, Item, RecurrenceRule, TimeKey, TimeMode } from "@/types/models";
import type { DayDraft, ItemDraft } from "@/features/items/services/items.service";
import { useItemActions } from "@/features/items/hooks/useItemActions";
import { useItemPlacements } from "@/features/data/hooks";
import { useToday } from "@/features/data/ClockContext";
import { useModals } from "@/features/modals/ModalContext";
import { suggestedCategory } from "@/lib/agenda/items";
import { aliveIndex, rowsFromNodes, type EditorRow } from "@/lib/tree/tree";
import { addMinutesToTime, weekdayOf } from "@/lib/date/dateKey";
import { dayRowLabel, formatDuration, formatTimeRange, parseEstimate, ruleRangeSummary, ruleSummary } from "@/lib/date/format";
import { APP_CONFIG } from "@/config/app.config";
import { colorSolid } from "@/styles/semantic";
import { AddIcon, CloseIcon, NextIcon } from "@/components/icons";
import { Sheet } from "@/components/ui/Sheet";
import { Segmented } from "@/components/ui/misc";
import { fmt, useT } from "@/i18n";
import { validateDraft, type DraftErrors } from "../schema";
import { TreeEditor } from "./TreeEditor";
import styles from "./ItemForm.module.css";

interface Props {
  item?: Item;
  preset?: { date?: DateKey; startTime?: TimeKey; endTime?: TimeKey };
  fromOccurrence?: { originalDate: DateKey };
  onClose: () => void;
}

export function defaultRule(today: DateKey): RecurrenceRule {
  return {
    type: "weekdays",
    weekdays: [weekdayOf(today)],
    interval: null,
    cycle: null,
    startDate: today,
    endType: "never",
    endDate: null,
    endCount: null,
  };
}

function draftFromItem(item: Item): ItemDraft {
  return {
    title: item.title,
    notes: item.notes,
    color: item.color,
    category: item.category,
    scheduleMode: item.scheduleMode,
    timeMode: item.timeMode,
    startTime: item.startTime,
    endTime: item.endTime,
    recurrence: item.recurrence,
    completion: item.completion,
    background: item.background,
    dueDate: item.dueDate,
    estimateMin: item.estimateMin,
    rows: rowsFromNodes(aliveIndex(item.nodes)),
    days: [],
  };
}

function emptyDraft(preset: Props["preset"]): ItemDraft {
  const days: DayDraft[] = preset?.date
    ? [
        {
          placementId: null,
          date: preset.date,
          timeMode: preset.startTime ? "timed" : "none",
          startTime: preset.startTime ?? null,
          endTime: preset.startTime ? (preset.endTime ?? addMinutesToTime(preset.startTime, APP_CONFIG.schedule.defaultDurationMin)) : null,
        },
      ]
    : [];
  return {
    title: "",
    notes: null,
    color: null,
    category: null,
    scheduleMode: preset?.date ? "days" : "none",
    timeMode: "none",
    startTime: null,
    endTime: null,
    recurrence: null,
    completion: "check",
    background: false,
    dueDate: null,
    estimateMin: null,
    rows: [],
    days,
  };
}

/** M2 — the single event form (create and edit). */
export function ItemForm({ item, preset, fromOccurrence, onClose }: Props) {
  const t = useT();
  const today = useToday();
  const { open } = useModals();
  const actions = useItemActions();
  const { data: placements, loading: placementsLoading } = useItemPlacements(item?.id ?? null);
  const [draft, setDraft] = useState<ItemDraft>(() => (item ? draftFromItem(item) : emptyDraft(preset)));
  const [estimate, setEstimate] = useState(item?.estimateMin ? formatDuration(item.estimateMin) : "");
  const [errors, setErrors] = useState<DraftErrors>({});
  const [openWhen, setOpenWhen] = useState(!!preset?.date || !!item);
  const daysLoaded = useRef(!item);
  const nameRef = useRef<HTMLInputElement>(null);

  // Load the root days of the item being edited.
  useEffect(() => {
    if (!item || daysLoaded.current || placementsLoading) return;
    daysLoaded.current = true;
    const days: DayDraft[] = placements
      .filter((p) => p.nodeId === null)
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .map((p) => ({ placementId: p.id, date: p.date, timeMode: p.timeMode, startTime: p.startTime, endTime: p.endTime }));
    setDraft((d) => ({ ...d, days }));
  }, [item, placements, placementsLoading]);

  useEffect(() => {
    if (!item) nameRef.current?.focus();
  }, [item]);

  const patch = (p: Partial<ItemDraft>) => setDraft((d) => ({ ...d, ...p }));
  const suggested = suggestedCategory({
    completion: draft.completion,
    scheduleMode: draft.scheduleMode,
    nodes: Object.fromEntries(draft.rows.filter((r) => r.title.trim()).map((r) => [r.id, { removedOn: null } as never])),
  });
  const category: Category = draft.category ?? suggested;

  const whenSummary = useMemo(() => {
    if (draft.scheduleMode === "none") return t.form.noDate;
    if (draft.scheduleMode === "days") return draft.days.length === 0 ? t.form.noDaysYet : draft.days.length === 1 ? t.form.inOneDay : fmt(t.form.inNDays, { n: draft.days.length });
    if (!draft.recurrence) return t.form.repeats;
    const time = draft.timeMode === "timed" ? ` · ${formatTimeRange(draft.startTime, draft.endTime)}` : draft.timeMode === "all_day" ? ` · ${t.common.allDay}` : "";
    return `${ruleSummary(draft.recurrence)}${time}`;
  }, [draft, t]);

  const setScheduleMode = (mode: ItemDraft["scheduleMode"]) => {
    if (mode === "repeat" && !draft.recurrence) {
      // Carry the time picked in the schedule (first day) over to the rule.
      const first = draft.days[0];
      const timed = first?.timeMode === "timed" && draft.timeMode === "none";
      patch({
        scheduleMode: mode,
        recurrence: defaultRule(first?.date ?? preset?.date ?? today),
        ...(timed ? { timeMode: "timed" as const, startTime: first.startTime, endTime: first.endTime } : {}),
      });
    } else patch({ scheduleMode: mode });
  };

  const addDay = () =>
    open({
      type: "pickDate",
      title: t.form.addDay,
      initial: draft.days.length ? draft.days[draft.days.length - 1].date : (preset?.date ?? today),
      onPick: (date) => setDraft((d) => ({ ...d, days: [...d.days, { placementId: null, date, timeMode: "none", startTime: null, endTime: null }] })),
    });

  const updateDay = (i: number, p: Partial<DayDraft>) => setDraft((d) => ({ ...d, days: d.days.map((x, k) => (k === i ? { ...x, ...p } : x)) }));

  const setDayTimeMode = (i: number, mode: TimeMode) => {
    const d = draft.days[i];
    if (mode === "timed") {
      const start = d.startTime ?? "09:00";
      const dur = parseEstimate(estimate) ?? APP_CONFIG.schedule.defaultDurationMin;
      updateDay(i, { timeMode: mode, startTime: start, endTime: d.endTime ?? addMinutesToTime(start, dur) });
    } else updateDay(i, { timeMode: mode });
  };

  function save() {
    const finalDraft: ItemDraft = {
      ...draft,
      estimateMin: parseEstimate(estimate),
      rows: draft.rows,
    };
    const errs = validateDraft(finalDraft);
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      if (errs.recurrence || errs.endTime || errs.days) setOpenWhen(true);
      return;
    }
    if (!item) {
      actions.create(finalDraft);
      onClose();
      return;
    }
    if (fromOccurrence && item.scheduleMode === "repeat" && finalDraft.scheduleMode === "repeat") {
      open({
        type: "scope",
        date: fromOccurrence.originalDate,
        allowOnly: true,
        onPick: (scope) => {
          if (scope === "only") {
            const timed = finalDraft.timeMode === "timed";
            actions.setOccurrenceTime(item, fromOccurrence.originalDate, null, timed ? finalDraft.startTime : null, timed ? finalDraft.endTime : null);
          } else if (scope === "following") actions.split(item, fromOccurrence.originalDate, finalDraft);
          else actions.update(item, finalDraft);
          onClose();
        },
      });
      return;
    }
    actions.update(item, finalDraft);
    onClose();
  }

  const cats: Category[] = ["task", "project", "event"];

  return (
    <Sheet
      wide
      title={item ? t.form.editTitle : t.form.newTitle}
      onClose={onClose}
      onSubmit={save}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            {t.common.cancel}
          </button>
          <button type="button" className="btn pri" onClick={save}>
            {t.common.save}
          </button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="f-name">{t.form.name}</label>
        <input
          id="f-name"
          ref={nameRef}
          className={`inp ${errors.title ? "err" : ""}`}
          placeholder={t.form.namePlaceholder}
          value={draft.title}
          onChange={(e) => patch({ title: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              save();
            }
          }}
        />
        {errors.title && <span className="err-text">{errors.title}</span>}
      </div>

      <div className="field">
        <span className="lbl">{t.form.category}</span>
        <Segmented
          value={category}
          onChange={(c) => patch({ category: c })}
          options={cats.map((c) => ({ value: c, label: c === suggested && draft.category === null ? `${t.category[c]} ✦` : t.category[c] }))}
        />
        <p className="hint">
          {t.category.hint}
          {draft.category === null ? ` ✦ ${t.category.suggested}.` : ""}
        </p>
      </div>

      <TreeEditor rows={draft.rows} onChange={(rows: EditorRow[]) => patch({ rows })} />

      <details className={styles.sec} open={openWhen} onToggle={(e) => setOpenWhen((e.target as HTMLDetailsElement).open)}>
        <summary>
          <span>
            <b>{t.form.when}</b>
            <span className={styles.sum}>{whenSummary}</span>
          </span>
        </summary>
        <div className={styles.in}>
          <Segmented
            value={draft.scheduleMode}
            onChange={setScheduleMode}
            options={[
              { value: "none", label: t.form.noDate },
              { value: "days", label: t.form.someDays },
              { value: "repeat", label: t.form.repeats },
            ]}
          />
          {draft.scheduleMode === "none" && <p className="hint">{t.form.noDateHint}</p>}

          {draft.scheduleMode === "days" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {draft.days.map((d, i) => (
                <div className="dayrow" key={`${d.placementId ?? "new"}-${i}`}>
                  <button
                    type="button"
                    style={{ flex: "1 1 120px", textAlign: "left", fontWeight: 700 }}
                    onClick={() => open({ type: "pickDate", title: t.common.date, initial: d.date, onPick: (date) => updateDay(i, { date }) })}
                  >
                    {dayRowLabel(d.date, today)}
                  </button>
                  <div className="seg" style={{ flex: "none" }}>
                    <button type="button" className={d.timeMode !== "timed" ? "on" : ""} onClick={() => setDayTimeMode(i, "none")}>
                      {t.common.noTime}
                    </button>
                    <button type="button" className={d.timeMode === "timed" ? "on" : ""} onClick={() => setDayTimeMode(i, "timed")}>
                      {t.common.withTime}
                    </button>
                  </div>
                  {d.timeMode === "timed" && (
                    <>
                      <input className={`inp ${styles.timeInp}`} type="time" value={d.startTime ?? ""} aria-label={t.common.start} onChange={(e) => updateDay(i, { startTime: e.target.value || null })} />
                      <input className={`inp ${styles.timeInp}`} type="time" value={d.endTime ?? ""} aria-label={t.common.end} onChange={(e) => updateDay(i, { endTime: e.target.value || null })} />
                    </>
                  )}
                  <button type="button" className="ib" aria-label={t.form.remove} onClick={() => setDraft((x) => ({ ...x, days: x.days.filter((_, k) => k !== i) }))}>
                    <CloseIcon size={16} />
                  </button>
                </div>
              ))}
              {errors.days && <span className="err-text">{errors.days}</span>}
              <button type="button" className="lnk" onClick={addDay}>
                <AddIcon size={16} />
                {t.form.addDay}
              </button>
              <p className="hint">{t.form.daysHint}</p>
            </div>
          )}

          {draft.scheduleMode === "repeat" && draft.recurrence && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <button type="button" className="pick" onClick={() => open({ type: "recurrence", rule: draft.recurrence!, onDone: (r) => patch({ recurrence: r }) })}>
                <span>
                  <b>{ruleSummary(draft.recurrence)}</b>
                  <span className="muted">{ruleRangeSummary(draft.recurrence)}</span>
                </span>
                <NextIcon size={18} />
              </button>
              {errors.recurrence && <span className="err-text">{errors.recurrence}</span>}
              <p className="hint">{t.form.repeatHint}</p>
              <span className="lbl">{t.form.schedule}</span>
              <Segmented
                value={draft.timeMode}
                onChange={(m) => patch({ timeMode: m, startTime: m === "timed" ? (draft.startTime ?? "09:00") : draft.startTime, endTime: m === "timed" ? (draft.endTime ?? "10:00") : draft.endTime })}
                options={[
                  { value: "none", label: t.common.noTime },
                  { value: "all_day", label: t.common.allDay },
                  { value: "timed", label: t.common.withTime },
                ]}
              />
              {draft.timeMode === "timed" && (
                <div className="pair">
                  <div className="field">
                    <label htmlFor="f-start">{t.common.start}</label>
                    <input id="f-start" className="inp" type="time" value={draft.startTime ?? ""} onChange={(e) => patch({ startTime: e.target.value || null })} />
                  </div>
                  <div className="field">
                    <label htmlFor="f-end">{t.common.end}</label>
                    <input id="f-end" className={`inp ${errors.endTime ? "err" : ""}`} type="time" value={draft.endTime ?? ""} onChange={(e) => patch({ endTime: e.target.value || null })} />
                  </div>
                </div>
              )}
              {errors.endTime && <span className="err-text">{errors.endTime}</span>}
            </div>
          )}
        </div>
      </details>

      <details className={styles.sec}>
        <summary>
          <span>
            <b>{t.form.onCompletion}</b>
            <span className={styles.sum}>{draft.completion === "check" ? t.form.check : t.form.block}</span>
          </span>
        </summary>
        <div className={styles.in}>
          <button type="button" className={`radio ${draft.completion === "check" ? "on" : ""}`} onClick={() => patch({ completion: "check" })}>
            <span>
              <b>{t.form.check}</b>
              <br />
              <span className="muted">{t.form.checkHint}</span>
            </span>
          </button>
          <button type="button" className={`radio ${draft.completion === "block" ? "on" : ""}`} onClick={() => patch({ completion: "block" })}>
            <span>
              <b>{t.form.block}</b>
              <br />
              <span className="muted">{t.form.blockHint}</span>
            </span>
          </button>
          {draft.completion === "block" && (
            <label className={styles.check}>
              <input type="checkbox" checked={draft.background} onChange={(e) => patch({ background: e.target.checked })} />
              {t.form.background}
            </label>
          )}
        </div>
      </details>

      <details className={styles.sec} open={!!item && (!!item.notes || !!item.dueDate || !!item.estimateMin || !!item.color)}>
        <summary>
          <span>
            <b>{t.form.moreOptions}</b>
            <span className={styles.sum}>{t.form.moreSummary}</span>
          </span>
        </summary>
        <div className={styles.in}>
          <div className="field">
            <label>{t.form.color}</label>
            <div className={styles.colors}>
              <button type="button" className={`${styles.auto} ${draft.color === null ? styles.on : ""}`} onClick={() => patch({ color: null })}>
                {t.form.colorAuto}
              </button>
              {APP_CONFIG.colors.map((c: ColorKey) => (
                <button
                  key={c}
                  type="button"
                  aria-label={c}
                  className={`${styles.swatch} ${draft.color === c ? styles.on : ""}`}
                  style={{ background: colorSolid(c) }}
                  onClick={() => patch({ color: c })}
                />
              ))}
            </div>
          </div>
          <div className="pair">
            {draft.scheduleMode !== "repeat" && (
              <div className="field">
                <label htmlFor="f-due">{t.form.due}</label>
                <input id="f-due" className="inp" type="date" value={draft.dueDate ?? ""} onChange={(e) => patch({ dueDate: e.target.value || null })} />
              </div>
            )}
            <div className="field">
              <label htmlFor="f-est">{t.form.estimate}</label>
              <input id="f-est" className="inp" placeholder={t.subtask.estimatePlaceholder} value={estimate} onChange={(e) => setEstimate(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="f-notes">{t.form.notes}</label>
            <textarea id="f-notes" className="inp" value={draft.notes ?? ""} onChange={(e) => patch({ notes: e.target.value })} />
          </div>
        </div>
      </details>
    </Sheet>
  );
}

