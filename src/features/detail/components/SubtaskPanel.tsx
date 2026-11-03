import { useEffect, useState } from "react";
import type { Item, Placement, Weekday } from "@/types/models";
import { useModals } from "@/features/modals/ModalContext";
import { useItemActions } from "@/features/items/hooks/useItemActions";
import { useToday } from "@/features/data/ClockContext";
import { aliveIndex, childrenOf, pathTitles, positionBetween } from "@/lib/tree/tree";
import { dayRowLabel, formatDuration, formatTimeRange, longDate, parseEstimate } from "@/lib/date/format";
import { AddIcon, DeleteIcon, MoveDownIcon, MoveIcon, MoveUpIcon } from "@/components/icons";
import { Segmented } from "@/components/ui/misc";
import { fmt, useT } from "@/i18n";

interface Props {
  item: Item;
  nodeId: string;
  placements: Placement[];
  readOnly: boolean;
  onDeleted?: () => void;
}

const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 7];

/** M3 — subtask detail (aside on desktop, sheet on mobile). */
export function SubtaskPanel({ item, nodeId, placements, readOnly, onDeleted }: Props) {
  const t = useT();
  const today = useToday();
  const { open } = useModals();
  const actions = useItemActions();
  const node = item.nodes[nodeId];
  const repeating = item.scheduleMode === "repeat";

  const [title, setTitle] = useState(node?.title ?? "");
  const [estimate, setEstimate] = useState(node?.estimateMin ? formatDuration(node.estimateMin) : "");
  const [notes, setNotes] = useState(node?.notes ?? "");
  const [child, setChild] = useState("");

  useEffect(() => {
    setTitle(node?.title ?? "");
    setEstimate(node?.estimateMin ? formatDuration(node.estimateMin) : "");
    setNotes(node?.notes ?? "");
    setChild("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId]);

  if (!node) return null;

  const path = [item.title, ...pathTitles(item.nodes, nodeId)];
  const index = aliveIndex(item.nodes);
  const siblings = childrenOf(index, node.parentId);
  const pos = siblings.indexOf(nodeId);

  const saveTitle = () => {
    const v = title.trim();
    if (v && v !== node.title) actions.updateNode(item, nodeId, { title: v });
    else setTitle(node.title);
  };
  const saveEstimate = () => {
    const min = parseEstimate(estimate);
    if (min !== node.estimateMin) actions.updateNode(item, nodeId, { estimateMin: min });
    setEstimate(min ? formatDuration(min) : "");
  };
  const saveNotes = () => {
    const v = notes.trim() === "" ? null : notes;
    if (v !== node.notes) actions.updateNode(item, nodeId, { notes: v });
  };
  const move = (dir: -1 | 1) => {
    const target = pos + dir;
    if (target < 0 || target >= siblings.length) return;
    const before = dir === -1 ? (siblings[target - 1] ? item.nodes[siblings[target - 1]].position : null) : item.nodes[siblings[target]].position;
    const after = dir === -1 ? item.nodes[siblings[target]].position : siblings[target + 1] ? item.nodes[siblings[target + 1]].position : null;
    actions.moveNode(item, nodeId, node.parentId, positionBetween(before, after));
  };
  const toggleWeekday = (d: Weekday) => {
    const cur = node.weekdays ?? [];
    const next = cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort((a, b) => a - b);
    actions.updateNode(item, nodeId, { weekdays: next.length === 0 ? null : next });
  };

  return (
    <>
      <input
        className="inp"
        style={{ font: "700 20px var(--font-display)", border: "1px solid transparent", padding: 0 }}
        value={title}
        disabled={readOnly}
        aria-label={t.form.name}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={saveTitle}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />
      <p className="muted">{path.join(" › ")}</p>

      {!repeating && (
        <div className="field">
          <label>{t.detail.days}</label>
          {placements.length === 0 && <p className="muted">{t.detail.noDays}</p>}
          {placements.map((p) => (
            <button key={p.id} type="button" className="dayrow" style={{ textAlign: "left" }} onClick={() => open({ type: "reschedule", placement: p })}>
              <b>{dayRowLabel(p.date, today)}</b>
              <span className={`chip ${p.timeMode === "timed" ? "project" : ""}`}>
                {p.timeMode === "timed" ? formatTimeRange(p.startTime, p.endTime) : p.timeMode === "all_day" ? t.common.allDay : t.common.noTime}
              </span>
            </button>
          ))}
          {!readOnly && (
            <button type="button" className="lnk" onClick={() => open({ type: "place", itemId: item.id, nodeId })}>
              <AddIcon size={16} />
              {t.form.addDay}
            </button>
          )}
        </div>
      )}

      {repeating && (
        <div className="field">
          <label>{t.detail.applies}</label>
          <Segmented
            value={node.weekdays ? "some" : "all"}
            onChange={(v) => !readOnly && actions.updateNode(item, nodeId, { weekdays: v === "all" ? null : (item.recurrence?.weekdays?.slice(0, 1) ?? [1]) })}
            options={[
              { value: "all", label: t.detail.appliesAll },
              { value: "some", label: t.detail.appliesSome },
            ]}
          />
          {node.weekdays && (
            <div className="chips">
              {WEEKDAYS.map((d) => (
                <button key={d} type="button" className={`dchip ${node.weekdays!.includes(d) ? "on" : ""}`} onClick={() => !readOnly && toggleWeekday(d)}>
                  {t.dates.weekdaysLetter[d - 1]}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="pair">
        <div className="field">
          <label htmlFor={`est-${nodeId}`}>{t.subtask.estimate}</label>
          <input id={`est-${nodeId}`} className="inp" placeholder={t.subtask.estimatePlaceholder} value={estimate} disabled={readOnly} onChange={(e) => setEstimate(e.target.value)} onBlur={saveEstimate} />
        </div>
        {!repeating && (
          <div className="field">
            <label htmlFor={`due-${nodeId}`}>{t.subtask.due}</label>
            <input
              id={`due-${nodeId}`}
              className="inp"
              type="date"
              value={node.dueDate ?? ""}
              disabled={readOnly}
              onChange={(e) => actions.updateNode(item, nodeId, { dueDate: e.target.value || null })}
            />
          </div>
        )}
      </div>

      <div className="field">
        <label htmlFor={`notes-${nodeId}`}>{t.subtask.notes}</label>
        <textarea id={`notes-${nodeId}`} className="inp" value={notes} disabled={readOnly} onChange={(e) => setNotes(e.target.value)} onBlur={saveNotes} />
      </div>

      {!repeating && (
        <div className="field">
          <label>{t.subtask.log}</label>
          <p className="muted">{node.completedOn ? fmt(t.subtask.completedOn, { date: longDate(node.completedOn, today) }) : t.subtask.notCompleted}</p>
        </div>
      )}

      {!readOnly && (
        <>
          <div className="row">
            <input
              className="inp"
              placeholder={t.subtask.addChild}
              value={child}
              onChange={(e) => setChild(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && child.trim()) {
                  actions.addNode(item, nodeId, child);
                  setChild("");
                }
              }}
            />
            <button
              type="button"
              className="btn icon"
              aria-label={t.subtask.addChild}
              disabled={!child.trim()}
              onClick={() => {
                actions.addNode(item, nodeId, child);
                setChild("");
              }}
            >
              <AddIcon size={18} />
            </button>
          </div>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <button type="button" className="btn sm" onClick={() => open({ type: "moveNode", itemId: item.id, nodeId })}>
              <MoveIcon size={16} />
              {t.subtask.move}
            </button>
            <button type="button" className="btn sm icon" aria-label={t.subtask.moveUp} disabled={pos <= 0} onClick={() => move(-1)}>
              <MoveUpIcon size={16} />
            </button>
            <button type="button" className="btn sm icon" aria-label={t.subtask.moveDown} disabled={pos === siblings.length - 1} onClick={() => move(1)}>
              <MoveDownIcon size={16} />
            </button>
            <button type="button" className="btn sm" style={{ color: "var(--rose)", marginLeft: "auto" }} onClick={() => actions.confirmDeleteNode(item, nodeId, placements.length, onDeleted)}>
              <DeleteIcon size={16} />
              {t.subtask.delete}
            </button>
          </div>
        </>
      )}
    </>
  );
}
