import { useEffect, useState } from "react";
import { onErrorReported } from "@/lib/utils/errors";
import { onToast } from "@/lib/utils/toast";
import { useT } from "@/i18n";

interface ToastItem {
  id: number;
  text: string;
  error: boolean;
  action?: { label: string; run: () => void };
}

let seq = 0;

function errorText(e: unknown, t: ReturnType<typeof useT>): string {
  const code = typeof e === "object" && e && "code" in e ? String((e as { code: unknown }).code) : "";
  if (code.includes("permission-denied")) return t.app.permissionError;
  return t.app.saveError;
}

export function ToastHost() {
  const t = useT();
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const push = (item: Omit<ToastItem, "id">) => {
      const id = ++seq;
      setToasts((list) => (list.some((x) => x.text === item.text) ? list : [...list, { ...item, id }]));
      window.setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), item.action ? 6000 : 4000);
    };
    const u1 = onErrorReported((e) => push({ text: errorText(e, t), error: true }));
    const u2 = onToast((text, action) => push({ text, error: false, action }));
    return () => {
      u1();
      u2();
    };
  }, [t]);

  if (toasts.length === 0) return null;
  return (
    <div
      style={{
        position: "fixed",
        left: "50%",
        transform: "translateX(-50%)",
        bottom: "calc(var(--tabbar-h) + 88px)",
        zIndex: "var(--z-toast)" as unknown as number,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        width: "min(440px, calc(100% - 32px))",
      }}
      role="status"
    >
      {toasts.map((x) => (
        <div
          key={x.id}
          style={{
            background: x.error ? "var(--rose)" : "var(--ink)",
            color: "var(--color-on-primary)",
            borderRadius: 12,
            padding: "10px 14px",
            boxShadow: "var(--shadow-pop)",
            display: "flex",
            alignItems: "center",
            gap: 12,
            fontWeight: 600,
          }}
        >
          <span style={{ flex: 1 }}>{x.text}</span>
          {x.action && (
            <button
              style={{ color: "var(--brand-b)", fontWeight: 700 }}
              onClick={() => {
                x.action!.run();
                setToasts((list) => list.filter((y) => y.id !== x.id));
              }}
            >
              {x.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
