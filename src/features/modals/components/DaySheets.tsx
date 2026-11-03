// M1 (add to this day), M5 (put on a day), M13 (reschedule), M14 (day note),
// plus generic date/time pickers.

import { useMemo, useState } from "react";
import type { DateKey, Placement, TimeKey } from "@/types/models";
import { useItemsData } from "@/features/data/ItemsContext";
import { useDay } from "@/features/data/hooks";
import { useToday } from "@/features/data/ClockContext";
import { useModals } from "@/features/modals/ModalContext";
import { useItemActions } from "@/features/items/hooks/useItemActions";
import { isRepeating } from "@/lib/agenda/items";
import { aliveIndex, depthOf, isNodeComplete } from "@/lib/tree/tree";
import { addMinutesToTime, isValidDateKey, timeToMinutes } from "@/lib/date/dateKey";
import { dayMonth, dayRowLabel, formatTime, longDate, weekdayName } from "@/lib/date/format";
import { APP_CONFIG } from "@/config/app.config";
import { AddIcon, PlaceIcon, SearchIcon } from "@/components/icons";
import { Sheet } from "@/components/ui/Sheet";
import { ColorDot, Segmented } from "@/components/ui/misc";
import { toneOf } from "@/lib/agenda/agenda";
import { fmt, useT } from "@/i18n";

// ---------- M1 ----------

export function AddToDaySheet({ date, startTime, endTime, onClose }: { date: DateKey; startTime?: TimeKey; endTime?: TimeKey; onClose: () => void }) {
  const t = useT();
  const { replace } = useModals();
  const title = fmt(t.addToDay.title, { date: `${weekdayName(date)} ${dayMonth(date)}` }) + (startTime ? ` · ${formatTime(startTime)}` : "");
  return (
    <Sheet title={title} onClose={onClose} footer={<button className="btn" onClick={onClose}>{t.common.cancel}</button>}>
      <button className="opt" onClick={() => replace({ type: "itemForm", mode: "create", date, startTime, endTime })}>
        <span className="ic blue">
          <AddIcon size={18} />
        </span>
        <span>
          <b>{t.addToDay.newEvent}</b>
          <br />
          <span className="muted">{t.addToDay.newEventHint}</span>
        </span>
      </button>
      <button className="opt" onClick={() => replace({ type: "place", date, startTime, endTime })}>
        <span className="ic teal">
          <PlaceIcon size={18} />
        </span>
        <span>
          <b>{t.addToDay.existing}</b>
          <br />
          <span className="muted">{t.addToDay.existingHint}</span>
        </span>
      </button>
    </Sheet>
  );
}

// ---------- M5 ----------

interface Target {
  key: string;
  itemId: string;
  nodeId: string | null;
  label: string;
  depth: number;
  estimate: number | null;
  done: boolean;
}

