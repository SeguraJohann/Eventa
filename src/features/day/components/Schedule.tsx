import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { DateKey, TimeKey } from "@/types/models";
import { layoutTimed, type AgendaEntry, type LaidOut } from "@/lib/agenda/agenda";
import { minutesToTime, weekdayOf, parseDateKey } from "@/lib/date/dateKey";
import { formatTimeRange } from "@/lib/date/format";
import { APP_CONFIG } from "@/config/app.config";
import { useClock } from "@/features/data/ClockContext";
import { Checkbox } from "@/components/ui/Checkbox";
import { es, useT } from "@/i18n";
import styles from "./Schedule.module.css";

export interface ScheduleColumn {
  date: DateKey;
  entries: AgendaEntry[];
}

interface Props {
  columns: ScheduleColumn[];
  /** Day headers (week view). */
  showHeader?: boolean;
  /** Color blocks only; tapping a column opens the day (mobile week). */
  compact?: boolean;
  /** Take the parent's height (flex) instead of a fixed visible window. */
  fill?: boolean;
  onEmptySlot?: (date: DateKey, start: TimeKey, end: TimeKey) => void;
  onEntryTap?: (entry: AgendaEntry) => void;
  onEntryToggle?: (entry: AgendaEntry, checked: boolean) => void;
  onEntryMove?: (entry: AgendaEntry, date: DateKey, start: TimeKey, end: TimeKey) => void;
  onColumnTap?: (date: DateKey) => void;
  onHeaderTap?: (date: DateKey) => void;
}

const { hourHeight: HR, snapMinutes: SNAP, defaultStartHour, defaultEndHour, longPressMs, defaultDurationMin } = APP_CONFIG.schedule;
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const pxPerMin = HR / 60;

interface Drag {
  key: string;
  mode: "move" | "resize";
  pointerId: number;
  startX: number;
  startY: number;
  lo: LaidOut;
  colIndex: number;
  active: boolean;
  dyMin: number;
  targetCol: number;
  touch: boolean;
  timer: number | null;
}

function snap(min: number): number {
  return Math.round(min / SNAP) * SNAP;
}

function blockDetail(e: AgendaEntry): string {
  if (e.path.length > 0) return e.path.join(" › ");
  if (e.progress) return `${e.progress.done}/${e.progress.total}`;
  return "";
}

