// M3 (subtask, mobile), M8 (⋯ menu), M9 (move subtask), M11 (confirm),
// M12 (completed), paste list.

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useItem, useItemOccurrences, useItemPlacements } from "@/features/data/hooks";
import { useModals } from "@/features/modals/ModalContext";
import { useItemActions } from "@/features/items/hooks/useItemActions";
import { SubtaskPanel } from "@/features/detail/components/SubtaskPanel";
import { isRepeating } from "@/lib/agenda/items";
import { aliveIndex, depthOf, descendantsOf, parsePastedList, positionAfterLast, type EditorRow } from "@/lib/tree/tree";
import { ArchiveIcon, DeleteIcon, DoneIcon, DuplicateIcon, EditIcon, ParentIcon, PauseIcon, PinIcon, PlaceIcon, ReopenIcon, ResumeIcon, UnpinIcon } from "@/components/icons";
import { Sheet } from "@/components/ui/Sheet";
import { Loading } from "@/components/ui/misc";
import { fmt, useT } from "@/i18n";
import { paths } from "@/routes/paths";

// ---------- M3 (mobile sheet) ----------

export function SubtaskSheet({ itemId, nodeId, onClose }: { itemId: string; nodeId: string; onClose: () => void }) {
  const t = useT();
  const { item } = useItem(itemId);
  const { data: placements } = useItemPlacements(item && !isRepeating(item) ? itemId : null);
  const missing = !!item && (!item.nodes[nodeId] || item.nodes[nodeId].removedOn !== null);
  useEffect(() => {
    if (missing) onClose();
  }, [missing, onClose]);
  if (!item || missing) return <Sheet onClose={onClose}>{<Loading />}</Sheet>;
  const readOnly = item.status === "done" || item.status === "archived";
  return (
    <Sheet eyebrow={t.detail.selected} onClose={onClose} title=" " footer={<button className="btn pri" onClick={onClose}>{t.common.done}</button>}>
      <SubtaskPanel item={item} nodeId={nodeId} placements={placements.filter((p) => p.nodeId === nodeId)} readOnly={readOnly} onDeleted={onClose} />
    </Sheet>
  );
}

// ---------- M8 ----------

export function ItemMenuSheet({ itemId, onClose }: { itemId: string; onClose: () => void }) {
  const t = useT();
  const navigate = useNavigate();
  const { replace } = useModals();
  const actions = useItemActions();
  const { item } = useItem(itemId);
  const { data: placements } = useItemPlacements(itemId);
  const { data: occurrences } = useItemOccurrences(item && isRepeating(item) ? itemId : null);
  if (!item) return <Sheet onClose={onClose}>{<Loading />}</Sheet>;
  const repeating = isRepeating(item);
  const closed = item.status === "done" || item.status === "archived";
  const run = (fn: () => void) => () => {
    onClose();
    fn();
  };
  const opt = (icon: React.ReactNode, label: string, fn: () => void, cls = "slate", danger = false) => (
    <button className={`opt ${danger ? "danger" : ""}`} onClick={fn}>
      <span className={`ic ${cls}`}>{icon}</span>
      <b>{label}</b>
    </button>
  );
  const history = occurrences.filter((o) => Object.keys(o.done).length > 0 || o.status === "skipped").length + Object.values(item.nodes).filter((n) => n.completedAt).length;

  return (
    <Sheet title={item.title} eyebrow={t.menu.title} onClose={onClose}>
      {!closed && opt(<EditIcon size={18} />, t.menu.edit, () => replace({ type: "itemForm", mode: "edit", itemId }), "blue")}
      {!closed && !repeating && opt(<PlaceIcon size={18} />, t.menu.place, () => replace({ type: "place", itemId, nodeId: null }), "teal")}
      {opt(item.pinned ? <UnpinIcon size={18} /> : <PinIcon size={18} />, item.pinned ? t.menu.unpin : t.menu.pin, run(() => actions.setPinned(item, !item.pinned)), "violet")}
      {opt(<DuplicateIcon size={18} />, t.menu.duplicate, run(() => actions.duplicate(item)), "slate")}
      {!closed && repeating && opt(item.status === "paused" ? <ResumeIcon size={18} /> : <PauseIcon size={18} />, item.status === "paused" ? t.menu.resume : t.menu.pause, run(() => actions.setStatus(item, item.status === "paused" ? "active" : "paused")), "orange")}
      {!closed && opt(<DoneIcon size={18} />, t.menu.finish, run(() => actions.setStatus(item, "done")), "green")}
      {closed && opt(<ReopenIcon size={18} />, t.menu.reopen, run(() => actions.setStatus(item, "active")), "green")}
      {item.status !== "archived" && opt(<ArchiveIcon size={18} />, t.menu.archive, run(() => actions.setStatus(item, "archived")), "slate")}
      {opt(<DeleteIcon size={18} />, t.menu.delete, () => {
        onClose();
        actions.confirmDelete(item, new Set(placements.map((p) => p.date)).size, history);
      }, "rose", true)}
      {closed && (
        <button className="lnk" onClick={run(() => navigate(paths.item(item.id)))}>
          {t.occurrence.viewEvent}
        </button>
      )}
    </Sheet>
  );
}

