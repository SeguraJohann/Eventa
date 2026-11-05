import { useEffect, useRef, useState } from "react";

export interface ScrollEdges {
  above: boolean;
  below: boolean;
}

/**
 * Tracks whether a scroll container has hidden content above or below,
 * so the UI can hint that it scrolls (e.g. fading the cut edge).
 */
export function useScrollEdges<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [edges, setEdges] = useState<ScrollEdges>({ above: false, below: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const above = el.scrollTop > 2;
      const below = el.scrollTop + el.clientHeight < el.scrollHeight - 2;
      setEdges((prev) => (prev.above === above && prev.below === below ? prev : { above, below }));
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    // Size changes of the box or of its content (rows added, checked, cards toggled).
    // Missing in very old browsers and in jsdom: the hint then only updates on scroll.
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    const observeAll = () => {
      ro?.observe(el);
      for (const child of Array.from(el.children)) ro?.observe(child);
    };
    observeAll();
    const mo =
      typeof MutationObserver === "undefined"
        ? null
        : new MutationObserver(() => {
            observeAll();
            update();
          });
    mo?.observe(el, { childList: true, subtree: true });
    return () => {
      el.removeEventListener("scroll", update);
      ro?.disconnect();
      mo?.disconnect();
    };
  }, []);

  return { ref, edges };
}