export function PlaceSheet(props: { date?: DateKey; itemId?: string; nodeId?: string | null; startTime?: TimeKey; endTime?: TimeKey; onClose: () => void }) {
  const t = useT();
  const today = useToday();
  const { items } = useItemsData();
  const actions = useItemActions();
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(props.itemId ? `${props.itemId}|${props.nodeId ?? ""}` : null);
  const [date, setDate] = useState<DateKey>(props.date ?? today);
  const [mode, setMode] = useState<"none" | "timed">(props.startTime ? "timed" : "none");
  const [start, setStart] = useState<TimeKey>(props.startTime ?? "09:00");
  const [end, setEnd] = useState<TimeKey>(props.endTime ?? "10:00");
  const [endTouched, setEndTouched] = useState(!!props.endTime);

  const targets = useMemo(() => {
    const out: Target[] = [];
    for (const item of [...items].sort((a, b) => a.title.localeCompare(b.title))) {
      if (item.status !== "active" || isRepeating(item)) continue;
      out.push({ key: `${item.id}|`, itemId: item.id, nodeId: null, label: item.title, depth: 0, estimate: item.estimateMin, done: isNodeComplete(item.nodes, item.completedAt, null) });
      const idx = aliveIndex(item.nodes);
      for (const id of idx.order) {
        out.push({
          key: `${item.id}|${id}`,
          itemId: item.id,
          nodeId: id,
          label: item.nodes[id].title,
          depth: depthOf(item.nodes, id) + 1,
          estimate: item.nodes[id].estimateMin,
          done: isNodeComplete(item.nodes, item.completedAt, id),
        });
      }
    }
    return out;
  }, [items]);

  const query = q.trim().toLowerCase();
  const visible = query ? targets.filter((x) => x.label.toLowerCase().includes(query) || items.find((i) => i.id === x.itemId)?.title.toLowerCase().includes(query)) : targets;
  const target = targets.find((x) => x.key === selected) ?? null;
  const item = target ? items.find((i) => i.id === target.itemId) : undefined;

  const pick = (x: Target) => {
    setSelected(x.key);
    if (mode === "timed" && !endTouched && x.estimate) setEnd(addMinutesToTime(start, x.estimate));
  };

  const valid = !!target && !!item && isValidDateKey(date) && (mode === "none" || timeToMinutes(end) > timeToMinutes(start));

  const submit = () => {
    if (!valid || !target || !item) return;
    actions.place(item, { itemId: item.id, nodeId: target.nodeId, date, timeMode: mode, startTime: mode === "timed" ? start : null, endTime: mode === "timed" ? end : null });
    props.onClose();
  };

  return (
    <Sheet
      title={t.place.title}
      onClose={props.onClose}
      onSubmit={submit}
      footer={
        <>
          <button className="btn" onClick={props.onClose}>
            {t.common.cancel}
          </button>
          <button className="btn pri" disabled={!valid} onClick={submit}>
            {t.place.submit}
          </button>
        </>
      }
    >
      <div className="field">
        <label>{t.place.target}</label>
        {!props.itemId && (
          <label className="row" style={{ position: "relative" }}>
            <SearchIcon size={16} style={{ position: "absolute", left: 12, color: "var(--muted)" }} />
            <input className="inp" style={{ paddingLeft: 36 }} placeholder={t.place.searchPlaceholder} value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          </label>
        )}
        <div style={{ maxHeight: 260, overflow: "auto", border: "1px solid var(--line)", borderRadius: 10, padding: 4 }} role="listbox">
          {visible.length === 0 && <p className="muted" style={{ padding: 10 }}>{t.place.noResults}</p>}
          {visible.map((x) => {
            const it = items.find((i) => i.id === x.itemId)!;
            return (
              <button
                key={x.key}
                type="button"
                role="option"
                aria-selected={selected === x.key}
                className="row"
                style={{
                  width: "100%",
                  minHeight: 38,
                  padding: `0 10px 0 ${10 + x.depth * 18}px`,
                  borderRadius: 8,
                  background: selected === x.key ? "var(--blue-t)" : undefined,
                  color: x.done ? "var(--muted)" : undefined,
                  textDecoration: x.done ? "line-through" : undefined,
                  fontWeight: x.depth === 0 ? 700 : 500,
                  textAlign: "left",
                }}
                onClick={() => pick(x)}
              >
                {x.depth === 0 && <ColorDot color={it.color} tone={toneOf(it)} />}
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.depth === 0 && aliveIndex(it.nodes).order.length > 0 ? fmt(t.place.whole, { title: x.label }) : x.label}</span>
              </button>
            );
          })}
        </div>
        <p className="hint">{t.place.repeatingNote}</p>
      </div>
      <div className="field">
        <label htmlFor="p-date">{t.common.date}</label>
        <input id="p-date" className="inp" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
      </div>
      <Segmented
        value={mode}
        onChange={(m) => {
          setMode(m);
          if (m === "timed" && !endTouched && target?.estimate) setEnd(addMinutesToTime(start, target.estimate));
        }}
        options={[
          { value: "none", label: t.common.noTime },
          { value: "timed", label: t.common.withTime },
        ]}
      />
      {mode === "timed" && (
        <div className="pair">
          <div className="field">
            <label htmlFor="p-start">{t.common.start}</label>
            <input
              id="p-start"
              className="inp"
              type="time"
              value={start}
              onChange={(e) => {
                const v = e.target.value;
                if (!v) return;
                const dur = timeToMinutes(end) - timeToMinutes(start);
                setStart(v);
                setEnd(addMinutesToTime(v, dur > 0 ? dur : (target?.estimate ?? APP_CONFIG.schedule.defaultDurationMin)));
              }}
            />
          </div>
          <div className="field">
            <label htmlFor="p-end">{t.common.end}</label>
            <input
              id="p-end"
              className={`inp ${timeToMinutes(end) <= timeToMinutes(start) ? "err" : ""}`}
              type="time"
              value={end}
              onChange={(e) => {
                setEndTouched(true);
                if (e.target.value) setEnd(e.target.value);
              }}
            />
          </div>
        </div>
      )}
      <p className="muted">{t.place.hint}</p>
    </Sheet>
  );
}

// ---------- M13 ----------

