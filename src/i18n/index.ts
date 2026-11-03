import { es } from "./es";

export { es };
export type { Translations } from "./es";

/** Returns the translation object (only Spanish for now). */
export function useT() {
  return es;
}

/** Replaces {key} placeholders. */
export function fmt(template: string, vars: object): string {
  const map = vars as Record<string, unknown>;
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in map ? String(map[k]) : m));
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
