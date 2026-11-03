import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Category, Item, Occurrence, Placement } from "@/types/models";
import { occurrenceId } from "@/types/models";
import { useItemsData } from "@/features/data/ItemsContext";
import { useToday } from "@/features/data/ClockContext";
import { useOccurrencesRange, usePlacementsRange } from "@/features/data/hooks";
import { useModals } from "@/features/modals/ModalContext";
import { useItemActions } from "@/features/items/hooks/useItemActions";
import { displayCategory, isRepeating, isSupersededSplit, itemProgress, subtaskCount } from "@/lib/agenda/items";
import { toneOf } from "@/lib/agenda/agenda";
import { computeStats, historyOf, itemChain, occurrenceState, itemRuleContext } from "@/lib/recurrence/occurrences";
import { occursOn } from "@/lib/recurrence/engine";
import { addDays } from "@/lib/date/dateKey";
import { ratio } from "@/lib/tree/tree";
import { AddIcon, MoreIcon, SearchIcon } from "@/components/icons";
import { Checkbox } from "@/components/ui/Checkbox";
import { ColorDot, Empty, Loading, ProgressBar } from "@/components/ui/misc";
import { CATEGORY_CLASS } from "@/styles/semantic";
import { fmt, useT } from "@/i18n";
import { paths } from "@/routes/paths";
import { itemTags } from "../itemTags";
import styles from "./EventsScreen.module.css";

type Filter = "all" | Category;
const STREAK_WINDOW = 120;

