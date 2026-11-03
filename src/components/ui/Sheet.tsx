import { useEffect, useRef, type ReactNode } from "react";
import { CloseIcon } from "@/components/icons";
import { useT } from "@/i18n";
import styles from "./Sheet.module.css";

interface Props {
  title?: ReactNode;
  eyebrow?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  /** Called on Ctrl/Cmd+Enter. */
  onSubmit?: () => void;
}

// Several sheets can be open (and close in the same render): lock the page
// scroll with a counter instead of restoring a saved value.
let openSheets = 0;

/** Bottom sheet on mobile, centered modal on desktop. */
export function Sheet({ title, eyebrow, onClose, children, footer, wide, onSubmit }: Props) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const onSubmitRef = useRef(onSubmit);
  useEffect(() => {
    onCloseRef.current = onClose;
    onSubmitRef.current = onSubmit;
  });

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Only the top-most sheet reacts.
      const sheets = document.querySelectorAll("[data-sheet]");
      if (sheets[sheets.length - 1] !== ref.current) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
      }
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && onSubmitRef.current) {
        e.preventDefault();
        onSubmitRef.current();
      }
    }
    document.addEventListener("keydown", onKey);
    openSheets++;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      openSheets = Math.max(0, openSheets - 1);
      if (openSheets === 0) document.body.style.overflow = "";
    };
  }, []);

  return (
    <div className={styles.scrim} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} data-sheet className={`${styles.sheet} ${wide ? styles.wide : ""}`} role="dialog" aria-modal="true">
        <div className={styles.grab} />
        {(title || eyebrow) && (
          <div className={styles.head}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {eyebrow && <p className="eyebrow">{eyebrow}</p>}
              {title && <h2 className={styles.title}>{title}</h2>}
            </div>
            <button type="button" className={styles.close} onClick={onClose} aria-label={t.common.close}>
              <CloseIcon size={20} />
            </button>
          </div>
        )}
        <div className={styles.body}>{children}</div>
        {footer && <div className={styles.foot}>{footer}</div>}
      </div>
    </div>
  );
}
