// NOTE: keep this barrel free of `node:crypto` (and any other Node-only
// imports). It is re-exported from the package root, which client components
// pull into the browser bundle. Node-only helpers (crypto, generateId) live in
// ./crypto.js and are exposed via the "@revualy/shared/server" subpath instead.
export * from "./goals.js";

export function toISOString(date: Date = new Date()): string {
  return date.toISOString();
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function omit<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[],
): Omit<T, K> {
  const result = { ...obj };
  for (const key of keys) {
    delete result[key];
  }
  return result;
}

export function pick<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[],
): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    if (key in obj) {
      result[key] = obj[key];
    }
  }
  return result;
}
