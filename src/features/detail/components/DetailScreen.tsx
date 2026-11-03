import { Link, useParams, useSearchParams } from "react-router-dom";
import { useItem } from "@/features/data/hooks";
import { useModals } from "@/features/modals/ModalContext";
import { useItemActions } from "@/features/items/hooks/useItemActions";
import { displayCategory, isRepeating } from "@/lib/agenda/items";
import { toneOf } from "@/lib/agenda/agenda";
import { CATEGORY_CLASS } from "@/styles/semantic";
import { dayMonth } from "@/lib/date/format";
import { EditIcon, MoreIcon, PauseIcon, PlaceIcon, PrevIcon, ReopenIcon, ResumeIcon } from "@/components/icons";
import { ColorDot, Empty, Loading } from "@/components/ui/misc";
import { fmt, useT } from "@/i18n";
import { paths } from "@/routes/paths";
import { OnceDetail } from "./OnceDetail";
import { RepeatDetail } from "./RepeatDetail";

export default function DetailScreen() {
  const t = useT();
  const { id } = useParams();
  const [params] = useSearchParams();
  const { item, loading } = useItem(id);
  const { open } = useModals();
  const actions = useItemActions();

  if (!item) {
    return (
      <>
        <Link className="lnk" to={paths.events}>
          <PrevIcon size={16} />
          {t.detail.backToEvents}
        </Link>
        {loading ? <Loading /> : <Empty>{t.detail.notFound}</Empty>}
      </>
    );
  }

  const repeating = isRepeating(item);
  const cat = displayCategory(item);
  const readOnly = item.status === "done" || item.status === "archived";
  const openPause = item.pauses.find((p) => p.to === null);

  return (
    <>
      <Link className="lnk" to={paths.events}>
        <PrevIcon size={16} />
        {t.detail.backToEvents}
      </Link>
      <header className="top">
        <div className="row" style={{ flexWrap: "wrap", minWidth: 0 }}>
          <ColorDot color={item.color} tone={toneOf(item)} size={16} />
          <h1 className="h1" style={{ overflowWrap: "anywhere" }}>
            {item.title}
          </h1>
          <span className={`chip ${CATEGORY_CLASS[cat]}`}>{t.category[cat]}</span>
          {repeating && <span className="tag rep">↻ {t.form.repeats.toLowerCase()}</span>}
          {item.status !== "active" && <span className="chip">{t.status[item.status]}</span>}
        </div>
        <div className="row">
          {readOnly ? (
            <button className="btn" onClick={() => actions.setStatus(item, "active")}>
              <ReopenIcon size={16} />
              {t.detail.reopen}
            </button>
          ) : (
            <>
              {repeating ? (
                <button className="btn desk-only" onClick={() => actions.setStatus(item, item.status === "paused" ? "active" : "paused")}>
                  {item.status === "paused" ? <ResumeIcon size={16} /> : <PauseIcon size={16} />}
                  {item.status === "paused" ? t.detail.resume : t.detail.pause}
                </button>
              ) : (
                <button className="btn desk-only" onClick={() => open({ type: "place", itemId: item.id, nodeId: null })}>
                  <PlaceIcon size={16} />
                  {t.detail.addDay}
                </button>
              )}
              <button className="btn" onClick={() => open({ type: "itemForm", mode: "edit", itemId: item.id })}>
                <EditIcon size={16} />
                {t.common.edit}
              </button>
            </>
          )}
          <button className="btn icon" aria-label={t.menu.title} onClick={() => open({ type: "itemMenu", itemId: item.id })}>
            <MoreIcon size={18} />
          </button>
        </div>
      </header>

      {item.status === "paused" && openPause && <p className="card" style={{ background: "var(--slate-t)", color: "var(--slate)", fontWeight: 600 }}>{fmt(t.detail.pausedBanner, { date: dayMonth(openPause.from) })}</p>}
      {readOnly && <p className="card" style={{ background: "var(--soft)", fontWeight: 600 }}>{item.status === "done" ? t.detail.finishedBanner : t.detail.archivedBanner}</p>}

      {repeating ? (
        <RepeatDetail item={item} readOnly={readOnly} />
      ) : (
        <OnceDetail item={item} readOnly={readOnly} focusNode={params.get("nodo")} />
      )}
    </>
  );
}
