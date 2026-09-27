/**
 * A same-site path to redirect to after an action, or the fallback. Rejects
 * absolute and protocol-relative URLs ("//host"), backslashes ("/\host",
 * which URL parsers treat as "//host"), control characters ("/%09/host"
 * decodes to a tab the parser drops), and anything that resolves to another
 * origin. Review findings 2026-09-28. Edge-safe.
 */
export function safeRelativePath(raw: string | null | undefined, fallback: string | null): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return fallback;
  // eslint-disable-next-line no-control-regex
  if (raw.includes("\\") || /[\u0000-\u001f\u007f]/.test(raw)) return fallback;
  try {
    const resolved = new URL(raw, "http://same.origin");
    if (resolved.origin !== "http://same.origin") return fallback;
    return resolved.pathname + resolved.search + resolved.hash;
  } catch {
    return fallback;
  }
}
