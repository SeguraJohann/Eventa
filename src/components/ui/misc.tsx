import type { ReactNode } from "react";
import type { ColorKey } from "@/types/models";
import type { Tone } from "@/lib/agenda/agenda";
import { colorSolid } from "@/styles/semantic";
import { useT } from "@/i18n";

export function ProgressBar({ value, tone = "blue", height, width }: { value: number; tone?: "blue" | "orange" | "green"; height?: number; width?: number | string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <span className="bar" style={{ height, width, flex: width ? "none" : undefined, display: "block" }}>
      <i className={tone === "orange" ? "h" : tone === "green" ? "ok" : ""} style={{ width: `${pct}%` }} />
    </span>
  );
}

interface SegProps<T extends string> {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  label?: string;
}

export function Segmented<T extends string>({ value, options, onChange, label }: SegProps<T>) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} className={o.value === value ? "on" : ""} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "24px 16px", textAlign: "center" }}>
      <p className="muted">{children}</p>
      {action}
    </div>
  );
}

export function ColorDot({ color, tone = "once", size = 10 }: { color: ColorKey | null; tone?: Tone; size?: number }) {
  return <span className="dot" style={{ background: colorSolid(color, tone), width: size, height: size, borderRadius: size > 12 ? 5 : 3 }} />;
}

export function Loading({ full }: { full?: boolean }) {
  const t = useT();
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: full ? "100dvh" : 120 }}>
      <span className="muted">{t.app.loading}</span>
    </div>
  );
}
