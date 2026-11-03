import { useMemo } from "react";
import { useAgenda } from "@/features/data/hooks";
import { useToday } from "@/features/data/ClockContext";
import { useItemsData } from "@/features/data/ItemsContext";
import { useModals } from "@/features/modals/ModalContext";
import { DayView } from "@/features/day/components/DayView";
import { daySummary } from "@/lib/agenda/agenda";
import { longDate, weekdayName } from "@/lib/date/format";
import { AddIcon } from "@/components/icons";
import { ColorDot, Loading } from "@/components/ui/misc";
import { capitalize, fmt, useT } from "@/i18n";

export function TodayScreen() {
  const t = useT();
  const today = useToday();
  const { open } = useModals();
  const { error } = useItemsData();
  const { byDay, loading } = useAgenda(today, today);
  const entries = useMemo(() => byDay.get(today) ?? [], [byDay, today]);
  const summary = daySummary(entries);

  return (
    <>
      <header className="top">
        <div>
          <p className="eyebrow">{fmt(t.today.eyebrow, { weekday: capitalize(weekdayName(today)) })}</p>
          <h1 className="h1">{longDate(today, today)}</h1>
        </div>
        <div className="row">
          {summary.total > 0 && <span className="chip">{fmt(t.today.summary, summary)}</span>}
          <button className="btn pri desk-only" onClick={() => open({ type: "addToDay", date: today })}>
            <AddIcon size={18} />
            {t.today.addToday}
          </button>
        </div>
      </header>
      <Legend />
      {error && <p className="err-text">{t.app.genericError}</p>}
      {loading && entries.length === 0 ? <Loading /> : <DayView date={today} entries={entries} showOverdue />}
    </>
  );
}

export function Legend() {
  const t = useT();
  return (
    <div className="row muted" style={{ gap: 16, flexWrap: "wrap" }}>
      <span className="row" style={{ gap: 6 }}>
        <ColorDot color="orange" />
        {t.legend.repeat}
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
  );
}
