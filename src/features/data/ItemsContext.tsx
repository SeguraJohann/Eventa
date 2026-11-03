import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Item } from "@/types/models";
import { fetchItem, subscribeItems } from "@/features/items/services/items.service";
import { useUid } from "@/features/auth/AuthContext";

interface ItemsContextValue {
  /** Active and paused items (live). */
  items: Item[];
  loading: boolean;
  error: boolean;
  /** Finds an item among live, inactive and fetched ones. */
  lookupItem: (id: string) => Item | undefined;
  /** Fetches items not in memory (finished/archived referenced by old placements). */
  ensureItems: (ids: string[]) => void;
  /** Subscribe to finished/archived items while a view needs them. */
  retainInactive: () => () => void;
  inactive: Item[];
  inactiveLoading: boolean;
}

const ItemsContext = createContext<ItemsContextValue | null>(null);

export function ItemsProvider({ children }: { children: ReactNode }) {
  const uid = useUid();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [inactive, setInactive] = useState<Item[]>([]);
  const [inactiveLoading, setInactiveLoading] = useState(false);
  const [fetched, setFetched] = useState<Map<string, Item | null>>(new Map());
  const pending = useRef(new Set<string>());
  const retainCount = useRef(0);
  const [retained, setRetained] = useState(false);

  useEffect(() => {
    setLoading(true);
    return subscribeItems(
      uid,
      ["active", "paused"],
      (list) => {
        setItems(list);
        setLoading(false);
        setError(false);
      },
      () => {
        setLoading(false);
        setError(true);
      },
    );
  }, [uid]);

  useEffect(() => {
    if (!retained) return;
    setInactiveLoading(true);
    return subscribeItems(uid, ["done", "archived"], (list) => {
      setInactive(list);
      setInactiveLoading(false);
    });
  }, [uid, retained]);

  // A fetched copy goes stale once the item is live again: drop it so it is
  // fetched fresh if it leaves the live list later (finished, archived…).
  useEffect(() => {
    setFetched((prev) => {
      if (prev.size === 0) return prev;
      const live = new Set(items.map((i) => i.id));
      let changed = false;
      const next = new Map(prev);
      for (const id of prev.keys()) {
        if (live.has(id)) {
          next.delete(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [items]);

  const retainInactive = useCallback(() => {
    retainCount.current++;
    setRetained(true);
    return () => {
      retainCount.current--;
      if (retainCount.current <= 0) {
        retainCount.current = 0;
        // Keep the list cached; just stop listening.
        setRetained(false);
      }
    };
  }, []);

  const byId = useMemo(() => {
    const map = new Map<string, Item>();
    for (const [id, it] of fetched) if (it) map.set(id, it);
    for (const it of inactive) map.set(it.id, it);
    for (const it of items) map.set(it.id, it);
    return map;
  }, [items, inactive, fetched]);

  const lookupItem = useCallback((id: string) => byId.get(id), [byId]);

  const ensureItems = useCallback(
    (ids: string[]) => {
      const missing = ids.filter((id) => !byId.has(id) && !fetched.has(id) && !pending.current.has(id));
      if (missing.length === 0) return;
      for (const id of missing) pending.current.add(id);
      Promise.all(missing.map((id) => fetchItem(uid, id).catch(() => null))).then((res) => {
        setFetched((prev) => {
          const next = new Map(prev);
          missing.forEach((id, i) => {
            next.set(id, res[i]);
            pending.current.delete(id);
          });
          return next;
        });
      });
    },
    [byId, fetched, uid],
  );

  const value = useMemo(
    () => ({ items, loading, error, lookupItem, ensureItems, retainInactive, inactive, inactiveLoading }),
    [items, loading, error, lookupItem, ensureItems, retainInactive, inactive, inactiveLoading],
  );
  return <ItemsContext.Provider value={value}>{children}</ItemsContext.Provider>;
}

export function useItemsData(): ItemsContextValue {
  const ctx = useContext(ItemsContext);
  if (!ctx) throw new Error("useItemsData must be used inside ItemsProvider");
  return ctx;
}
