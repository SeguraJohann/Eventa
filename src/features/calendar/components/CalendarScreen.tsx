import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import type { DateKey } from "@/types/models";
import { useAgenda } from "@/features/data/hooks";
import { useToday } from "@/features/data/ClockContext";
import { useModals } from "@/features/modals/ModalContext";
import { DayView } from "@/features/day/components/DayView";
import { Schedule } from "@/features/day/components/Schedule";
import { useEntryHandlers } from "@/features/day/useEntryHandlers";
import { isTimed, type AgendaEntry } from "@/lib/agenda/agenda";
import { addDays, addMonths, isValidDateKey, monthGrid, parseDateKey, startOfMonth, startOfWeek } from "@/lib/date/dateKey";
import { dayMonth, monthYear, weekdayName, longDate } from "@/lib/date/format";
import { colorInk, colorSolid, colorTint } from "@/styles/semantic";
import { useIsMobile } from "@/lib/utils/useMediaQuery";
import { PrevIcon, NextIcon } from "@/components/icons";
import { ColorDot, Segmented } from "@/components/ui/misc";
import { capitalize, fmt, useT } from "@/i18n";
import type { CalendarMode } from "@/routes/paths";
import styles from "./CalendarScreen.module.css";

const MODES: CalendarMode[] = ["mes", "semana", "dia"];

export default function CalendarScreen() {
  const t = useT();
  const today = useToday();
  const [params, setParams] = useSearchParams();
  const rawMode = params.get("modo") as CalendarMode | null;
  const mode: CalendarMode = rawMode && MODES.includes(rawMode) ? rawMode : "mes";
  const rawDate = params.get("fecha");
  const date = rawDate && isValidDateKey(rawDate) ? rawDate : today;

  const go = (m: CalendarMode, d: DateKey) => setParams({ modo: m, fecha: d }, { replace: m === mode });

  const step = (dir: 1 | -1) => {
    if (mode === "mes") go(mode, addMonths(startOfMonth(date), dir));
    else if (mode === "semana") go(mode, addDays(date, 7 * dir));
    else go(mode, addDays(date, dir));
  };

  const title =
    mode === "dia"
      ? `${capitalize(weekdayName(date))} ${longDate(date, today)}`
      : mode === "semana"
        ? `${dayMonth(startOfWeek(date))} – ${dayMonth(addDays(startOfWeek(date), 6))}`
        : monthYear(date);

  return (
    <>
      <header className="top">
        <div>
          <p className="eyebrow desk-only">{t.nav.calendar}</p>
          <h1 className="h1">{title}</h1>
        </div>
        <div className={styles.nav}>
          <Segmented
            value={mode}
            label={t.nav.calendar}
            onChange={(m) => go(m, date)}
            options={[
              { value: "mes", label: t.calendar.month },
              { value: "semana", label: t.calendar.week },
              { value: "dia", label: t.calendar.day },
            ]}
          />
          <div className="seg">
            <button aria-label={t.calendar.prev} onClick={() => step(-1)}>
              <PrevIcon size={18} />
            </button>
            <button onClick={() => go(mode, today)}>{t.calendar.today}</button>
            <button aria-label={t.calendar.next} onClick={() => step(1)}>
              <NextIcon size={18} />
            </button>
          </div>
        </div>
      </header>
      {mode === "mes" && <MonthView date={date} onPick={(d) => go("dia", d)} />}
      {mode === "semana" && <WeekView date={date} onPick={(d) => go("dia", d)} />}
      {mode === "dia" && <DayMode date={date} />}
    </>
  );
}

function entryLabelStyle(e: AgendaEntry, mobile: boolean): React.CSSProperties {
  if (mobile) return { background: colorSolid(e.color, e.tone) };
  return { background: colorTint(e.color, e.tone), color: colorInk(e.color, e.tone) };
}

