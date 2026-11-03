import type { AgendaEntry } from "@/lib/agenda/agenda";
import { Checkbox } from "@/components/ui/Checkbox";
import { NextIcon } from "@/components/icons";
import { colorSolid } from "@/styles/semantic";
import { ruleTag } from "@/lib/date/format";
import { fmt, useT } from "@/i18n";
import styles from "./EntryRow.module.css";

interface Props {
  entry: AgendaEntry;
  onTap: (e: AgendaEntry) => void;
  onToggle: (e: AgendaEntry, checked: boolean) => void;
  streak?: number;
}

/** A row of the "no time" list of a day. */
export function EntryRow({ entry: e, onTap, onToggle, streak }: Props) {
  const t = useT();
  const directCheck = e.checkable && !e.progress && e.state !== "skipped";
  const cls = `${styles.t} ${e.state === "done" ? styles.done : ""} ${e.state === "skipped" ? styles.skipped : ""}`;
  const pathPrefix = e.path.length > 0 ? `${e.path.join(" › ")} › ` : "";
  const rule = e.kind === "occurrence" && e.item.recurrence ? ruleTag(e.item.recurrence) : null;
  return (
    <div className={cls} role="button" tabIndex={0} onClick={() => onTap(e)} onKeyDown={(ev) => ev.key === "Enter" && onTap(e)}>
      {e.checkable ? (
        <Checkbox state={e.state === "missed" ? "pending" : e.state} label={t.detail.markDone} onToggle={directCheck ? (c) => onToggle(e, c) : undefined} />
      ) : (
        <span className={styles.mark} style={{ background: colorSolid(e.color, e.tone) }} />
      )}
      <span className={styles.n}>
        {pathPrefix && <small>{pathPrefix}</small>}
        {e.title}
      </span>
      <span className={styles.r}>
        {e.timeMode === "all_day" && <span className="chip">{t.common.allDay}</span>}
        {e.state === "skipped" && <span className="chip">{t.today.skipped}</span>}
        {e.occurrence?.moved && <span className="chip">{t.today.moved}</span>}
        {rule && (
          <span className="tag rep">
            ↻ {rule}
            {streak ? ` · ${fmt(t.events.streak, { n: streak })}` : ""}
          </span>
        )}
        {e.progress && (
          <>
            {e.progress.done}/{e.progress.total}
            <NextIcon size={14} />
          </>
        )}
      </span>
    </div>
  );
}
