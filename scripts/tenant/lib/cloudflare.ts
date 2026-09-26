import type { DnsRecord } from "./state.js";

/** Railway gives hosts relative to the zone ("acme", "_railway-verify.acme") or "@". */
export function toFqdn(host: string, zone: string): string {
  const h = host.replace(/\.$/, "").toLowerCase();
  if (h === "@" || h === zone) return zone;
  return h.endsWith(`.${zone}`) ? h : `${h}.${zone}`;
}

export interface ExistingRecord {
  id: string;
  type: string;
  name: string;
  content: string;
}

export type RecordDecision = { action: "create" } | { action: "exists" } | { action: "conflict"; existing: ExistingRecord };

/**
 * Idempotent record handling: an identical record is left alone, a missing
 * one is created, and a different record at the same name is never
 * overwritten (it might belong to something else).
 */
export function decideRecord(desired: DnsRecord, fqdn: string, existing: ExistingRecord[]): RecordDecision {
  const sameName = existing.filter((r) => r.name.toLowerCase() === fqdn);
  const norm = (v: string) => v.replace(/\.$/, "").replace(/^"|"$/g, "").toLowerCase();
  if (sameName.some((r) => r.type === desired.type && norm(r.content) === norm(desired.value))) return { action: "exists" };
  // CNAME cannot coexist with any other record at the same name.
  const clash = sameName.find((r) => r.type === desired.type || r.type === "CNAME" || desired.type === "CNAME");
  if (clash) return { action: "conflict", existing: clash };
  return { action: "create" };
}

export function recordBody(desired: DnsRecord, fqdn: string, subdomain: string) {
  return {
    type: desired.type,
    name: fqdn,
    content: desired.value,
    ttl: 1,
    // Unproxied, so Railway can issue and renew its own certificate.
    proxied: false,
    comment: `revualy tenant ${subdomain}`,
  };
}

export function parseCloudflare<T>(body: string): T {
  const parsed = JSON.parse(body) as { success?: boolean; result?: T; errors?: { message: string }[] };
  if (!parsed.success) {
    throw new Error(`Cloudflare API error: ${(parsed.errors ?? []).map((e) => e.message).join("; ") || "unknown"}`);
  }
  return parsed.result as T;
}
