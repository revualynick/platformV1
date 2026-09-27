import { STEP_IDS } from "./constants.js";
import { tenantOrigin } from "./env-vars.js";
import { firstIncompleteStep, type TenantState } from "./state.js";

export interface TenantSummary {
  subdomain: string;
  name: string;
  chatPlatform: string;
  region: string;
  progress: string;
  next: string;
  projectId: string;
}

export function summarise(state: TenantState): TenantSummary {
  const done = STEP_IDS.filter((s) => state.completedSteps[s]).length;
  return {
    subdomain: state.input.subdomain,
    name: state.input.name,
    chatPlatform: state.input.chatPlatform,
    region: state.input.region,
    progress: `${done}/${STEP_IDS.length}`,
    next: firstIncompleteStep(state) ?? "ready",
    projectId: state.railway.projectId ?? "-",
  };
}

export function formatTable(rows: Record<string, string>[]): string[] {
  if (rows.length === 0) return [];
  const cols = Object.keys(rows[0]);
  const width = cols.map((c) => Math.max(c.length, ...rows.map((r) => r[c].length)));
  const line = (r: Record<string, string>) => cols.map((c, i) => r[c].padEnd(width[i])).join("  ").trimEnd();
  return [line(Object.fromEntries(cols.map((c) => [c, c]))), width.map((w) => "-".repeat(w)).join("  "), ...rows.map(line)];
}

/**
 * Order for a fleet-wide migration: only tenants whose database has been
 * migrated at least once (so a project and database exist); the canary
 * first, then alphabetical. A failure stops the rollout, so a bad migration
 * hits one tenant, not all of them.
 */
export function planMigrationOrder(
  states: TenantState[],
  opts: { canary?: string; only?: string[] } = {},
): { order: TenantState[]; skipped: { subdomain: string; reason: string }[] } {
  const skipped: { subdomain: string; reason: string }[] = [];
  const eligible: TenantState[] = [];
  for (const s of states) {
    const sub = s.input.subdomain;
    if (opts.only && !opts.only.includes(sub)) continue;
    if (!s.completedSteps.migrate || !s.railway.projectId) {
      skipped.push({ subdomain: sub, reason: `not provisioned past migrate (next step: ${firstIncompleteStep(s)})` });
      continue;
    }
    eligible.push(s);
  }
  if (opts.only) {
    for (const sub of opts.only) {
      if (!states.some((s) => s.input.subdomain === sub)) skipped.push({ subdomain: sub, reason: "no state file" });
    }
  }
  eligible.sort((a, b) => a.input.subdomain.localeCompare(b.input.subdomain));
  if (opts.canary) {
    const i = eligible.findIndex((s) => s.input.subdomain === opts.canary);
    if (i < 0) throw new Error(`Canary ${opts.canary} is not an eligible tenant`);
    eligible.unshift(...eligible.splice(i, 1));
  }
  return { order: eligible, skipped };
}

/** The tenant's ops checks (C3 step 8), read through the web app with the fleet-wide OPS_TOKEN. */
export function opsStatusUrl(state: TenantState): string {
  return `${tenantOrigin(state.input.subdomain)}/api/ops/status`;
}

/** One table row per check that isn't ok, or a single ok row. */
export function opsRows(tenant: string, status: number, body: string): Record<string, string>[] {
  let parsed: { status?: string; checks?: Array<{ name: string; status: string; detail: string }> };
  try {
    parsed = JSON.parse(body);
  } catch {
    return [{ tenant, check: "ops status", result: `FAIL (${status}, not JSON)` }];
  }
  if (status === 404) return [{ tenant, check: "ops status", result: "not enabled (OPS_TOKEN not set on web)" }];
  if (status === 401) return [{ tenant, check: "ops status", result: "FAIL (ops token rejected)" }];
  const bad = (parsed.checks ?? []).filter((c) => c.status !== "ok");
  if (!bad.length && parsed.status === "ok") return [{ tenant, check: "ops status", result: "ok" }];
  return bad.map((c) => ({ tenant, check: `ops ${c.name}`, result: `${c.status.toUpperCase()}: ${c.detail}` }));
}

export function healthUrls(state: TenantState): { label: string; url: string; expect: number }[] {
  const urls: { label: string; url: string; expect: number }[] = [];
  if (state.dns.apiDomain) urls.push({ label: "api /health", url: `https://${state.dns.apiDomain}/health`, expect: 200 });
  urls.push({ label: "web /login", url: `${tenantOrigin(state.input.subdomain)}/login`, expect: 200 });
  return urls;
}