function MonthView({ date, onPick }: { date: DateKey; onPick: (d: DateKey) => void }) {
  const t = useT();
  const today = useToday();
  const mobile = useIsMobile();
  const grid = useMemo(() => monthGrid(date), [date]);
  const { byDay } = useAgenda(grid[0], grid[grid.length - 1]);
  const month = parseDateKey(date).m;
  const MAX = mobile ? 6 : 3;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="row muted" style={{ gap: 16, flexWrap: "wrap" }}>
        <span className="row" style={{ gap: 6 }}>
          <span className="dot" style={{ background: "var(--orange-s)", height: 6, width: 14 }} />
          {t.legend.repeatDone}
        </span>
        <span className="row" style={{ gap: 6 }}>
          <ColorDot color="blue" />
          {t.legend.once}
        </span>
        <span className="row" style={{ gap: 6 }}>
          <ColorDot color="slate" />
          {t.legend.block}
        </span>
      </div>
      <div className={styles.wk}>
        {t.dates.weekdaysHeader.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className={styles.grid}>
        {grid.map((d) => {
          const entries = (byDay.get(d) ?? []).filter((e) => e.state !== "skipped");
          const repeats = entries.filter((e) => e.kind === "occurrence" && e.checkable);
          const doneRepeats = repeats.filter((e) => e.state === "done").length;
          const shown = entries.slice(0, MAX);
          const cls = [styles.cell, parseDateKey(d).m !== month ? styles.out : "", d === today ? styles.today : ""].join(" ");
          return (
            <button key={d} className={cls} onClick={() => onPick(d)} aria-label={longDate(d, today)}>
              <span className={styles.dn}>{parseDateKey(d).d}</span>
              {repeats.length > 0 && (
                <span className={`bar ${styles.cbar}`}>
                  <i className="h" style={{ width: `${(doneRepeats / repeats.length) * 100}%` }} />
                </span>
              )}
              <span className={styles.blks}>
                {shown.map((e) => (
                  <span key={e.key} className={`${styles.blk} ${e.state === "done" ? styles.done : ""}`} style={entryLabelStyle(e, mobile)}>
                    {e.title}
                  </span>
                ))}
              </span>
              {entries.length > MAX && <span className={styles.more}>{fmt(t.calendar.more, { n: entries.length - MAX })}</span>}
            </button>
          );
        })}
      </div>
      <p className="muted">{t.calendar.tapDay}</p>
    </div>
  );
}

function WeekView({ date, onPick }: { date: DateKey; onPick: (d: DateKey) => void }) {
  const mobile = useIsMobile();
  const { open } = useModals();
  const handlers = useEntryHandlers();
  const from = startOfWeek(date);
  const to = addDays(from, 6);
  const { byDay } = useAgenda(from, to);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(from, i)), [from]);
  const columns = useMemo(() => days.map((d) => ({ date: d, entries: (byDay.get(d) ?? []).filter(isTimed) })), [days, byDay]);

  return (
    <div className="card">
      {!mobile && (
        <div className={styles.untimedRow} style={{ gridTemplateColumns: "44px repeat(7, minmax(0, 1fr))" }}>
          <span />
          {days.map((d) => (
            <div key={d} className={styles.untimedCell}>
              {(byDay.get(d) ?? [])
                .filter((e) => !isTimed(e))
                .slice(0, 4)
                .map((e) => (
                  <button key={e.key} className={`${styles.blk} ${e.state === "done" ? styles.done : ""}`} style={entryLabelStyle(e, false)} onClick={() => handlers.onTap(e)}>
                    {e.title}
                  </button>
                ))}
            </div>
          ))}
        </div>
      )}
      <Schedule
        columns={columns}
        showHeader
        compact={mobile}
        onHeaderTap={onPick}
        onColumnTap={onPick}
        onEmptySlot={(d, start, end) => open({ type: "addToDay", date: d, startTime: start, endTime: end })}
        onEntryTap={handlers.onTap}
        onEntryToggle={handlers.onToggle}
        onEntryMove={handlers.onMove}
      />
    </div>
  );
}

function DayMode({ date }: { date: DateKey }) {
  const t = useT();
  const today = useToday();
  const [, setParams] = useSearchParams();
  const { byDay } = useAgenda(date, date);
  const entries = byDay.get(date) ?? [];
  const nav = (
    <div className="row">
      <button className="btn sm icon" aria-label={t.calendar.prevDay} onClick={() => setParams({ modo: "dia", fecha: addDays(date, -1) }, { replace: true })}>
        <PrevIcon size={18} />
      </button>
      <b style={{ fontSize: 17, flex: 1 }}>{capitalize(`${weekdayName(date)} ${longDate(date, today)}`)}</b>
      <button className="btn sm icon" aria-label={t.calendar.nextDay} onClick={() => setParams({ modo: "dia", fecha: addDays(date, 1) }, { replace: true })}>
        <NextIcon size={18} />
      </button>
    </div>
  );
  return <DayView date={date} entries={entries} showOverdue={date === today} leftTop={nav} hint={date >= today ? t.calendar.dayHint : undefined} />;
}