export default function EventsScreen() {
  const t = useT();
  const today = useToday();
  const navigate = useNavigate();
  const { open } = useModals();
  const actions = useItemActions();
  const { items, loading, inactive, retainInactive, lookupItem } = useItemsData();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [showFinished, setShowFinished] = useState(false);

  useEffect(() => (showFinished ? retainInactive() : undefined), [showFinished, retainInactive]);

  const upcoming = usePlacementsRange(today, "9999-12-31");
  const occ = useOccurrencesRange(addDays(today, -STREAK_WINDOW), today);

  const upcomingByItem = useMemo(() => {
    const map = new Map<string, Placement[]>();
    for (const p of upcoming.data) {
      const list = map.get(p.itemId);
      if (list) list.push(p);
      else map.set(p.itemId, [p]);
    }
    return map;
  }, [upcoming.data]);

  const occByItem = useMemo(() => {
    const map = new Map<string, Map<string, Occurrence>>();
    for (const o of occ.data.values()) {
      let m = map.get(o.itemId);
      if (!m) map.set(o.itemId, (m = new Map()));
      m.set(o.id, o);
    }
    return map;
  }, [occ.data]);

  const visible = useMemo(() => {
    const pool = showFinished ? [...items, ...inactive] : items.filter((i) => i.status === "active");
    return pool
      .filter((i) => !isSupersededSplit(i, today, items))
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [items, inactive, showFinished, today]);

  const counts = useMemo(() => {
    const c = { all: visible.length, task: 0, project: 0, event: 0 };
    for (const i of visible) c[displayCategory(i)]++;
    return c;
  }, [visible]);

  const query = q.trim().toLowerCase();
  const shown = visible.filter(
    (i) =>
      (filter === "all" || displayCategory(i) === filter) &&
      (query === "" || i.title.toLowerCase().includes(query) || Object.values(i.nodes).some((n) => n.removedOn === null && n.title.toLowerCase().includes(query))),
  );

  const filters: { value: Filter; label: string }[] = [
    { value: "all", label: t.category.all },
    { value: "task", label: t.category.tasks },
    { value: "project", label: t.category.projects },
    { value: "event", label: t.category.events },
  ];

  function streakOf(item: Item): number | null {
    if (!isRepeating(item) || item.completion !== "check") return null;
    const chain = itemChain(item, lookupItem);
    return computeStats(historyOf(chain, occByItem, today, addDays(today, -STREAK_WINDOW)), today).current;
  }

  return (
    <>
      <header className="top">
        <h1 className="h1">{t.events.title}</h1>
        <div className="row">
          <label className={`${styles.search} desk-only`}>
            <SearchIcon size={16} />
            <input className="inp" style={{ width: 240 }} placeholder={t.events.search} aria-label={t.events.search} value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <button className="btn pri desk-only" onClick={() => open({ type: "itemForm", mode: "create" })}>
            <AddIcon size={18} />
            {t.nav.newEvent}
          </button>
        </div>
      </header>

      <label className={`${styles.search} mobile-only`}>
        <SearchIcon size={16} />
        <input className="inp" placeholder={t.events.search} aria-label={t.events.search} value={q} onChange={(e) => setQ(e.target.value)} />
      </label>

      <div className={styles.filters}>
        <div className="chips" role="tablist">
          {filters.map((f) => (
            <button key={f.value} className={`chip ${filter === f.value ? "sel" : ""}`} onClick={() => setFilter(f.value)} role="tab" aria-selected={filter === f.value}>
              {f.label} {counts[f.value]}
            </button>
          ))}
        </div>
        <label className={styles.toggle}>
          <input type="checkbox" checked={showFinished} onChange={(e) => setShowFinished(e.target.checked)} />
          {t.events.showFinished}
        </label>
      </div>

      {loading ? (
        <Loading />
      ) : shown.length === 0 ? (
        <div className="card">
          <Empty
            action={
              visible.length === 0 ? (
                <button className="btn pri" onClick={() => open({ type: "itemForm", mode: "create" })}>
                  <AddIcon size={18} />
                  {t.nav.newEvent}
                </button>
              ) : undefined
            }
          >
            {visible.length === 0
              ? t.events.empty
              : query
                ? fmt(t.events.emptySearch, { q })
                : fmt(t.events.emptyFilter, { category: filters.find((f) => f.value === filter)!.label.toLowerCase() })}
          </Empty>
        </div>
      ) : (
        <div className={`card ${styles.list}`}>
          {shown.map((item) => (
            <EventRow
              key={item.id}
              item={item}
              upcoming={upcomingByItem.get(item.id) ?? []}
              occurrences={occByItem.get(item.id)}
              streak={streakOf(item)}
              onOpen={() => navigate(paths.item(item.id))}
              onMenu={() => open({ type: "itemMenu", itemId: item.id })}
              actions={actions}
            />
          ))}
        </div>
      )}
    </>
  );
}

interface RowProps {
  item: Item;
  upcoming: Placement[];
  occurrences: Map<string, Occurrence> | undefined;
  streak: number | null;
  onOpen: () => void;
  onMenu: () => void;
  actions: ReturnType<typeof useItemActions>;
}

function EventRow({ item, upcoming, occurrences, streak, onOpen, onMenu, actions }: RowProps) {
  const t = useT();
  const today = useToday();
  const cat = displayCategory(item);
  const repeating = isRepeating(item);
  const hasTree = subtaskCount(item) > 0;
  const progress = !repeating && hasTree ? itemProgress(item) : null;
  const tags = itemTags(item, upcoming, today, streak);
  const inactive = item.status !== "active";

  // Checkbox: something you mark and that applies today.
  let check: React.ReactNode = null;
  if (item.completion === "check" && item.status === "active") {
    if (repeating) {
      const ctx = itemRuleContext(item);
      if (ctx && occursOn(ctx, today)) {
        const doc = occurrences?.get(occurrenceId(item.id, today)) ?? null;
        const { state } = occurrenceState(item, today, today, doc, today);
        check = (
          <Checkbox
            state={state === "missed" ? "pending" : state}
            label={t.detail.markDone}
            onToggle={hasTree ? undefined : (c) => actions.toggleOccurrence(item, today, doc, null, c)}
          />
        );
      }
    } else if (!hasTree) {
      check = <Checkbox state={item.completedAt ? "done" : "pending"} label={t.detail.markDone} onToggle={(c) => actions.toggleNode(item, null, c)} />;
    }
  }

  return (
    <div className={`${styles.item} ${inactive ? styles.dim : ""}`} onClick={onOpen} role="link" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onOpen()}>
      <div className="row">
        <ColorDot color={item.color} tone={toneOf(item)} />
        <b className={styles.name}>{item.title}</b>
        {inactive && <span className="chip">{t.status[item.status]}</span>}
        <span className={`chip ${CATEGORY_CLASS[cat]}`}>{t.category[cat]}</span>
        {progress && <span className="muted">{Math.round(ratio(progress) * 100)}%</span>}
        {check}
        <button
          className={styles.more}
          aria-label={t.menu.title}
          onClick={(e) => {
            e.stopPropagation();
            onMenu();
          }}
        >
          <MoreIcon size={18} />
        </button>
      </div>
      {progress && progress.total > 1 && (
        <div className="row">
          <ProgressBar value={ratio(progress)} tone={progress.done === progress.total ? "green" : "blue"} />
        </div>
      )}
      {tags.length > 0 && (
        <div className="tags">
          {tags.map((tag) => (
            <span key={tag.text} className={`tag ${tag.kind ?? ""}`}>
              {tag.text}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
