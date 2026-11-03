// M6 (occurrence actions), M7 (edit scope), M10 (edit past occurrence).

import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { DateKey, Item, Occurrence } from "@/types/models";
import { ROOT_KEY, occurrenceId } from "@/types/models";
import { useItem, useOccurrencesRange } from "@/features/data/hooks";
import { useToday } from "@/features/data/ClockContext";
import { useModals } from "@/features/modals/ModalContext";
import { useItemActions } from "@/features/items/hooks/useItemActions";
import { childrenOf, depthOf, leavesUnder, occurrenceProgress, templateIndex } from "@/lib/tree/tree";
import { occurrenceState, itemRuleContext } from "@/lib/recurrence/occurrences";
import { occursOn } from "@/lib/recurrence/engine";
import { formatTime, formatTimeRange, relativeDate, shortDate } from "@/lib/date/format";
import { CheckIcon, EditIcon, MoveIcon, SkipIcon, TimeIcon, UndoIcon, ViewIcon } from "@/components/icons";
import { Checkbox } from "@/components/ui/Checkbox";
import { Sheet } from "@/components/ui/Sheet";
import { Loading } from "@/components/ui/misc";
import { fmt, useT } from "@/i18n";
import { paths } from "@/routes/paths";

function useOccurrenceDoc(item: Item | undefined, originalDate: DateKey): { doc: Occurrence | null; loading: boolean } {
  const { data, loading } = useOccurrencesRange(originalDate, originalDate);
  return { doc: item ? data.get(occurrenceId(item.id, originalDate)) ?? null : null, loading };
}

/** Subtasks of one occurrence with checkboxes. */
function OccurrenceSteps({ item, originalDate, doc, disabled }: { item: Item; originalDate: DateKey; doc: Occurrence | null; disabled?: boolean }) {
  const t = useT();
  const actions = useItemActions();
  const template = useMemo(() => templateIndex(item.nodes, originalDate), [item.nodes, originalDate]);
  const done = doc?.done ?? {};
  if (template.order.length === 0) return null;
  const stateOf = (id: string) => {
    const leaves = leavesUnder(template, id);
    const n = leaves.filter((l) => done[l] !== undefined).length;
    return n === 0 ? "pending" : n === leaves.length ? "done" : "partial";
  };
  return (
    <div className="box" style={{ gap: 2, padding: 8 }}>
      <span className="lbl" style={{ padding: "4px 6px" }}>
        {t.occurrence.subtasks}
      </span>
      {template.order.map((id) => (
        <div key={id} className="row" style={{ minHeight: 40, paddingLeft: 6 + depthOf(item.nodes, id) * 24 }}>
          <Checkbox
            state={stateOf(id) as "pending" | "partial" | "done"}
            label={item.nodes[id].title}
            onToggle={disabled ? undefined : (c) => actions.toggleOccurrence(item, originalDate, doc, id, c)}
          />
          <span style={{ fontWeight: childrenOf(template, id).length ? 700 : 500 }}>{item.nodes[id].title}</span>
        </div>
      ))}
    </div>
  );
}

// ---------- M6 ----------

