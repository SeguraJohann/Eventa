import { useEffect, useState, type ReactNode } from "react";
import { childrenOf, depthOf, hasChildren, type NodeState, type Progress, type TreeIndex } from "@/lib/tree/tree";
import { AddIcon, ExpandedIcon, NextIcon } from "@/components/icons";
import { Checkbox } from "@/components/ui/Checkbox";
import { ProgressBar } from "@/components/ui/misc";
import { useT } from "@/i18n";
import styles from "./TreeView.module.css";

interface Props {
  /** Storage key for expand/collapse memory (S6). */
  storageKey: string;
  index: TreeIndex;
  stateOf: (id: string) => NodeState;
  progressOf: (id: string) => Progress | null;
  onToggle?: (id: string, checked: boolean) => void;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** Extra chips at the right of a row. */
  renderRight?: (id: string) => ReactNode;
  /** Rows that are shown dimmed and not checkable. */
  isOff?: (id: string) => boolean;
  /** Hide rows (filters). A parent stays visible if any descendant is visible. */
  isVisible?: (id: string) => boolean;
  onAdd?: (parentId: string | null, title: string) => void;
}

function readCollapsed(key: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(key) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

export function TreeView({ storageKey, index, stateOf, progressOf, onToggle, selectedId, onSelect, renderRight, isOff, isVisible, onAdd }: Props) {
  const t = useT();
  const [collapsed, setCollapsed] = useState<Set<string>>(() => readCollapsed(storageKey));
  const [adding, setAdding] = useState<string | null | undefined>(undefined);
  const [draft, setDraft] = useState("");

  useEffect(() => setCollapsed(readCollapsed(storageKey)), [storageKey]);

  // Reveal the selected node (e.g. opened from a day).
  useEffect(() => {
    if (!selectedId) return;
    let cur = index.nodes[selectedId]?.parentId ?? null;
    const open: string[] = [];
    while (cur) {
      open.push(cur);
      cur = index.nodes[cur]?.parentId ?? null;
    }
    if (open.some((id) => collapsed.has(id))) {
      const next = new Set(collapsed);
      open.forEach((id) => next.delete(id));
      setCollapsed(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const toggleCollapse = (id: string) => {
    const next = new Set(collapsed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setCollapsed(next);
    localStorage.setItem(storageKey, JSON.stringify([...next]));
  };

  const visibleMemo = new Map<string, boolean>();
  const visible = (id: string): boolean => {
    if (!isVisible) return true;
    const cached = visibleMemo.get(id);
    if (cached !== undefined) return cached;
    const v = isVisible(id) || childrenOf(index, id).some(visible);
    visibleMemo.set(id, v);
    return v;
  };

  const submitAdd = (parent: string | null) => {
    const title = draft.trim();
    if (title && onAdd) onAdd(parent, title);
    setDraft("");
  };

  const addRow = (parent: string | null, depth: number) => {
    if (!onAdd) return null;
    const pad = { paddingLeft: 10 + depth * 28, "--d": depth } as React.CSSProperties;
    if (adding === parent) {
      return (
        <div className={styles.t} style={pad} key={`add-${parent}`}>
          <span className={styles.tg} />
          <input
            autoFocus
            className={`inp ${styles.addInput}`}
            placeholder={t.detail.newSubtask}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submitAdd(parent);
              }
              if (e.key === "Escape") {
                setAdding(undefined);
                setDraft("");
              }
            }}
            onBlur={() => {
              submitAdd(parent);
              setAdding(undefined);
            }}
          />
        </div>
      );
    }
    return (
      <button type="button" className={`${styles.t} ${styles.add}`} style={{ ...pad, width: "100%" }} key={`add-${parent}`} onClick={() => setAdding(parent)}>
        <span className={styles.tg}>
          <AddIcon size={16} />
        </span>
        {t.detail.addSubtask}
      </button>
    );
  };

  const rows: ReactNode[] = [];
  const walk = (parent: string | null) => {
    for (const id of childrenOf(index, parent)) {
      if (!visible(id)) continue;
      const node = index.nodes[id];
      const depth = depthOf(index.nodes, id);
      const kids = hasChildren(index, id);
      const isCollapsed = collapsed.has(id);
      const state = stateOf(id);
      const off = isOff?.(id) ?? false;
      const progress = kids ? progressOf(id) : null;
      const cls = [styles.t, depth === 0 ? styles.top : "", state === "done" ? styles.done : "", selectedId === id ? styles.sel : "", off ? styles.off : ""].join(" ");
      rows.push(
        <div key={id} className={cls} style={{ paddingLeft: 10 + depth * 28, "--d": depth } as React.CSSProperties} onClick={() => onSelect?.(id)} role="treeitem" aria-selected={selectedId === id} aria-expanded={kids ? !isCollapsed : undefined}>
          {kids ? (
            <button
              type="button"
              className={styles.tg}
              aria-label={isCollapsed ? "+" : "−"}
              onClick={(e) => {
                e.stopPropagation();
                toggleCollapse(id);
              }}
            >
              {isCollapsed ? <NextIcon size={16} /> : <ExpandedIcon size={16} />}
            </button>
          ) : (
            <span className={styles.tg} />
          )}
          <Checkbox state={state} label={node.title} onToggle={onToggle && !off ? (c) => onToggle(id, c) : undefined} />
          <span className={styles.n}>{node.title}</span>
          <span className={styles.r}>
            {renderRight?.(id)}
            {progress && progress.total > 0 && (
              <>
                {progress.done > 0 && progress.done < progress.total && (
                  <span className={styles.barWrap}>
                    <ProgressBar value={progress.done / progress.total} />
                  </span>
                )}
                {progress.done}/{progress.total}
              </>
            )}
          </span>
        </div>,
      );
      if (kids && !isCollapsed) {
        walk(id);
        if (onAdd && (adding === id || selectedId === id)) rows.push(addRow(id, depth + 1));
      }
    }
  };
  walk(null);

  return (
    <div role="tree">
      {rows}
      {addRow(null, 0)}
    </div>
  );
}
