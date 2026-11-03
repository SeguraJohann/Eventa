import { useEffect, useMemo, useState } from "react";
import type { Item, Placement } from "@/types/models";
import { useItemPlacements } from "@/features/data/hooks";
import { useToday } from "@/features/data/ClockContext";
import { useModals } from "@/features/modals/ModalContext";
import { useItemActions } from "@/features/items/hooks/useItemActions";
import { aliveIndex, hasChildren, progressOf, ratio, stateOf } from "@/lib/tree/tree";
import { itemProgress } from "@/lib/agenda/items";
import { dayMonth, formatDuration, formatTimeRange, relativeDate } from "@/lib/date/format";
import { useIsMobile } from "@/lib/utils/useMediaQuery";
import { PlaceIcon } from "@/components/icons";
import { Checkbox } from "@/components/ui/Checkbox";
import { Empty, ProgressBar, Segmented } from "@/components/ui/misc";
import { fmt, useT } from "@/i18n";
import { TreeView } from "./TreeView";
import { SubtaskPanel } from "./SubtaskPanel";
import styles from "./Detail.module.css";

type TreeFilter = "all" | "pending" | "placed";

export function OnceDetail({ item, readOnly, focusNode }: { item: Item; readOnly: boolean; focusNode: string | null }) {
  const t = useT();
  const today = useToday();
  const mobile = useIsMobile();
  const { open } = useModals();
  const actions = useItemActions();
  const { data: placements } = useItemPlacements(item.id);
  const [filter, setFilter] = useState<TreeFilter>("all");
  const [selected, setSelected] = useState<string | null>(focusNode && item.nodes[focusNode] ? focusNode : null);

  useEffect(() => {
    if (focusNode && item.nodes[focusNode]) setSelected(focusNode);
  }, [focusNode, item.nodes]);
  useEffect(() => {
    if (selected && (!item.nodes[selected] || item.nodes[selected].removedOn !== null)) setSelected(null);
  }, [selected, item.nodes]);

  const index = useMemo(() => aliveIndex(item.nodes), [item.nodes]);
  const block = item.completion === "block";
  const progress = itemProgress(item);
  const hasTree = index.order.length > 0;

  const byNode = useMemo(() => {
    const map = new Map<string | null, Placement[]>();
    for (const p of placements) {
      const list = map.get(p.nodeId);
      if (list) list.push(p);
      else map.set(p.nodeId, [p]);
    }
    for (const list of map.values()) list.sort((a, b) => (a.date < b.date ? -1 : 1));
    return map;
  }, [placements]);

  const dayCount = new Set(placements.map((p) => p.date)).size;
  const leafDone = (l: string) => item.nodes[l].completedAt !== null;

  const placementChip = (p: Placement) => `${relativeDate(p.date, today)}${p.timeMode === "timed" ? ` ${formatTimeRange(p.startTime, p.endTime)}` : ""}`;

  const renderRight = (id: string) => {
    const node = item.nodes[id];
    const ps = (byNode.get(id) ?? []).filter((p) => p.date >= today || p.open);
    return (
      <>
        {ps.slice(0, 1).map((p) => (
          <span key={p.id} className={`chip ${p.date < today ? "warn" : "project"}`}>
            {placementChip(p)}
          </span>
        ))}
        {ps.length > 1 && <span className="chip">+{ps.length - 1}</span>}
        {node.dueDate && <span className={`chip ${node.dueDate < today && !node.completedAt ? "warn" : ""}`}>⚑ {dayMonth(node.dueDate)}</span>}
        {node.estimateMin && !hasChildren(index, id) && <span>{formatDuration(node.estimateMin)}</span>}
      </>
    );
  };

  const isVisible =
    filter === "all"
      ? undefined
      : filter === "pending"
        ? (id: string) => !hasChildren(index, id) && item.nodes[id].completedAt === null
        : (id: string) => (byNode.get(id) ?? []).length > 0;

  const rootPlacements = byNode.get(null) ?? [];
  const upcoming = placements.filter((p) => p.date >= today).sort((a, b) => (a.date < b.date ? -1 : 1));

  const tree = hasTree ? (
    <TreeView
      storageKey={`eventa.collapsed.${item.id}`}
      index={index}
      stateOf={(id) => stateOf(progressOf(index, id, leafDone))}
      progressOf={(id) => progressOf(index, id, leafDone)}
      onToggle={readOnly || block ? undefined : (id, c) => actions.toggleNode(item, id, c)}
      selectedId={selected}
      onSelect={(id) => {
        if (mobile && selected === id) open({ type: "subtask", itemId: item.id, nodeId: id });
        setSelected(id);
      }}
      renderRight={renderRight}
      isVisible={isVisible}
      onAdd={readOnly ? undefined : (parent, title) => actions.addNode(item, parent, title)}
    />
  ) : null;

  return (
    <>
      {!block && (
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="top">
            <b>{t.detail.progress}</b>
            <b>{Math.round(ratio(progress) * 100)}%</b>
          </div>
          <ProgressBar value={ratio(progress)} height={10} tone={progress.done === progress.total ? "green" : "blue"} />
          <div className="tags">
            {hasTree && <span className="tag">{fmt(t.detail.progressOf, progress)}</span>}
            <span className="tag">{t.detail.notRepeating}</span>
            {item.dueDate && <span className={`tag ${item.dueDate < today && !item.completedAt ? "warn" : ""}`}>⚑ {fmt(t.events.due, { date: dayMonth(item.dueDate) })}</span>}
            {dayCount > 0 && <span className="tag">▦ {fmt(t.detail.placedIn, { n: dayCount })}</span>}
            {item.estimateMin && <span className="tag">◷ {formatDuration(item.estimateMin)}</span>}
          </div>
        </div>
      )}

      {block && (
        <section className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <b>{t.detail.upcoming}</b>
          {upcoming.length === 0 ? <p className="muted">{t.detail.noUpcoming}</p> : upcoming.slice(0, 12).map((p) => <DayRow key={p.id} p={p} label={placementChip(p)} />)}
        </section>
      )}

      {item.notes && <p className="note">{item.notes}</p>}

      <div className="cols">
        <section className="card" style={{ flex: "999 1 460px", padding: "10px 6px" }}>
          {hasTree && !block && (
            <div style={{ padding: "0 6px 8px" }}>
              <Segmented
                value={filter}
                onChange={setFilter}
                options={[
                  { value: "all", label: t.detail.filterAll },
                  { value: "pending", label: t.detail.filterPending },
                  { value: "placed", label: t.detail.filterPlaced },
                ]}
              />
            </div>
          )}
          {!hasTree && !block && (
            <div className={styles.rootCheck}>
              <Checkbox state={item.completedAt ? "done" : "pending"} label={t.detail.markDone} onToggle={readOnly ? undefined : (c) => actions.toggleNode(item, null, c)} />
              <span>{item.completedAt ? t.detail.markedDone : t.detail.markDone}</span>
            </div>
          )}
          {tree}
          {!hasTree && (
            <Empty>
              {block ? t.detail.noSubtasks : t.detail.noSubtasksCheck}
            </Empty>
          )}
          {!hasTree && !readOnly && <AddFirst item={item} />}
          {rootPlacements.length > 0 && !block && (
            <div style={{ padding: "8px 10px 4px", display: "flex", flexDirection: "column", gap: 6 }}>
              <span className="lbl">{t.detail.days}</span>
              {rootPlacements.map((p) => (
                <DayRow key={p.id} p={p} label={placementChip(p)} />
              ))}
            </div>
          )}
        </section>
        {selected && item.nodes[selected] && !mobile && (
          <aside className="card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <p className="eyebrow" style={{ margin: 0 }}>
              {t.detail.selected}
            </p>
            <SubtaskPanel item={item} nodeId={selected} placements={byNode.get(selected) ?? []} readOnly={readOnly} onDeleted={() => setSelected(null)} />
          </aside>
        )}
      </div>

      {selected && item.nodes[selected] && mobile && (
        <div className={styles.selbar}>
          <button style={{ flex: 1, minWidth: 0, textAlign: "left" }} onClick={() => open({ type: "subtask", itemId: item.id, nodeId: selected })}>
            <p className="muted">{t.detail.selected}</p>
            <b style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.nodes[selected].title}</b>
          </button>
          {!readOnly && (
            <button className="btn pri" onClick={() => open({ type: "place", itemId: item.id, nodeId: selected })}>
              <PlaceIcon size={16} />
              {t.detail.addDay}
            </button>
          )}
        </div>
      )}
      {mobile && !readOnly && !selected && (
        <button className="btn mobile-only" onClick={() => open({ type: "place", itemId: item.id, nodeId: null })}>
          <PlaceIcon size={16} />
          {t.detail.addDay}
        </button>
      )}
    </>
  );
}

function DayRow({ p, label }: { p: Placement; label: string }) {
  const { open } = useModals();
  return (
    <button className="dayrow" style={{ textAlign: "left", width: "100%" }} onClick={() => open({ type: "reschedule", placement: p })}>
      <b>{label}</b>
    </button>
  );
}

function AddFirst({ item }: { item: Item }) {
  const t = useT();
  const actions = useItemActions();
  const [text, setText] = useState("");
  return (
    <div className="row" style={{ padding: "0 10px 6px" }}>
      <input
        className="inp"
        placeholder={t.detail.newSubtask}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && text.trim()) {
            actions.addNode(item, null, text);
            setText("");
          }
        }}
      />
    </div>
  );
}
