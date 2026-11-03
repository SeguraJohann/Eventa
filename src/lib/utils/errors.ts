// Tiny global error channel so services can report background write failures
// and the UI can show a toast without coupling layers.

type Listener = (message: unknown) => void;
const listeners = new Set<Listener>();

export function reportError(error: unknown): void {
  console.error(error);
  for (const l of listeners) l(error);
}

export function onErrorReported(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
