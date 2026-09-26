/**
 * Build an absolute URL on the address the browser actually used.
 *
 * In the production (standalone) build, `request.url` carries the server's
 * own bind address (0.0.0.0 or 127.0.0.1), not the public host, so
 * `new URL(path, request.url)` sends people to an address they can't reach.
 * Found on staging, which runs the same image as Railway (2026-09-26).
 *
 * Uses X-Forwarded-Host/Proto when a proxy set them (Railway, Cloudflare),
 * otherwise Host. Edge-safe: used by middleware.
 */
const HOST_RE = /^[a-z0-9.-]+(:\d{1,5})?$/i;

export function publicUrl(path: string, request: Request): URL {
  const headers = request.headers;
  const first = (v: string | null) => v?.split(",")[0]?.trim() || null;
  const host = first(headers.get("x-forwarded-host")) ?? first(headers.get("host"));
  const proto = first(headers.get("x-forwarded-proto")) ?? new URL(request.url).protocol.replace(":", "");
  if (host && HOST_RE.test(host) && (proto === "http" || proto === "https")) {
    return new URL(path, `${proto}://${host}`);
  }
  return new URL(path, request.url);
}
