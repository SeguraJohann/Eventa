// Data hooks: the only bridge between components and services.

import { useEffect, useMemo, useState } from "react";
import type { DateKey, Day, Item, Occurrence, Placement } from "@/types/models";
import { useUid } from "@/features/auth/AuthContext";
import { useItemsData } from "./ItemsContext";
import { useToday } from "./ClockContext";
import { subscribeItemPlacements, subscribeOpenPlacements, subscribePlacementsRange } from "@/features/placements/services/placements.service";
import { subscribeItemOccurrences, subscribeOccurrencesRange } from "@/features/occurrences/services/occurrences.service";
import { subscribeDay, subscribeDaysRange } from "@/features/days/services/days.service";
import { agendaForRange, type AgendaEntry } from "@/lib/agenda/agenda";
import { addDays } from "@/lib/date/dateKey";

interface Loadable<T> {
  data: T;
  loading: boolean;
}

function useSubscription<T>(key: string | null, initial: T, subscribe: (cb: (v: T) => void) => () => void): Loadable<T> {
  const [state, setState] = useState<{ key: string | null; data: T; loading: boolean }>({ key, data: initial, loading: key !== null });
  useEffect(() => {
    if (key === null) return;
    setState((s) => (s.key === key ? s : { key, data: s.data, loading: true }));
    return subscribe((data) => setState({ key, data, loading: false }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { data: state.data, loading: state.loading };
}

export function usePlacementsRange(from: DateKey, to: DateKey): Loadable<Placement[]> {
  const uid = useUid();
  return useSubscription(`${uid}|${from}|${to}`, [] as Placement[], (cb) => subscribePlacementsRange(uid, from, to, cb));
}

export function useOpenPlacements(): Loadable<Placement[]> {
  const uid = useUid();
  return useSubscription(`${uid}|open`, [] as Placement[], (cb) => subscribeOpenPlacements(uid, cb));
}

export function useItemPlacements(itemId: string | null): Loadable<Placement[]> {
  const uid = useUid();
  return useSubscription(itemId ? `${uid}|${itemId}` : null, [] as Placement[], (cb) => subscribeItemPlacements(uid, itemId!, cb));
}

export function useOccurrencesRange(from: DateKey, to: DateKey): Loadable<Map<string, Occurrence>> {
  const uid = useUid();
  const res = useSubscription(`${uid}|${from}|${to}`, [] as Occurrence[], (cb) => subscribeOccurrencesRange(uid, from, to, cb));
  const map = useMemo(() => new Map(res.data.map((o) => [o.id, o])), [res.data]);
  return { data: map, loading: res.loading };
}

export function useItemOccurrences(itemId: string | null): Loadable<Occurrence[]> {
  const uid = useUid();
  return useSubscription(itemId ? `${uid}|${itemId}` : null, [] as Occurrence[], (cb) => subscribeItemOccurrences(uid, itemId!, cb));
}

/** Occurrences of several items (a split chain), keyed by item id. */
export function useChainOccurrences(ids: string[]): Loadable<Map<string, Map<string, Occurrence>>> {
  const uid = useUid();
  const key = ids.length ? `${uid}|${ids.join(",")}` : null;
  const res = useSubscription(key, [] as Occurrence[], (cb) => {
    const parts = new Map<string, Occurrence[]>();
    const unsubs = ids.map((id) =>
      subscribeItemOccurrences(uid, id, (list) => {
        parts.set(id, list);
        if (parts.size === ids.length) cb([...parts.values()].flat());
      }),
    );
    return () => unsubs.forEach((u) => u());
  });
  const map = useMemo(() => {
    const out = new Map<string, Map<string, Occurrence>>();
    for (const o of res.data) {
      let m = out.get(o.itemId);
      if (!m) out.set(o.itemId, (m = new Map()));
      m.set(o.id, o);
    }
    return out;
  }, [res.data]);
  return { data: map, loading: res.loading };
}

export function useDay(date: DateKey): Loadable<Day | null> {
  const uid = useUid();
  return useSubscription(`${uid}|${date}`, null as Day | null, (cb) => subscribeDay(uid, date, cb));
}

export function useDaysRange(from: DateKey, to: DateKey): Loadable<Map<DateKey, Day>> {
  const uid = useUid();
  const res = useSubscription(`${uid}|${from}|${to}`, [] as Day[], (cb) => subscribeDaysRange(uid, from, to, cb));
  const map = useMemo(() => new Map(res.data.map((d) => [d.date, d])), [res.data]);
  return { data: map, loading: res.loading };
}

/** Everything shown in [from, to], keyed by day. */
export function useAgenda(from: DateKey, to: DateKey): { byDay: Map<DateKey, AgendaEntry[]>; loading: boolean } {
  const { items, lookupItem, ensureItems, loading: itemsLoading } = useItemsData();
  const today = useToday();
  const placements = usePlacementsRange(from, to);
  const occurrences = useOccurrencesRange(from, to);

  // Old placements may point to finished items that are not in memory.
  useEffect(() => {
    const missing = placements.data.map((p) => p.itemId).filter((id) => !lookupItem(id));
    if (missing.length) ensureItems([...new Set(missing)]);
  }, [placements.data, lookupItem, ensureItems]);

  const byDay = useMemo(
    () => agendaForRange({ items, lookupItem, placements: placements.data, occurrences: occurrences.data, today }, from, to),
    [items, lookupItem, placements.data, occurrences.data, today, from, to],
  );
  return { byDay, loading: itemsLoading || placements.loading || occurrences.loading };
}

export interface OverdueEntry {
  placement: Placement;
  item: Item;
}

/** Placements on past days whose target is still incomplete. */
export function useOverdue(): { list: OverdueEntry[]; loading: boolean } {
  const { lookupItem } = useItemsData();
  const today = useToday();
  const open = useOpenPlacements();
  const list = useMemo(() => {
    const out: OverdueEntry[] = [];
    for (const p of open.data) {
      if (p.date >= today) continue;
      const item = lookupItem(p.itemId);
      if (!item || item.status !== "active") continue;
      if (p.nodeId !== null && (!item.nodes[p.nodeId] || item.nodes[p.nodeId].removedOn !== null)) continue;
      out.push({ placement: p, item });
    }
    return out.sort((a, b) => (a.placement.date < b.placement.date ? -1 : 1));
  }, [open.data, lookupItem, today]);
  return { list, loading: open.loading };
}

/** Item by id from memory, fetching it when needed. */
export function useItem(id: string | undefined): { item: Item | undefined; loading: boolean } {
  const { lookupItem, ensureItems, loading } = useItemsData();
  const item = id ? lookupItem(id) : undefined;
  const [tried, setTried] = useState<string | null>(null);
  useEffect(() => {
    if (!id || item || loading) return;
    ensureItems([id]);
    const t = window.setTimeout(() => setTried(id), 2500);
    return () => window.clearTimeout(t);
  }, [id, item, loading, ensureItems]);
  return { item, loading: loading || (!item && tried !== id) };
}

export function useWeekRange(anchor: DateKey): { from: DateKey; to: DateKey } {
  return useMemo(() => ({ from: anchor, to: addDays(anchor, 6) }), [anchor]);
}
