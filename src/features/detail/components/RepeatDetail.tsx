import { useEffect, useMemo, useState } from "react";
import type { DateKey, Item, Occurrence } from "@/types/models";
import { ROOT_KEY, occurrenceId } from "@/types/models";
import { useChainOccurrences } from "@/features/data/hooks";
import { useItemsData } from "@/features/data/ItemsContext";
import { useToday } from "@/features/data/ClockContext";
import { useModals } from "@/features/modals/ModalContext";
import { useItemActions } from "@/features/items/hooks/useItemActions";
import { aliveIndex, leavesUnder, occurrenceProgress, templateIndex, type NodeState } from "@/lib/tree/tree";
import { computeStats, heatmap, historyOf, itemChain, itemRuleContext, occurrenceState } from "@/lib/recurrence/occurrences";
import { nextDates, occursOn } from "@/lib/recurrence/engine";
import { addDays, weekdayOf } from "@/lib/date/dateKey";
import { cycleLetter, dayMonth, formatTimeRange, relativeDate, ruleRangeSummary, ruleSummary, shortDate, weekdaysLetters } from "@/lib/date/format";
import { useIsMobile } from "@/lib/utils/useMediaQuery";
import { APP_CONFIG } from "@/config/app.config";
import { PauseIcon, ResumeIcon } from "@/components/icons";
import { capitalize, fmt, useT } from "@/i18n";
import { TreeView } from "./TreeView";
import { SubtaskPanel } from "./SubtaskPanel";
import styles from "./Detail.module.css";

const ALL_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