export function Schedule({ columns, showHeader, compact, fill, onEmptySlot, onEntryTap, onEntryToggle, onEntryMove, onColumnTap, onHeaderTap }: Props) {
  const t = useT();
  const clock = useClock();
  const scroller = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const [drag, setDrag] = useState<Drag | null>(null);

  const laid = useMemo(() => columns.map((c) => layoutTimed(c.entries)), [columns]);

  // Initial scroll: default start hour, or earlier if something starts before it.
  const firstMinute = useMemo(() => {
    let min = defaultStartHour * 60;
    for (const col of laid) for (const lo of col) if (!lo.background) min = Math.min(min, lo.startMin);
    return Math.max(0, Math.floor(min / 60) * 60);
  }, [laid]);
  const scrolledOnce = useRef(false);
  const showsToday = columns.some((c) => c.date === clock.today);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (scrolledOnce.current || !el) return;
    scrolledOnce.current = true;
    // Today: put the current-time line about a third from the top.
    el.scrollTop = showsToday ? Math.max(0, clock.minutes * pxPerMin - el.clientHeight / 3) : firstMinute * pxPerMin;
  }, [firstMinute, showsToday, clock.minutes]);

  // While dragging on touch screens, stop the page from scrolling.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onMove = (e: TouchEvent) => {
      if (dragRef.current?.active) e.preventDefault();
    };
    el.addEventListener("touchmove", onMove, { passive: false });
    return () => el.removeEventListener("touchmove", onMove);
  }, []);

  const visibleHeight = (defaultEndHour - defaultStartHour) * HR + (showHeader ? 56 : 0);
  const gridCols = `44px repeat(${columns.length}, minmax(0, 1fr))`;
  const canDrag = !!onEntryMove && !compact;

  function colFromX(clientX: number): number {
    const grid = gridRef.current;
    if (!grid) return 0;
    const rect = grid.getBoundingClientRect();
    const colW = (rect.width - 44) / columns.length;
    return Math.max(0, Math.min(columns.length - 1, Math.floor((clientX - rect.left - 44) / colW)));
  }

  function startDrag(e: ReactPointerEvent, lo: LaidOut, colIndex: number, mode: "move" | "resize") {
    if (!canDrag || e.button !== 0) return;
    const entry = lo.entry;
    if (entry.state === "skipped") return;
    const touch = e.pointerType !== "mouse";
    const d: Drag = {
      key: entry.key,
      mode,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      lo,
      colIndex,
      active: mode === "resize",
      dyMin: 0,
      targetCol: colIndex,
      touch,
      timer: null,
    };
    const target = e.currentTarget as HTMLElement;
    if (mode === "resize") {
      e.stopPropagation();
      target.setPointerCapture(e.pointerId);
    } else if (touch) {
      d.timer = window.setTimeout(() => {
        if (dragRef.current === d) {
          d.active = true;
          try {
            target.setPointerCapture(d.pointerId);
          } catch {
            /* pointer already gone */
          }
          navigator.vibrate?.(15);
          setDrag({ ...d });
        }
      }, longPressMs);
    }
    dragRef.current = d;
    if (d.active) setDrag({ ...d });
  }

  function moveDrag(e: ReactPointerEvent) {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.active) {
      if (d.touch) {
        // Moving before the long press means the user is scrolling.
        if (Math.hypot(dx, dy) > 8) cancelDrag();
        return;
      }
      if (Math.hypot(dx, dy) < 5) return;
      d.active = true;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    d.dyMin = snap(dy / pxPerMin);
    if (d.mode === "move") d.targetCol = colFromX(e.clientX);
    setDrag({ ...d });
  }

  function cancelDrag() {
    const d = dragRef.current;
    if (d?.timer) window.clearTimeout(d.timer);
    dragRef.current = null;
    setDrag(null);
  }

  function endDrag(e: ReactPointerEvent) {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    if (d.timer) window.clearTimeout(d.timer);
    dragRef.current = null;
    setDrag(null);
    if (!d.active) return;
    suppressClick.current = true;
    window.setTimeout(() => (suppressClick.current = false), 50);
    const { lo } = d;
    const duration = lo.endMin - lo.startMin;
    let start = lo.startMin;
    let end = lo.endMin;
    if (d.mode === "move") {
      start = Math.max(0, Math.min(24 * 60 - duration, lo.startMin + d.dyMin));
      end = start + duration;
    } else {
      end = Math.max(lo.startMin + SNAP, Math.min(24 * 60, lo.endMin + d.dyMin));
    }
    const date = columns[d.targetCol]?.date ?? columns[d.colIndex].date;
    if (start === lo.startMin && end === lo.endMin && d.targetCol === d.colIndex) return;
    onEntryMove?.(lo.entry, date, minutesToTime(start), minutesToTime(end));
  }

  function onColumnClick(e: React.MouseEvent<HTMLDivElement>, date: DateKey) {
    if (e.target !== e.currentTarget || suppressClick.current) return;
    if (compact) {
      onColumnTap?.(date);
      return;
    }
    if (!onEmptySlot) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const min = Math.floor((e.clientY - rect.top) / pxPerMin / 30) * 30;
    const start = Math.max(0, Math.min(23 * 60, min));
    onEmptySlot(date, minutesToTime(start), minutesToTime(Math.min(24 * 60, start + defaultDurationMin)));
  }

  const nowTop = clock.minutes * pxPerMin;

  return (
    <div
      className={`${styles.scroller} ${compact ? styles.compact : ""} ${fill ? styles.fill : ""}`}
      ref={scroller}
      style={fill ? undefined : { maxHeight: visibleHeight }}
    >
      {showHeader && (
        <div className={styles.head} style={{ gridTemplateColumns: gridCols }}>
          <span />
          {columns.map((c) => {
            const wd = weekdayOf(c.date);
            return (
              <button
                key={c.date}
                type="button"
                className={`${styles.wh} ${c.date === clock.today ? styles.on : ""}`}
                onClick={() => onHeaderTap?.(c.date)}
              >
                {es.dates.weekdaysHeader[wd - 1]}
                <b>{parseDateKey(c.date).d}</b>
              </button>
            );
          })}
        </div>
      )}
      <div className={styles.grid} ref={gridRef} style={{ gridTemplateColumns: gridCols, height: 24 * HR }}>
        <div className={styles.hours} aria-hidden="true">
          {HOURS.map((h) => (
            <span key={h}>{h}:00</span>
          ))}
        </div>
        {columns.map((c, ci) => (
          <div
            key={c.date}
            className={`${styles.col} ${c.date < clock.today ? styles.past : ""}`}
            onClick={(e) => onColumnClick(e, c.date)}
            role="presentation"
          >
            {laid[ci].map((lo) => {
              const e = lo.entry;
              const isDragging = drag?.key === e.key && drag.active;
              let startMin = lo.startMin;
              let endMin = lo.endMin;
              if (isDragging && drag) {
                if (drag.mode === "move") {
                  const dur = lo.endMin - lo.startMin;
                  startMin = Math.max(0, Math.min(24 * 60 - dur, lo.startMin + drag.dyMin));
                  endMin = startMin + dur;
                } else endMin = Math.max(lo.startMin + SNAP, Math.min(24 * 60, lo.endMin + drag.dyMin));
              }
              const colShift = isDragging && drag ? drag.targetCol - ci : 0;
              const width = lo.background ? "calc(100% - 12px)" : `calc((100% - 12px) / ${lo.cols} - 2px)`;
              const left = lo.background ? "6px" : `calc(6px + (100% - 12px) * ${lo.col} / ${lo.cols})`;
              const cls = [
                styles.ev,
                styles[e.tone],
                e.state === "done" ? styles.done : "",
                e.state === "skipped" ? styles.skipped : "",
                isDragging ? styles.dragging : "",
              ].join(" ");
              const small = endMin - startMin < 45;
              const checkable = e.checkable && !e.progress && e.state !== "skipped";
              return (
                <div
                  key={e.key}
                  className={cls}
                  style={{
                    top: startMin * pxPerMin,
                    height: Math.max(14, (endMin - startMin) * pxPerMin - 2),
                    left: colShift ? `calc(${left} + ${colShift * 100}%)` : left,
                    width,
                    padding: small ? "2px 6px" : undefined,
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label={`${e.title} ${formatTimeRange(e.startTime, e.endTime)}`}
                  onPointerDown={(ev) => startDrag(ev, lo, ci, "move")}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={cancelDrag}
                  onContextMenu={(ev) => canDrag && ev.preventDefault()}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    if (suppressClick.current) return;
                    if (compact) onColumnTap?.(c.date);
                    else onEntryTap?.(e);
                  }}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter" || ev.key === " ") {
                      ev.preventDefault();
                      onEntryTap?.(e);
                    }
                  }}
                >
                  {(checkable || (e.checkable && e.progress)) && !small && (
                    <Checkbox
                      small
                      state={e.state === "missed" ? "pending" : e.state}
                      label={t.detail.markDone}
                      onToggle={checkable && onEntryToggle ? (checked) => onEntryToggle(e, checked) : undefined}
                    />
                  )}
                  <div className={styles.txt}>
                    <b style={small ? { whiteSpace: "nowrap" } : undefined}>{e.title}</b>
                    {!small && (
                      <small>
                        {isDragging ? formatTimeRange(minutesToTime(startMin), minutesToTime(endMin)) : formatTimeRange(e.startTime, e.endTime)}
                        {blockDetail(e) ? ` · ${blockDetail(e)}` : ""}
                      </small>
                    )}
                  </div>
                  {canDrag && !lo.background && (
                    <span
                      className={styles.resize}
                      onPointerDown={(ev) => startDrag(ev, lo, ci, "resize")}
                      onPointerMove={moveDrag}
                      onPointerUp={endDrag}
                      onPointerCancel={cancelDrag}
                      onClick={(ev) => ev.stopPropagation()}
                    />
                  )}
                </div>
              );
            })}
            {c.date === clock.today && <div className={styles.now} style={{ top: nowTop }} />}
          </div>
        ))}
      </div>
    </div>
  );
}