export function OccurrenceSheet({ itemId, originalDate, onClose }: { itemId: string; originalDate: DateKey; onClose: () => void }) {
  const t = useT();
  const today = useToday();
  const navigate = useNavigate();
  const { open, replace } = useModals();
  const actions = useItemActions();
  const { item } = useItem(itemId);
  const { doc, loading } = useOccurrenceDoc(item, originalDate);

  if (!item) return <Sheet onClose={onClose} title={t.app.loading}>{<Loading />}</Sheet>;

  const shownDate = doc?.movedToDate ?? originalDate;
  const { state } = occurrenceState(item, originalDate, shownDate, doc, today);
  const template = templateIndex(item.nodes, originalDate);
  const prog = occurrenceProgress(template, doc?.done ?? {}, ROOT_KEY);
  const check = item.completion === "check";
  const start = doc?.startTime ?? item.startTime;
  const end = doc?.endTime ?? item.endTime;
  const timed = (doc?.startTime ?? null) !== null || item.timeMode === "timed";
  const skipped = state === "skipped";
  const future = shownDate > today;
  const title = fmt(t.occurrence.titleAt, { title: item.title, date: relativeDate(shownDate, today, false), time: timed && start ? formatTime(start) : "" }).trim();

  return (
    <Sheet eyebrow={t.occurrence.eyebrow} title={title} onClose={onClose}
      footer={
        <>
          <button
            className="btn"
            onClick={() => {
              onClose();
              navigate(paths.item(item.id));
            }}
          >
            <ViewIcon size={16} />
            {t.occurrence.viewEvent}
          </button>
          <button className="btn pri" onClick={() => replace({ type: "itemForm", mode: "edit", itemId: item.id, fromOccurrence: { originalDate } })}>
            <EditIcon size={16} />
            {t.occurrence.edit}
          </button>
        </>
      }
    >
      {loading && !doc ? null : (
        <>
          {check && !skipped && template.order.length === 0 && !future && (
            <button
              className="opt"
              onClick={() => {
                actions.toggleOccurrence(item, originalDate, doc, null, state !== "done");
                onClose();
              }}
            >
              <span className="ic teal">{state === "done" ? <UndoIcon size={18} /> : <CheckIcon size={18} />}</span>
              <b>{state === "done" ? t.occurrence.unmark : t.occurrence.markDone}</b>
            </button>
          )}
          {check && !skipped && template.order.length > 0 && (
            <>
              <OccurrenceSteps item={item} originalDate={originalDate} doc={doc} disabled={future} />
              {!future && (
                <button className="opt" onClick={() => actions.toggleOccurrence(item, originalDate, doc, null, prog.done !== prog.total)}>
                  <span className="ic teal">{prog.done === prog.total ? <UndoIcon size={18} /> : <CheckIcon size={18} />}</span>
                  <b>{prog.done === prog.total ? t.occurrence.unmark : t.occurrence.markDone}</b>
                </button>
              )}
            </>
          )}
          <button
            className="opt"
            onClick={() => {
              actions.skipOccurrence(item, originalDate, doc, !skipped);
              onClose();
            }}
          >
            <span className="ic slate">{skipped ? <UndoIcon size={18} /> : <SkipIcon size={18} />}</span>
            <span>
              <b>{skipped ? t.occurrence.unskip : t.occurrence.skip}</b>
              {!skipped && (
                <>
                  <br />
                  <span className="muted">{t.occurrence.skipHint}</span>
                </>
              )}
            </span>
          </button>
          <button
            className="opt"
            onClick={() =>
              open({
                type: "pickDate",
                title: t.occurrence.moveTitle,
                initial: shownDate,
                onPick: (d) => {
                  actions.moveOccurrence(item, originalDate, doc, d);
                  onClose();
                },
              })
            }
          >
            <span className="ic blue">
              <MoveIcon size={18} />
            </span>
            <b>{t.occurrence.move}</b>
          </button>
          {doc?.movedToDate && (
            <button
              className="opt"
              onClick={() => {
                actions.moveOccurrence(item, originalDate, doc, null);
                onClose();
              }}
            >
              <span className="ic blue">
                <UndoIcon size={18} />
              </span>
              <b>{fmt(t.occurrence.moveBack, { date: shortDate(originalDate) })}</b>
            </button>
          )}
          <button
            className="opt"
            onClick={() =>
              open({
                type: "pickTime",
                title: t.occurrence.timeTitle,
                startTime: start ?? "09:00",
                endTime: end ?? "10:00",
                onPick: (s, e) => {
                  actions.setOccurrenceTime(item, originalDate, doc, s, e);
                  onClose();
                },
              })
            }
          >
            <span className="ic violet">
              <TimeIcon size={18} />
            </span>
            <span>
              <b>{t.occurrence.changeTime}</b>
              {timed && start && (
                <>
                  <br />
                  <span className="muted">{formatTimeRange(start, end)}</span>
                </>
              )}
            </span>
          </button>
          {doc?.startTime && (
            <button
              className="opt"
              onClick={() => {
                actions.setOccurrenceTime(item, originalDate, doc, null, null);
                onClose();
              }}
            >
              <span className="ic violet">
                <UndoIcon size={18} />
              </span>
              <b>{t.occurrence.resetTime}</b>
            </button>
          )}
        </>
      )}
    </Sheet>
  );
}

