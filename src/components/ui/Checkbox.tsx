import type { MouseEvent } from "react";

export type CheckState = "pending" | "partial" | "done" | "skipped" | "missed";

interface Props {
  state: CheckState;
  onToggle?: (checked: boolean) => void;
  label: string;
  small?: boolean;
  disabled?: boolean;
}

/** Square checkbox from the maqueta (pending / partial / done). */
export function Checkbox({ state, onToggle, label, small, disabled }: Props) {
  const look = state === "done" ? "on" : state === "partial" ? "part" : state === "skipped" ? "skip" : "";
  const cls = `cb ${look} ${small ? "sm" : ""}`;
  if (!onToggle) return <span className={cls} aria-hidden="true" />;
  return (
    <button
      type="button"
      className={cls}
      aria-label={label}
      aria-pressed={state === "done"}
      disabled={disabled}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e: MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        onToggle(state !== "done");
      }}
    />
  );
}
