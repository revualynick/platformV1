/**
 * Build an absolute URL on the address the browser actually used.
 *
 * In the production (standalone) build, `request.url` carries the server's
 * own bind address (0.0.0.0 or 127.0.0.1), not the public host, so
 * `new URL(path, request.url)` sends people to an address they can't reach.
 * Found on staging, which runs the same image as Railway (2026-09-26).
 *
 * Uses the Host header (the edge routes on it, so a client can't point it
 * at another site and still reach us) and X-Forwarded-Proto for the scheme.
 * X-Forwarded-Host is not trusted: a client can set it to anything, which
 * put attacker hosts in redirect Location headers (review finding
 * 2026-09-28). Edge-safe: used by middleware.
 */
const HOST_RE = /^[a-z0-9.-]+(:\d{1,5})?$/i;

export function publicUrl(path: string, request: Request): URL {
  const headers = request.headers;
  const first = (v: string | null) => v?.split(",")[0]?.trim() || null;
  const host = first(headers.get("host"));
  const proto = first(headers.get("x-forwarded-proto")) ?? new URL(request.url).protocol.replace(":", "");
  if (host && HOST_RE.test(host) && (proto === "http" || proto === "https")) {
    return new URL(path, `${proto}://${host}`);
  }
  return new URL(path, request.url);
}