export function RepeatDetail({ item, readOnly }: { item: Item; readOnly: boolean }) {
  const t = useT();
  const today = useToday();
  const mobile = useIsMobile();
  const { open } = useModals();
  const actions = useItemActions();
  const { lookupItem } = useItemsData();
  const [selected, setSelected] = useState<string | null>(null);

  const chain = useMemo(() => itemChain(item, lookupItem), [item, lookupItem]);
  const { data: docsByItem } = useChainOccurrences(chain.map((i) => i.id));
  const docs = useMemo(() => docsByItem.get(item.id) ?? new Map<string, Occurrence>(), [docsByItem, item.id]);
  const ctx = itemRuleContext(item);
  const check = item.completion === "check";

  useEffect(() => {
    if (selected && (!item.nodes[selected] || item.nodes[selected].removedOn !== null)) setSelected(null);
  }, [selected, item.nodes]);

  const stats = useMemo(() => (check ? computeStats(historyOf(chain, docsByItem, today), today, APP_CONFIG.stats.rateWindow) : null), [check, chain, docsByItem, today]);

  // Today's occurrence, or the next one.
  const focusDate: DateKey | null = useMemo(() => {
    if (!ctx) return null;
    if (item.status === "active" && occursOn(ctx, today)) return today;
    return nextDates(ctx, addDays(today, 1), 1)[0] ?? null;
  }, [ctx, item.status, today]);

  const upcoming = useMemo(() => (ctx ? nextDates(ctx, today, 8) : []), [ctx, today]);

  const exceptions = useMemo(() => {
    const from = addDays(today, -14);
    const to = addDays(today, 60);
    return [...docs.values()]
      .filter((o) => o.originalDate >= from && o.originalDate <= to && (o.status === "skipped" || o.movedToDate || o.startTime))
      .sort((a, b) => (a.originalDate < b.originalDate ? -1 : 1));
  }, [docs, today]);

  const heat = useMemo(() => heatmap(item, docs, today, APP_CONFIG.stats.heatmapWeeks), [item, docs, today]);

  const rule = item.recurrence!;
  const timeText = item.timeMode === "timed" ? formatTimeRange(item.startTime, item.endTime) : item.timeMode === "all_day" ? t.common.allDay : t.common.noTime;
  const ended = ctx?.end && ctx.end < today;

  return (
    <>
      {check && stats && (
        <div className={styles.stats}>
          <div className={`card ${styles.stat}`}>
            <b style={{ color: "var(--orange)" }}>{stats.current}</b>
            <span className="muted">{t.detail.statsCurrent}</span>
          </div>
          <div className={`card ${styles.stat}`}>
            <b>{stats.best}</b>
            <span className="muted">{t.detail.statsBest}</span>
          </div>
          <div className={`card ${styles.stat}`}>
            <b>{stats.rate === null ? "—" : `${Math.round(stats.rate * 100)}%`}</b>
            <span className="muted">{t.detail.statsRate}</span>
          </div>
        </div>
      )}

      {item.notes && <p className="note">{item.notes}</p>}

      <div className="cols">
        <div className="stack">
          <OccurrenceCard item={item} date={focusDate} docs={docs} readOnly={readOnly || item.status !== "active"} selected={selected} onSelect={setSelected} />
          {!check && (
            <section className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <b>{t.detail.upcoming}</b>
              {upcoming.length === 0 ? <p className="muted">{t.detail.noUpcoming}</p> : upcoming.map((d) => <p key={d}>{capitalize(relativeDate(d, today))} · {timeText}</p>)}
            </section>
          )}
          {selected && item.nodes[selected] && !mobile && (
            <aside className="card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <p className="eyebrow" style={{ margin: 0 }}>
                {t.detail.selected}
              </p>
              <SubtaskPanel item={item} nodeId={selected} placements={[]} readOnly={readOnly} onDeleted={() => setSelected(null)} />
            </aside>
          )}
        </div>

        <div className="stack">
          <section className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="top">
              <b style={{ fontSize: 16 }}>{t.detail.when}</b>
              {!readOnly && (
                <button className="lnk" onClick={() => open({ type: "recurrence", rule, onDone: (r) => actions.updateRecurrence(item, r) })}>
                  {t.common.edit}
                </button>
              )}
            </div>
            <p>
              {ruleSummary(rule)} · {timeText} · {check ? t.form.check.toLowerCase() : t.form.block.toLowerCase()}
              {item.background ? ` · ${t.events.background}` : ""}
            </p>
            <p className="muted">{ruleRangeSummary(rule)}</p>
            {ended && <p className="muted">{fmt(t.detail.endedOn, { date: dayMonth(ctx!.end!) })}</p>}
            {(rule.type === "week_cycle" ? rule.cycle ?? [] : rule.type === "weekdays" || rule.type === "every_n_weeks" ? [{ weekdays: rule.weekdays ?? [] }] : []).map((w, i) => (
              <div className="row" key={i} style={{ flexWrap: "wrap" }}>
                {rule.type === "week_cycle" && (
                  <span className="lbl" style={{ width: 76 }}>
                    {fmt(t.detail.weekLabel, { letter: cycleLetter(i) })}
                  </span>
                )}
                {ALL_WEEKDAYS.map((d) => (
                  <span key={d} className={`dchip s ${w.weekdays.includes(d) ? "on" : ""}`}>
                    {t.dates.weekdaysLetter[d - 1]}
                  </span>
                ))}
              </div>
            ))}
            <p className="lbl" style={{ marginTop: 6 }}>
              {t.detail.exceptions}
            </p>
            {exceptions.length === 0 && <p className="muted">{t.detail.noExceptions}</p>}
            {exceptions.map((o) => (
              <button key={o.id} className="muted" style={{ textAlign: "left" }} onClick={() => open({ type: "occurrence", itemId: item.id, originalDate: o.originalDate })}>
                {o.status === "skipped"
                  ? fmt(t.detail.exSkipped, { date: shortDate(o.originalDate) })
                  : o.movedToDate
                    ? fmt(t.detail.exMoved, { date: shortDate(o.originalDate), to: shortDate(o.movedToDate) })
                    : fmt(t.detail.exTime, { date: shortDate(o.originalDate), time: formatTimeRange(o.startTime, o.endTime) })}
              </button>
            ))}
          </section>

          {check && (
            <section className="card">
              <b style={{ display: "block", marginBottom: 10, fontSize: 16 }}>{fmt(t.detail.heatmap, { n: APP_CONFIG.stats.heatmapWeeks })}</b>
              <div className={styles.heat}>
                {heat.flat().map((c) => (
                  <button
                    key={c.date}
                    className={`${styles.hc} ${styles[c.level]} ${c.date === today ? styles.today : ""}`}
                    title={`${shortDate(c.date)}`}
                    aria-label={shortDate(c.date)}
                    disabled={c.level === "none" || c.date > today}
                    onClick={() => open({ type: "pastOccurrence", itemId: item.id, originalDate: c.date })}
                  />
                ))}
              </div>
              <p className="muted" style={{ marginTop: 8 }}>
                {t.detail.heatHint}
              </p>
            </section>
          )}

          {!readOnly && (
            <button className="btn" onClick={() => actions.setStatus(item, item.status === "paused" ? "active" : "paused")}>
              {item.status === "paused" ? <ResumeIcon size={16} /> : <PauseIcon size={16} />}
              {item.status === "paused" ? t.detail.resume : t.detail.pause}
            </button>
          )}
        </div>
      </div>

      {selected && item.nodes[selected] && mobile && (
        <div className={styles.selbar}>
          <button style={{ flex: 1, minWidth: 0, textAlign: "left" }} onClick={() => open({ type: "subtask", itemId: item.id, nodeId: selected })}>
            <p className="muted">{t.detail.selected}</p>
            <b style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.nodes[selected].title}</b>
          </button>
          <button className="btn pri" onClick={() => open({ type: "subtask", itemId: item.id, nodeId: selected })}>
            {t.common.edit}
          </button>
        </div>
      )}
    </>
  );
}