export function RescheduleSheet({ placement, onClose }: { placement: Placement; onClose: () => void }) {
  const t = useT();
  const today = useToday();
  const { lookupItem } = useItemsData();
  const { open } = useModals();
  const actions = useItemActions();
  const item = lookupItem(placement.itemId);
  const title = item ? (placement.nodeId ? item.nodes[placement.nodeId]?.title ?? item.title : item.title) : "";
  const past = placement.date < today;
  return (
    <Sheet
      eyebrow={dayRowLabel(placement.date, today)}
      title={past ? t.reschedule.title : title}
      onClose={onClose}
      footer={<button className="btn" onClick={onClose}>{t.common.cancel}</button>}
    >
      {past && <p className="muted">{title}</p>}
      {placement.date !== today && (
        <button
          className="opt"
          onClick={() => {
            actions.updatePlacement(placement, { date: today });
            onClose();
          }}
        >
          <span className="ic blue">→</span>
          <b>{t.reschedule.today}</b>
        </button>
      )}
      <button
        className="opt"
        onClick={() =>
          open({
            type: "pickDate",
            title: t.reschedule.other,
            initial: placement.date < today ? today : placement.date,
            onPick: (date) => {
              actions.updatePlacement(placement, { date });
              onClose();
            },
          })
        }
      >
        <span className="ic teal">▦</span>
        <b>{t.reschedule.other}</b>
      </button>
      {placement.timeMode === "timed" && (
        <button
          className="opt"
          onClick={() =>
            open({
              type: "pickTime",
              title: t.occurrence.changeTime,
              startTime: placement.startTime ?? "09:00",
              endTime: placement.endTime ?? "10:00",
              onPick: (s, e) => {
                actions.updatePlacement(placement, { timeMode: "timed", startTime: s, endTime: e });
                onClose();
              },
            })
          }
        >
          <span className="ic violet">◷</span>
          <b>{t.occurrence.changeTime}</b>
        </button>
      )}
      <button
        className="opt"
        onClick={() => {
          if (past) actions.dismissPlacement(placement);
          else actions.removePlacement(placement);
          onClose();
        }}
      >
        <span className="ic slate">✕</span>
        <span>
          <b>{t.reschedule.dismiss}</b>
          <br />
          <span className="muted">{t.reschedule.dismissHint}</span>
        </span>
      </button>
    </Sheet>
  );
}

// ---------- M14 ----------

export function DayNoteSheet({ date, onClose }: { date: DateKey; onClose: () => void }) {
  const t = useT();
  const today = useToday();
  const actions = useItemActions();
  const { data: day, loading } = useDay(date);
  const [text, setText] = useState<string | null>(null);
  const value = text ?? day?.note ?? "";
  const save = () => {
    actions.setNote(date, value);
    onClose();
  };
  return (
    <Sheet
      eyebrow={longDate(date, today)}
      title={t.dayNote.title}
      onClose={onClose}
      onSubmit={save}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {t.common.cancel}
          </button>
          <button className="btn pri" onClick={save} disabled={loading && text === null}>
            {t.common.save}
          </button>
        </>
      }
    >
      <textarea className="inp" style={{ minHeight: 180 }} autoFocus placeholder={t.dayNote.placeholder} value={value} onChange={(e) => setText(e.target.value)} />
    </Sheet>
  );
}

// ---------- pickers ----------

export function PickDateSheet({ title, initial, onPick, onClose }: { title: string; initial: DateKey; onPick: (d: DateKey) => void; onClose: () => void }) {
  const t = useT();
  const [date, setDate] = useState(initial);
  const submit = () => {
    if (!isValidDateKey(date)) return;
    onClose();
    onPick(date);
  };
  return (
    <Sheet
      title={title}
      onClose={onClose}
      onSubmit={submit}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {t.common.cancel}
          </button>
          <button className="btn pri" onClick={submit} disabled={!isValidDateKey(date)}>
            {t.common.accept}
          </button>
        </>
      }
    >
      <input className="inp" type="date" value={date} autoFocus onChange={(e) => setDate(e.target.value)} />
    </Sheet>
  );
}

export function PickTimeSheet(props: { title: string; startTime: TimeKey; endTime: TimeKey; onPick: (s: TimeKey, e: TimeKey) => void; onClose: () => void }) {
  const t = useT();
  const [start, setStart] = useState(props.startTime);
  const [end, setEnd] = useState(props.endTime);
  const valid = !!start && !!end && timeToMinutes(end) > timeToMinutes(start);
  const submit = () => {
    if (!valid) return;
    props.onClose();
    props.onPick(start, end);
  };
  return (
    <Sheet
      title={props.title}
      onClose={props.onClose}
      onSubmit={submit}
      footer={
        <>
          <button className="btn" onClick={props.onClose}>
            {t.common.cancel}
          </button>
          <button className="btn pri" onClick={submit} disabled={!valid}>
            {t.common.accept}
          </button>
        </>
      }
    >
      <div className="pair">
        <div className="field">
          <label htmlFor="pt-s">{t.common.start}</label>
          <input
            id="pt-s"
            className="inp"
            type="time"
            value={start}
            onChange={(e) => {
              const v = e.target.value;
              if (!v) return;
              const dur = timeToMinutes(end) - timeToMinutes(start);
              setStart(v);
              if (dur > 0) setEnd(addMinutesToTime(v, dur));
            }}
          />
        </div>
        <div className="field">
          <label htmlFor="pt-e">{t.common.end}</label>
          <input id="pt-e" className={`inp ${valid ? "" : "err"}`} type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
      </div>
      {!valid && <span className="err-text">{t.form.timeError}</span>}
    </Sheet>
  );
}
