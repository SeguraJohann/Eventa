import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useSearchParams } from "react-router-dom";
import { useT } from "@/i18n";
import { AddIcon, CalendarIcon, EventsIcon, LogoutIcon, OfflineIcon, TodayIcon } from "@/components/icons";
import { ColorDot } from "@/components/ui/misc";
import { useAuth } from "@/features/auth/AuthContext";
import { useItemsData } from "@/features/data/ItemsContext";
import { useToday } from "@/features/data/ClockContext";
import { useModals } from "@/features/modals/ModalContext";
import { toneOf } from "@/lib/agenda/agenda";
import { isValidDateKey } from "@/lib/date/dateKey";
import { paths } from "./paths";
import styles from "./AppLayout.module.css";

function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

export function AppLayout() {
  const t = useT();
  const { user, signOutUser } = useAuth();
  const { items } = useItemsData();
  const { open } = useModals();
  const today = useToday();
  const location = useLocation();
  const [params] = useSearchParams();
  const online = useOnline();

  const pinned = useMemo(
    () => items.filter((i) => i.pinned).sort((a, b) => (a.pinnedPosition ?? 0) - (b.pinnedPosition ?? 0)),
    [items],
  );

  const path = location.pathname;
  const section = path.startsWith(paths.calendar) ? "calendar" : path.startsWith(paths.events) ? (path === paths.events ? "events" : "detail") : "today";
  const calendarDate = params.get("fecha");
  const selectedDate = section === "calendar" && calendarDate && isValidDateKey(calendarDate) ? calendarDate : today;

  // Contextual ＋: Today/Calendar → add to this day; Events → form without date; detail → none.
  const onFab = () => {
    if (section === "events") open({ type: "itemForm", mode: "create" });
    else open({ type: "addToDay", date: selectedDate });
  };

  const navCls = ({ isActive }: { isActive: boolean }) => `${styles.nv} ${isActive ? styles.on : ""}`;
  const tabCls = ({ isActive }: { isActive: boolean }) => (isActive ? styles.on : "");

  return (
    <div className={styles.app}>
      <nav className={styles.side} aria-label={t.nav.main}>
        <Link to={paths.today} className={styles.brand}>
          <span className={styles.mark} />
          {t.app.name}
        </Link>
        <div className={styles.nav}>
          <NavLink to={paths.today} className={navCls}>
            <TodayIcon size={18} />
            {t.nav.today}
          </NavLink>
          <NavLink to={paths.calendar} className={navCls}>
            <CalendarIcon size={18} />
            {t.nav.calendar}
          </NavLink>
          <NavLink to={paths.events} className={navCls}>
            <EventsIcon size={18} />
            {t.nav.events}
          </NavLink>
        </div>
        {pinned.length > 0 && (
          <div>
            <p className={styles.sec}>{t.nav.pinned}</p>
            {pinned.map((i) => (
              <NavLink key={i.id} to={paths.item(i.id)} className={({ isActive }) => `${styles.sl} ${isActive ? styles.on : ""}`}>
                <ColorDot color={i.color} tone={toneOf(i)} />
                <span>{i.title}</span>
              </NavLink>
            ))}
          </div>
        )}
        <div className={styles.sideFoot}>
          <button className={`btn ${styles.newBtn}`} onClick={() => open({ type: "itemForm", mode: "create" })}>
            <AddIcon size={18} />
            {t.nav.newEvent}
          </button>
          {user && (
            <div className={styles.user}>
              <span title={user.email}>{user.email}</span>
              <button onClick={() => void signOutUser()} aria-label={t.auth.signOut} title={t.auth.signOut}>
                <LogoutIcon size={16} />
              </button>
            </div>
          )}
        </div>
      </nav>

      <main className={`${styles.main} ${path === paths.today ? styles.fit : ""}`}>
        <div className={styles.inner}>
          {!online && (
            <div className={styles.offline} role="status">
              <OfflineIcon size={16} />
              {t.app.offline}
            </div>
          )}
          <Outlet />
        </div>
      </main>

      <nav className={styles.tabbar} aria-label={t.nav.main}>
        <NavLink to={paths.today} className={tabCls}>
          <span>
            <TodayIcon size={18} />
          </span>
          {t.nav.today}
        </NavLink>
        <NavLink to={paths.calendar} className={tabCls}>
          <span>
            <CalendarIcon size={18} />
          </span>
          {t.nav.calendar}
        </NavLink>
        <NavLink to={paths.events} className={({ isActive }) => (isActive || section === "detail" ? styles.on : "")}>
          <span>
            <EventsIcon size={18} />
          </span>
          {t.nav.events}
        </NavLink>
      </nav>
      {section !== "detail" && (
        <button className={styles.fab} onClick={onFab} aria-label={t.nav.add}>
          <AddIcon size={26} />
        </button>
      )}
    </div>
  );
}
