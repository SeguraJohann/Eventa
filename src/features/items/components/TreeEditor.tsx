import { useRef, useState, type KeyboardEvent } from "react";
import { newNodeId, normalizeRows, type EditorRow } from "@/lib/tree/tree";
import { CloseIcon, GripIcon, IndentIcon, OutdentIcon, PasteIcon } from "@/components/icons";
import { useModals } from "@/features/modals/ModalContext";
import { useT } from "@/i18n";
import styles from "./ItemForm.module.css";

interface Props {
  rows: EditorRow[];
  onChange: (rows: EditorRow[]) => void;
}

/** S1/S2 — subtask tree editor inside the form: Enter, Tab, Shift+Tab, drag, paste list. */
export function TreeEditor({ rows, onChange }: Props) {
  const t = useT();
  const { open } = useModals();
  const refs = useRef(new Map<string, HTMLInputElement>());
  const [newText, setNewText] = useState("");
  const newRef = useRef<HTMLInputElement>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  const focus = (id: string | "new") => {
    window.requestAnimationFrame(() => {
      const el = id === "new" ? newRef.current : refs.current.get(id);
      el?.focus();
    });
  };

  const set = (next: EditorRow[]) => onChange(normalizeRows(next));

  // Moves a row together with its descendants.
  const blockOf = (i: number) => {
    let end = i + 1;
    while (end < rows.length && rows[end].depth > rows[i].depth) end++;
    return end;
  };

  const indent = (i: number, dir: 1 | -1) => {
    if (dir === 1 && (i === 0 || rows[i].depth > rows[i - 1].depth)) return;
    if (dir === -1 && rows[i].depth === 0) return;
    const end = blockOf(i);
    set(rows.map((r, k) => (k >= i && k < end ? { ...r, depth: r.depth + dir } : r)));
  };

  const remove = (i: number) => {
    const end = blockOf(i);
    // Children move up one level.
    const next = rows.flatMap((r, k) => (k === i ? [] : k > i && k < end ? [{ ...r, depth: r.depth - 1 }] : [r]));
    set(next);
    const target = next[Math.max(0, i - 1)];
    focus(target ? target.id : "new");
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>, i: number) => {
    const r = rows[i];
    if (e.key === "Enter") {
      e.preventDefault();
      const id = newNodeId();
      const next = [...rows];
      next.splice(i + 1, 0, { id, title: "", depth: r.depth });
      set(next);
      focus(id);
    } else if (e.key === "Tab") {
      e.preventDefault();
      indent(i, e.shiftKey ? -1 : 1);
      focus(r.id);
    } else if (e.key === "Backspace" && r.title === "") {
      e.preventDefault();
      remove(i);
    } else if (e.key === "ArrowUp" && i > 0) {
      focus(rows[i - 1].id);
    } else if (e.key === "ArrowDown") {
      focus(i < rows.length - 1 ? rows[i + 1].id : "new");
    }
  };

  const addFromNew = () => {
    const title = newText.trim();
    if (!title) return;
    const depth = rows.length ? rows[rows.length - 1].depth : 0;
    set([...rows, { id: newNodeId(), title, depth }]);
    setNewText("");
    focus("new");
  };

  const drop = (to: number) => {
    if (dragId === null) return;
    const from = rows.findIndex((r) => r.id === dragId);
    if (from < 0) return;
    const end = blockOf(from);
    if (to > from && to < end) return;
    const block = rows.slice(from, end);
    const rest = [...rows.slice(0, from), ...rows.slice(end)];
    const insertAt = to > from ? to - block.length : to;
    const baseDepth = rest[insertAt - 1] ? Math.min(block[0].depth, rest[insertAt - 1].depth + 1) : 0;
    const shift = baseDepth - block[0].depth;
    const moved = block.map((r) => ({ ...r, depth: r.depth + shift }));
    set([...rest.slice(0, insertAt), ...moved, ...rest.slice(insertAt)]);
  };

  return (
    <div className="box">
      <div className="top">
        <span className="lbl">{t.form.subtasks}</span>
        <button type="button" className="btn sm" onClick={() => open({ type: "paste", onAdd: (added) => set([...rows, ...added]) })}>
          <PasteIcon size={16} />
          {t.form.pasteList}
        </button>
      </div>
      {rows.map((r, i) => (
        <div
          key={r.id}
          className={`${styles.te} ${overIdx === i ? styles.over : ""}`}
          style={{ paddingLeft: r.depth * 28 }}
          onDragOver={(e) => {
            if (dragId) {
              e.preventDefault();
              setOverIdx(i);
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            drop(i);
            setDragId(null);
            setOverIdx(null);
          }}
        >
          <span
            className={styles.grip}
            draggable
            onDragStart={(e) => {
              setDragId(r.id);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragEnd={() => {
              setDragId(null);
              setOverIdx(null);
            }}
            aria-hidden="true"
          >
            <GripIcon size={16} />
          </span>
          <input
            ref={(el) => {
              if (el) refs.current.set(r.id, el);
              else refs.current.delete(r.id);
            }}
            className="inp"
            value={r.title}
            aria-label={t.form.subtaskLabel}
            onChange={(e) => onChange(rows.map((x) => (x.id === r.id ? { ...x, title: e.target.value } : x)))}
            onKeyDown={(e) => onKey(e, i)}
            onPaste={(e) => {
              const text = e.clipboardData.getData("text");
              if (text.includes("\n")) {
                e.preventDefault();
                open({ type: "paste", onAdd: (added) => set([...rows.slice(0, i + 1), ...added.map((a) => ({ ...a, depth: a.depth + r.depth })), ...rows.slice(i + 1)]) });
              }
            }}
          />
          {r.depth === 0 ? (
            <button type="button" className="ib" aria-label={t.form.indent} onClick={() => indent(i, 1)} disabled={i === 0}>
              <IndentIcon size={16} />
            </button>
          ) : (
            <button type="button" className="ib" aria-label={t.form.outdent} onClick={() => indent(i, -1)}>
              <OutdentIcon size={16} />
            </button>
          )}
          <button type="button" className="ib" aria-label={t.form.remove} onClick={() => remove(i)}>
            <CloseIcon size={16} />
          </button>
        </div>
      ))}
      <div
        className={`${styles.te} ${overIdx === rows.length ? styles.over : ""}`}
        onDragOver={(e) => {
          if (dragId) {
            e.preventDefault();
            setOverIdx(rows.length);
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          drop(rows.length);
          setDragId(null);
          setOverIdx(null);
        }}
      >
        <span className={styles.grip} />
        <input
          ref={newRef}
          className="inp"
          placeholder={t.form.subtaskPlaceholder}
          aria-label={t.form.subtaskPlaceholder}
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addFromNew();
            } else if (e.key === "ArrowUp" && rows.length) focus(rows[rows.length - 1].id);
          }}
          onBlur={addFromNew}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text");
            if (text.includes("\n")) {
              e.preventDefault();
              open({ type: "paste", onAdd: (added) => set([...rows, ...added]) });
            }
          }}
        />
      </div>
      <p className="hint">{t.form.subtasksHint}</p>
    </div>
  );
}
