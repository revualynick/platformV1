/** Typed FormData getters shared by server actions. */

export function getString(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  return typeof v === "string" && v.length > 0 ? v : null;
}

export function getNumber(fd: FormData, key: string): number | null {
  const raw = getString(fd, key);
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}