// ---------- M7 ----------

export function ScopeSheet({ date, allowOnly, onPick, onClose }: { date: DateKey; allowOnly: boolean; onPick: (s: "only" | "following" | "all") => void; onClose: () => void }) {
  const t = useT();
  const pick = (s: "only" | "following" | "all") => {
    onClose();
    onPick(s);
  };
  return (
    <Sheet title={t.scope.title} onClose={onClose} footer={<button className="btn" onClick={onClose}>{t.common.cancel}</button>}>
      <p className="muted">{t.scope.hint}</p>
      {allowOnly && (
        <button className="radio" onClick={() => pick("only")}>
          <span>
            <b>{t.scope.only}</b>
            <br />
            <span className="muted">{t.scope.onlyHint}</span>
          </span>
        </button>
      )}
      <button className="radio" onClick={() => pick("following")}>
        <span>
          <b>{t.scope.following}</b>
          <br />
          <span className="muted">{fmt(t.scope.followingHint, { date: shortDate(date) })}</span>
        </span>
      </button>
      <button className="radio" onClick={() => pick("all")}>
        <span>
          <b>{t.scope.all}</b>
          <br />
          <span className="muted">{t.scope.allHint}</span>
        </span>
      </button>
    </Sheet>
  );
}

// ---------- M10 ----------

export function PastOccurrenceSheet({ itemId, originalDate, onClose }: { itemId: string; originalDate: DateKey; onClose: () => void }) {
  const t = useT();
  const today = useToday();
  const actions = useItemActions();
  const { item } = useItem(itemId);
  const { doc } = useOccurrenceDoc(item, originalDate);
  if (!item) return <Sheet onClose={onClose} title={t.app.loading}>{<Loading />}</Sheet>;
  const ctx = itemRuleContext(item);
  const scheduled = !!ctx && occursOn(ctx, originalDate);
  const { state } = occurrenceState(item, originalDate, doc?.movedToDate ?? originalDate, doc, today);
  const template = templateIndex(item.nodes, originalDate);
  const skipped = state === "skipped";
  return (
    <Sheet eyebrow={item.title} title={`${t.occurrence.pastTitle} · ${shortDate(originalDate)}`} onClose={onClose} footer={<button className="btn pri" onClick={onClose}>{t.common.done}</button>}>
      {!scheduled && <p className="muted">{t.occurrence.notScheduled}</p>}
      {!skipped && template.order.length > 0 && <OccurrenceSteps item={item} originalDate={originalDate} doc={doc} />}
      {!skipped && template.order.length === 0 && (
        <button className="opt" onClick={() => actions.toggleOccurrence(item, originalDate, doc, null, state !== "done")}>
          <Checkbox state={state === "done" ? "done" : "pending"} label={t.occurrence.markDone} />
          <b>{state === "done" ? t.detail.markedDone : t.occurrence.markDone}</b>
        </button>
      )}
      <button className="opt" onClick={() => actions.skipOccurrence(item, originalDate, doc, !skipped)}>
        <span className="ic slate">{skipped ? <UndoIcon size={18} /> : <SkipIcon size={18} />}</span>
        <b>{skipped ? t.occurrence.unskip : t.occurrence.markSkipped}</b>
      </button>
    </Sheet>
  );
}
