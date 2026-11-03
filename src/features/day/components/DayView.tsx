import { useMemo } from "react";
import type { DateKey } from "@/types/models";
import { splitDay, type AgendaEntry } from "@/lib/agenda/agenda";
import { useDay, useOverdue } from "@/features/data/hooks";
import { useToday } from "@/features/data/ClockContext";
import { useModals } from "@/features/modals/ModalContext";
import { useItemActions } from "@/features/items/hooks/useItemActions";
import { useEntryHandlers } from "@/features/day/useEntryHandlers";
import { pathTitles } from "@/lib/tree/tree";
import { relativeDate } from "@/lib/date/format";
import { AddIcon } from "@/components/icons";
import { ColorDot } from "@/components/ui/misc";
import { fmt, useT } from "@/i18n";
import { Schedule } from "./Schedule";
import { EntryRow } from "./EntryRow";

interface Props {
  date: DateKey;
  entries: AgendaEntry[];
  /** Show "pending from previous days" (only on today). */
  showOverdue?: boolean;
  /** Content above the untimed list (e.g. day navigation). */
  leftTop?: React.ReactNode;
  /** Extra hint under the untimed list. */
  hint?: string;
}

export function DayView({ date, entries, showOverdue, leftTop, hint }: Props) {
  const t = useT();
  const today = useToday();
  const { open } = useModals();
  const handlers = useEntryHandlers();
  const { untimed, timed } = useMemo(() => splitDay(entries), [entries]);

  return (
    <div className="cols">
      <div className="stack">
        {leftTop}
        {showOverdue && <OverdueCard />}
        <section className="card" style={{ padding: "12px 6px" }}>
          <h2 className="h2" style={{ padding: "0 10px 4px" }}>
            {t.today.untimed}
          </h2>
          {untimed.map((e) => (
            <EntryRow key={e.key} entry={e} onTap={handlers.onTap} onToggle={handlers.onToggle} />
          ))}
          {untimed.length === 0 && timed.length === 0 && <p className="muted" style={{ padding: "6px 10px" }}>{t.today.emptyDay}</p>}
          <button className="row muted" style={{ minHeight: 44, padding: "0 10px", width: "100%", fontWeight: 600 }} onClick={() => open({ type: "addToDay", date })}>
            <AddIcon size={18} />
            {t.today.addToDay}
          </button>
        </section>
        {hint && <p className="muted">{hint}</p>}
        <DayLogCard date={date} isToday={date === today} />
      </div>
      <section className="card" style={{ flex: "1 1 380px" }}>
        <div className="top" style={{ marginBottom: 12 }}>
          <h2 className="h2">{t.today.schedule}</h2>
          <span className="muted desk-only">{t.today.scheduleHint}</span>
        </div>
        <Schedule
          columns={[{ date, entries: timed }]}
          onEmptySlot={(d, start, end) => open({ type: "addToDay", date: d, startTime: start, endTime: end })}
          onEntryTap={handlers.onTap}
          onEntryToggle={handlers.onToggle}
          onEntryMove={handlers.onMove}
        />
      </section>
    </div>
  );
}

function OverdueCard() {
  const t = useT();
  const today = useToday();
  const { list } = useOverdue();
  const { open } = useModals();
  const actions = useItemActions();
  if (list.length === 0) return null;
  return (
    <section className="card" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <h2 className="h2">{t.today.overdue}</h2>
      {list.map(({ placement: p, item }) => {
        const title = p.nodeId ? [item.title, ...pathTitles(item.nodes, p.nodeId), item.nodes[p.nodeId].title].join(" › ") : item.title;
        return (
          <div
            key={p.id}
            className="row"
            style={{ padding: "10px 12px", borderRadius: 12, background: "var(--rose-t)", cursor: "pointer" }}
            onClick={() => open({ type: "reschedule", placement: p })}
            role="button"
            tabIndex={0}
          >
            <ColorDot color={item.color ?? "rose"} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <b style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</b>
              <p className="muted">{fmt(t.today.wasFor, { date: relativeDate(p.date, today, false) })}</p>
            </div>
            <button
              className="btn sm"
              onClick={(e) => {
                e.stopPropagation();
                actions.updatePlacement(p, { date: today });
              }}
            >
              {t.today.moveToToday}
            </button>
          </div>
        );
      })}
    </section>
  );
}

function DayLogCard({ date, isToday }: { date: DateKey; isToday: boolean }) {
  const t = useT();
  const { open } = useModals();
  const { data: day } = useDay(date);
  const log = useMemo(() => Object.values(day?.log ?? {}).sort((a, b) => a.at - b.at), [day]);
  return (
    <section className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <h2 className="h2">{isToday ? t.today.progress : t.today.progressOn}</h2>
      {log.length > 0 ? (
        <p className="muted">{log.map((l) => `✓ ${l.nodeId ? l.title : l.itemTitle}`).join(" · ")}</p>
      ) : (
        <p className="muted">{t.today.nothingDone}</p>
      )}
      {day?.note ? (
        <button className="note" style={{ textAlign: "left", color: "var(--ink)" }} onClick={() => open({ type: "dayNote", date })}>
          {day.note}
        </button>
      ) : (
        <button className="ghost" onClick={() => open({ type: "dayNote", date })}>
          {t.today.addNote}
        </button>
      )}
    </section>
  );
}