interface OccProps {
  item: Item;
  date: DateKey | null;
  docs: Map<string, Occurrence>;
  readOnly: boolean;
  selected: string | null;
  onSelect: (id: string) => void;
}

/** The occurrence of today (or the next one) with its subtasks. */
function OccurrenceCard({ item, date, docs, readOnly, selected, onSelect }: OccProps) {
  const t = useT();
  const today = useToday();
  const actions = useItemActions();
  const check = item.completion === "check";
  const viewDate = date ?? today;
  const display = useMemo(() => aliveIndex(item.nodes, viewDate), [item.nodes, viewDate]);
  const template = useMemo(() => templateIndex(item.nodes, viewDate), [item.nodes, viewDate]);
  const doc = date ? docs.get(occurrenceId(item.id, date)) ?? null : null;
  const done = doc?.done ?? {};
  const prog = occurrenceProgress(template, done, ROOT_KEY);
  const state = date ? occurrenceState(item, date, date, doc, today).state : "pending";
  const canCheck = check && !readOnly && date !== null && date <= today;
  const wd = weekdayOf(viewDate);

  const inTemplate = (id: string) => template.order.includes(id);
  const leafProgress = (id: string) => {
    if (!inTemplate(id)) return { done: 0, total: 0 };
    const leaves = leavesUnder(template, id);
    return { done: leaves.filter((l) => done[l] !== undefined).length, total: leaves.length };
  };
  const stateOfNode = (id: string): NodeState => {
    const p = leafProgress(id);
    if (p.total === 0) return "pending";
    return p.done === p.total ? "done" : p.done > 0 ? "partial" : "pending";
  };

  const label = date === null ? t.detail.occurrenceNone : date === today ? t.detail.occurrenceToday : fmt(t.detail.occurrenceNext, { date: relativeDate(date, today, false) });
  const time = item.timeMode === "timed" ? ` · ${formatTimeRange(doc?.startTime ?? item.startTime, doc?.endTime ?? item.endTime)}` : "";

  return (
    <section className="card" style={{ padding: "12px 6px" }}>
      <div className="top" style={{ padding: "0 10px" }}>
        <b style={{ fontSize: 16 }}>
          {label}
          {date && time}
        </b>
        {check && date && template.order.length > 0 && <span className="chip task">{fmt(t.today.summary, prog)}</span>}
        {check && date && template.order.length === 0 && canCheck && (
          <button className="btn sm" onClick={() => actions.toggleOccurrence(item, date, doc, null, state !== "done")}>
            {state === "done" ? t.occurrence.unmark : t.occurrence.markDone}
          </button>
        )}
      </div>
      <p className="muted" style={{ padding: "2px 10px 6px" }}>
        {t.detail.occurrenceHint}
      </p>
      {display.order.length > 0 || !readOnly ? (
        <TreeView
          storageKey={`eventa.collapsed.${item.id}`}
          index={display}
          stateOf={stateOfNode}
          progressOf={(id) => {
            const p = leafProgress(id);
            return p.total > 0 ? p : null;
          }}
          onToggle={canCheck ? (id, c) => actions.toggleOccurrence(item, date!, doc, id, c) : undefined}
          isOff={(id) => !inTemplate(id)}
          selectedId={selected}
          onSelect={onSelect}
          renderRight={(id) => {
            const days = item.nodes[id].weekdays;
            if (!days) return null;
            return <span className={`chip ${days.includes(wd) ? "" : ""}`}>{fmt(t.detail.onlyDays, { days: days.length === 1 ? t.dates.weekdays[days[0] - 1] : weekdaysLetters(days) })}</span>;
          }}
          onAdd={readOnly ? undefined : (parent, title) => actions.addNode(item, parent, title)}
        />
      ) : null}
    </section>
  );
}