// ---------- M9 ----------

export function MoveNodeSheet({ itemId, nodeId, onClose }: { itemId: string; nodeId: string; onClose: () => void }) {
  const t = useT();
  const actions = useItemActions();
  const { item } = useItem(itemId);
  const options = useMemo(() => {
    if (!item) return [];
    const idx = aliveIndex(item.nodes);
    const banned = new Set([nodeId, ...descendantsOf(idx, nodeId)]);
    return idx.order.filter((id) => !banned.has(id)).map((id) => ({ id, title: item.nodes[id].title, depth: depthOf(item.nodes, id) }));
  }, [item, nodeId]);
  if (!item || !item.nodes[nodeId]) return <Sheet onClose={onClose}>{<Loading />}</Sheet>;
  const current = item.nodes[nodeId].parentId;
  const move = (parent: string | null) => {
    actions.moveNode(item, nodeId, parent, positionAfterLast(aliveIndex(item.nodes), parent));
    onClose();
  };
  return (
    <Sheet eyebrow={item.nodes[nodeId].title} title={t.subtask.moveTitle} onClose={onClose} footer={<button className="btn" onClick={onClose}>{t.common.cancel}</button>}>
      <p className="muted">{t.subtask.moveHint}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <button className="row" style={{ minHeight: 42, padding: "0 10px", borderRadius: 8, fontWeight: 700, background: current === null ? "var(--blue-t)" : undefined }} onClick={() => move(null)}>
          <ParentIcon size={16} />
          {t.subtask.rootLevel}
        </button>
        {options.map((o) => (
          <button
            key={o.id}
            className="row"
            style={{ minHeight: 40, padding: `0 10px 0 ${10 + (o.depth + 1) * 20}px`, borderRadius: 8, textAlign: "left", background: current === o.id ? "var(--blue-t)" : undefined }}
            onClick={() => move(o.id)}
          >
            {o.title}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

// ---------- M11 ----------

export function ConfirmSheet(props: { title: string; lines: string[]; confirmLabel: string; danger?: boolean; onConfirm: () => void; onClose: () => void }) {
  const t = useT();
  return (
    <Sheet
      title={props.title}
      onClose={props.onClose}
      footer={
        <>
          <button className="btn" onClick={props.onClose}>
            {t.common.cancel}
          </button>
          <button
            className={`btn ${props.danger ? "danger" : "pri"}`}
            onClick={() => {
              props.onClose();
              props.onConfirm();
            }}
          >
            {props.confirmLabel}
          </button>
        </>
      }
    >
      {props.lines.map((l) => (
        <p key={l} className="muted" style={{ fontSize: 14 }}>
          {l}
        </p>
      ))}
    </Sheet>
  );
}

// ---------- M12 ----------

export function CompletedSheet({ itemId, onClose }: { itemId: string; onClose: () => void }) {
  const t = useT();
  const actions = useItemActions();
  const { item } = useItem(itemId);
  if (!item) return null;
  return (
    <Sheet
      title={t.completed.title}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {t.completed.keep}
          </button>
          <button
            className="btn pri"
            onClick={() => {
              actions.setStatus(item, "done");
              onClose();
            }}
          >
            <DoneIcon size={16} />
            {t.completed.finish}
          </button>
        </>
      }
    >
      <p>{fmt(t.completed.body, { title: item.title })}</p>
    </Sheet>
  );
}

// ---------- paste list ----------

export function PasteSheet({ onAdd, onClose }: { onAdd: (rows: EditorRow[]) => void; onClose: () => void }) {
  const t = useT();
  const [text, setText] = useState("");
  const rows = useMemo(() => parsePastedList(text), [text]);
  const submit = () => {
    if (rows.length === 0) return;
    onAdd(rows);
    onClose();
  };
  return (
    <Sheet
      title={t.form.pasteTitle}
      onClose={onClose}
      onSubmit={submit}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {t.common.cancel}
          </button>
          <button className="btn pri" disabled={rows.length === 0} onClick={submit}>
            {fmt(t.form.pasteAdd, { n: rows.length })}
          </button>
        </>
      }
    >
      <p className="hint">{t.form.pasteHint}</p>
      <textarea
        className="inp"
        style={{ minHeight: 160, fontFamily: "ui-monospace, monospace", fontSize: 13 }}
        autoFocus
        placeholder={t.form.pastePlaceholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Tab") {
            e.preventDefault();
            const el = e.currentTarget;
            const { selectionStart, selectionEnd } = el;
            setText(text.slice(0, selectionStart) + "  " + text.slice(selectionEnd));
            window.requestAnimationFrame(() => el.setSelectionRange(selectionStart + 2, selectionStart + 2));
          }
        }}
      />
      {rows.length > 0 && (
        <div className="box" style={{ gap: 4 }}>
          {rows.map((r) => (
            <span key={r.id} style={{ paddingLeft: r.depth * 20, fontWeight: r.depth === 0 ? 700 : 500 }}>
              {r.depth > 0 ? "· " : ""}
              {r.title}
            </span>
          ))}
        </div>
      )}
    </Sheet>
  );
}
