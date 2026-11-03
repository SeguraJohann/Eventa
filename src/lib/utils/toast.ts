type Action = { label: string; run: () => void };
type Listener = (text: string, action?: Action) => void;
const listeners = new Set<Listener>();

export function toast(text: string, action?: Action): void {
  for (const l of listeners) l(text, action);
}

export function onToast(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
