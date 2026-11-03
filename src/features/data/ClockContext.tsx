import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { DateKey } from "@/types/models";
import { nowMinutes, todayKey } from "@/lib/date/dateKey";

interface Clock {
  today: DateKey;
  /** Minutes since local midnight, updated every minute. */
  minutes: number;
}

const ClockContext = createContext<Clock | null>(null);

function read(): Clock {
  const now = new Date();
  return { today: todayKey(now), minutes: nowMinutes(now) };
}

export function ClockProvider({ children }: { children: ReactNode }) {
  const [clock, setClock] = useState<Clock>(read);
  useEffect(() => {
    let timer: number;
    const tick = () => {
      setClock((prev) => {
        const next = read();
        return prev.today === next.today && prev.minutes === next.minutes ? prev : next;
      });
      timer = window.setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
    };
    timer = window.setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
    const onVisible = () => {
      if (document.visibilityState === "visible") setClock(read());
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return <ClockContext.Provider value={clock}>{children}</ClockContext.Provider>;
}

export function useClock(): Clock {
  const ctx = useContext(ClockContext);
  if (!ctx) throw new Error("useClock must be used inside ClockProvider");
  return ctx;
}

export function useToday(): DateKey {
  return useClock().today;
}
