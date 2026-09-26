import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STEP_IDS } from "../lib/constants.js";
import { SecretStore, makeSaver, tenantPaths, type StepContext } from "../lib/context.js";
import { decideRecord, toFqdn } from "../lib/cloudflare.js";
import { buildServiceVariables } from "../lib/env-vars.js";
import { DryRunExecutor, formatAction, type Action, type CliAction, type HttpAction } from "../lib/executor.js";
import { planMigrationOrder } from "../lib/fleet.js";
import { mergeWithRecordedInput, parseProvisionArgs, validateTenantInput, type TenantInput } from "../lib/inputs.js";
import { findServiceIds, parseCustomDomain, parseRailwayStatus, regionPatch } from "../lib/railway.js";
import {
  encryptionKeyFingerprint,
  generateTenantSecrets,
  readSecretsFile,
  redact,
  validateSecrets,
  writeSecretsFile,
} from "../lib/secrets.js";
import { assertNoSecrets, loadState, newState, saveState, selectSteps, type TenantState } from "../lib/state.js";
import { runSteps } from "../lib/steps.js";

const INPUT: TenantInput = {
  name: "Acme Corp",
  subdomain: "acme",
  adminEmail: "ops@acme.com",
  chatPlatform: "google_chat",
  region: "europe-west4-drams3a",
  template: "revualy-stack",
};

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "revualy-tenant-test-"));
  // Any accidental network call fails the test.
  vi.stubGlobal("fetch", () => {
    throw new Error("network access in a unit test");
  });
});
afterEach(() => vi.unstubAllGlobals());

// ── Input validation ─────────────────────────────────────

describe("input validation", () => {
  it("accepts a complete, valid input", () => {
    expect(validateTenantInput(INPUT)).toEqual({ ok: true, value: INPUT });
  });

  it("reports every problem at once", () => {
    const result = validateTenantInput({ subdomain: "Bad_Sub", adminEmail: "nope", chatPlatform: "irc" as never, region: "mars" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual(
      expect.arrayContaining([
        "--name is required",
        expect.stringContaining("--subdomain must be a DNS label"),
        "--admin-email is not a valid email address",
        expect.stringContaining("--chat-platform must be one of"),
        expect.stringContaining("--region must be one of"),
      ]),
    );
  });

  it("rejects reserved and malformed subdomains", () => {
    for (const sub of ["www", "api", "demo", "-acme", "acme-", "a".repeat(64), "ac.me"]) {
      expect(validateTenantInput({ ...INPUT, subdomain: sub }).ok, sub).toBe(false);
    }
    expect(validateTenantInput({ ...INPUT, subdomain: "acme-uk2" }).ok).toBe(true);
  });

  it("parses flags, lowercases identifiers and drops a forwarded --", () => {
    const opts = parseProvisionArgs(["--", "--subdomain", "ACME", "--admin-email", "Ops@Acme.com", "--apply", "--from-step", "dns"]);
    expect(opts.input).toEqual({ subdomain: "acme", adminEmail: "ops@acme.com" });
    expect(opts).toMatchObject({ apply: true, fromStep: "dns", keyBackedUp: false });
  });

  it("rejects an unknown step and unknown flags", () => {
    expect(() => parseProvisionArgs(["--from-step", "deploy"])).toThrow(/--from-step must be one of/);
    expect(() => parseProvisionArgs(["--force"])).toThrow();
  });

  it("refuses to change a tenant's identity once recorded", () => {
    const { merged, conflicts } = mergeWithRecordedInput({ subdomain: "acme" }, INPUT);
    expect(conflicts).toEqual([]);
    expect(merged).toEqual(INPUT);
    expect(mergeWithRecordedInput({ subdomain: "acme", region: "us-west2" }, INPUT).conflicts).toHaveLength(1);
  });
});

// ── Step ordering and --from-step ────────────────────────

describe("step selection", () => {
  const withDone = (n: number): TenantState => {
    const s = newState(INPUT, new Date(0));
    for (const step of STEP_IDS.slice(0, n)) s.completedSteps[step] = "2026-01-01T00:00:00.000Z";
    return s;
  };

  it("runs everything, in order, for a new tenant", () => {
    expect(selectSteps(undefined, undefined, "apply").steps).toEqual([...STEP_IDS]);
    expect(STEP_IDS).toEqual(["railway-project", "secrets", "env-vars", "dns", "oauth", "migrate", "seed", "readiness"]);
  });

  it("resumes at the first incomplete step", () => {
    expect(selectSteps(withDone(3), undefined, "apply").steps[0]).toBe("dns");
    expect(selectSteps(withDone(8), undefined, "apply").steps).toEqual([]);
  });

  it("--from-step re-runs a completed step and everything after it", () => {
    expect(selectSteps(withDone(8), "migrate", "apply").steps).toEqual(["migrate", "seed", "readiness"]);
  });

  it("--from-step refuses to skip incomplete earlier steps when applying, warns in a dry run", () => {
    expect(() => selectSteps(withDone(1), "dns", "apply")).toThrow(/secrets, env-vars/);
    const dry = selectSteps(withDone(1), "dns", "dry-run");
    expect(dry.steps[0]).toBe("dns");
    expect(dry.warnings).toHaveLength(1);
  });
});

// ── State file ───────────────────────────────────────────

describe("state file", () => {
  it("round-trips and is written atomically", () => {
    const state = newState(INPUT, new Date(0));
    state.railway.projectId = "3f0e2a52-1b7c-4c1e-9a55-0d6f6a8b9c10";
    state.completedSteps["railway-project"] = "2026-01-01T00:00:00.000Z";
    saveState(dir, state, [], new Date(1000));
    const loaded = loadState(dir, "acme");
    expect(loaded?.railway.projectId).toBe(state.railway.projectId);
    expect(loaded?.updatedAt).toBe(new Date(1000).toISOString());
    expect(loadState(dir, "other")).toBeUndefined();
  });

  it("refuses to write a known secret or anything shaped like key material", () => {
    const secrets = generateTenantSecrets();
    expect(() => assertNoSecrets(JSON.stringify({ x: secrets.NEXTAUTH_SECRET }), [secrets.NEXTAUTH_SECRET])).toThrow();
    expect(() => assertNoSecrets(JSON.stringify({ x: secrets.ENCRYPTION_KEYS }), [])).toThrow(/key material/);
    expect(() => assertNoSecrets(JSON.stringify({ fp: encryptionKeyFingerprint(secrets.ENCRYPTION_KEYS).fingerprint }), [])).not.toThrow();

    const state = newState(INPUT, new Date(0));
    (state as unknown as Record<string, string>).leak = secrets.WS_TOKEN_SECRET;
    expect(() => saveState(dir, state, Object.values(secrets), new Date())).toThrow(/secret/);
    expect(loadState(dir, "acme")).toBeUndefined();
  });

  it("rejects files that are not version 1 state", () => {
    writeFileSync(join(dir, "acme.json"), JSON.stringify({ version: 2 }));
    expect(() => loadState(dir, "acme")).toThrow(/version 1/);
  });
});

// ── Secrets ──────────────────────────────────────────────

describe("secret generation", () => {
  it("produces the formats the apps expect", () => {
    const s = generateTenantSecrets();
    expect(s.ENCRYPTION_KEYS).toMatch(/^k1:[0-9a-f]{64}$/);
    expect(s.NEXTAUTH_SECRET).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(s.INTERNAL_API_SECRET).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(s.WS_TOKEN_SECRET).toMatch(/^[0-9a-f]{64}$/);
    expect(validateSecrets(s)).toEqual([]);
  });

  it("is fresh every time", () => {
    const a = generateTenantSecrets();
    const b = generateTenantSecrets();
    for (const k of Object.keys(a) as (keyof typeof a)[]) expect(a[k]).not.toBe(b[k]);
  });

  it("is accepted by the application keyring", async () => {
    const s = generateTenantSecrets();
    const crypto = await import("@revualy/shared/server");
    const before = process.env.ENCRYPTION_KEYS;
    process.env.ENCRYPTION_KEYS = s.ENCRYPTION_KEYS;
    crypto.resetKeyringForTests();
    try {
      const stored = crypto.encryptField("hello", "t.c");
      expect(stored.startsWith("enc:v1:k1:")).toBe(true);
      expect(crypto.decryptField(stored, "t.c")).toBe("hello");
    } finally {
      if (before === undefined) delete process.env.ENCRYPTION_KEYS;
      else process.env.ENCRYPTION_KEYS = before;
      crypto.resetKeyringForTests();
    }
  });

  it("fingerprints identify a key without revealing it", () => {
    const hex = "ab".repeat(32);
    const fp = encryptionKeyFingerprint(`k1:${hex}`);
    expect(fp).toEqual({ id: "k1", fingerprint: expect.stringMatching(/^sha256:[0-9a-f]{16}$/) });
    expect(encryptionKeyFingerprint(hex)).toEqual(fp);
    expect(encryptionKeyFingerprint(`k2:${"cd".repeat(32)},k1:${hex}`).id).toBe("k2");
    expect(fp.fingerprint).not.toContain(hex.slice(0, 16));
    expect(() => encryptionKeyFingerprint("nonsense")).toThrow();
  });

  it("writes the secrets file with mode 600 and never overwrites it", () => {
    const path = join(dir, "t", "secrets.json");
    const s = generateTenantSecrets();
    writeSecretsFile(path, s);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(readSecretsFile(path)).toEqual(s);
    expect(() => writeSecretsFile(path, generateTenantSecrets())).toThrow(/overwrite/);
    expect(readSecretsFile(path)).toEqual(s);
  });

  it("redacts known secrets and URL credentials", () => {
    const text = "key=k1:abc12345 url=postgresql://postgres:hunter22@roundhouse.proxy.rlwy.net:5432/railway";
    expect(redact(text, { ENCRYPTION_KEYS: "k1:abc12345" })).toBe(
      "key=<secret:ENCRYPTION_KEYS> url=postgresql://<redacted>@roundhouse.proxy.rlwy.net:5432/railway",
    );
  });
});

// ── Parsers and pure helpers ─────────────────────────────

describe("railway and cloudflare helpers", () => {
  it("parses both documented shapes of railway status", () => {
    const edgesShape = JSON.stringify({
      id: "p1",
      environments: { edges: [{ node: { id: "e0", name: "staging" } }, { node: { id: "e1", name: "production" } }] },
      services: { edges: [{ node: { id: "s1", name: "api" } }, { node: { id: "s2", name: "web" } }] },
    });
    expect(parseRailwayStatus(edgesShape)).toEqual({ projectId: "p1", environmentId: "e1", services: [{ id: "s1", name: "api" }, { id: "s2", name: "web" }] });
    const nested = JSON.stringify({ project: { id: "p1", services: [{ id: "s1", name: "Postgres" }] }, environment: { id: "e9" } });
    const status = parseRailwayStatus(nested);
    expect(status.environmentId).toBe("e9");
    expect(findServiceIds(status)).toEqual({ found: { postgres: "s1" }, missing: ["api", "web", "redis"] });
    expect(() => parseRailwayStatus("{}")).toThrow();
  });

  it("parses the custom domain DNS records", () => {
    const out = JSON.stringify({ domain: "acme.revualy.com", dnsRecords: [{ type: "cname", host: "acme", value: "x.up.railway.app" }] });
    expect(parseCustomDomain(out)).toEqual([{ type: "CNAME", host: "acme", value: "x.up.railway.app" }]);
    expect(() => parseCustomDomain("{}")).toThrow();
  });

  it("pins exactly one region and nulls the rest", () => {
    const patch = regionPatch({ api: "a", web: "w" }, "us-west2") as { services: Record<string, { deploy: { multiRegionConfig: Record<string, unknown>; healthcheckPath?: string } }> };
    expect(patch.services.a.deploy.multiRegionConfig).toEqual({
      "us-west2": { numReplicas: 1 },
      "europe-west4-drams3a": null,
      "us-east4-eqdc4a": null,
      "asia-southeast1-eqsg3a": null,
    });
    expect(patch.services.a.deploy.healthcheckPath).toBe("/health");
    expect(patch.services.w.deploy.healthcheckPath).toBeUndefined();
  });

  it("DNS: creates missing records, skips identical ones, never overwrites", () => {
    const want = { type: "CNAME", host: "acme", value: "x.up.railway.app" };
    const fqdn = toFqdn("acme", "revualy.com");
    expect(fqdn).toBe("acme.revualy.com");
    expect(toFqdn("@", "revualy.com")).toBe("revualy.com");
    expect(decideRecord(want, fqdn, [])).toEqual({ action: "create" });
    expect(decideRecord(want, fqdn, [{ id: "1", type: "CNAME", name: fqdn, content: "x.up.railway.app." }])).toEqual({ action: "exists" });
    expect(decideRecord(want, fqdn, [{ id: "1", type: "A", name: fqdn, content: "1.2.3.4" }]).action).toBe("conflict");
  });
});

describe("service variables", () => {
  it("splits variables by service and never copies chat credentials from the shell", () => {
    const secrets = generateTenantSecrets();
    const vars = buildServiceVariables({
      input: INPUT,
      orgId: "org-1",
      secrets,
      operatorEnv: { GOOGLE_CLIENT_ID: "cid", ANTHROPIC_API_KEY: "sk-ant-xxxxxxxx", GCHAT_PROJECT_ID: "other-tenant" },
    });
    expect(vars.api.ENCRYPTION_KEYS).toBe(secrets.ENCRYPTION_KEYS);
    expect(vars.web.ENCRYPTION_KEYS).toBe(secrets.ENCRYPTION_KEYS);
    expect(vars.web.AUTH_SECRET).toBe(secrets.NEXTAUTH_SECRET);
    expect(vars.web.ANTHROPIC_API_KEY).toBeUndefined();
    expect(vars.api.ANTHROPIC_API_KEY).toBe("sk-ant-xxxxxxxx");
    expect(vars.api.GCHAT_PROJECT_ID).toBeUndefined();
    expect(vars.followUps.map((f) => f.name)).toContain("GCHAT_PROJECT_ID");
    expect(vars.api.TEST_LOGIN_ENABLED).toBe("false");
    expect(vars.api.NEXTAUTH_URL).toBe("https://acme.revualy.com");
  });

  it("leaves generated secrets alone when the local file is gone", () => {
    const vars = buildServiceVariables({ input: INPUT, orgId: "org-1", secrets: null, operatorEnv: {} });
    expect(vars.api.ENCRYPTION_KEYS).toBeUndefined();
    expect(vars.web.NEXTAUTH_SECRET).toBeUndefined();
  });
});

describe("fleet migration order", () => {
  const tenant = (sub: string, migrated: boolean): TenantState => {
    const s = newState({ ...INPUT, subdomain: sub }, new Date(0));
    s.railway.projectId = `p-${sub}`;
    if (migrated) s.completedSteps.migrate = "2026-01-01T00:00:00.000Z";
    return s;
  };

  it("puts the canary first, then alphabetical, and skips unprovisioned tenants", () => {
    const { order, skipped } = planMigrationOrder([tenant("zeta", true), tenant("beta", true), tenant("new", false), tenant("demo2", true)], { canary: "zeta" });
    expect(order.map((s) => s.input.subdomain)).toEqual(["zeta", "beta", "demo2"]);
    expect(skipped.map((s) => s.subdomain)).toEqual(["new"]);
  });

  it("honours --only and reports unknown tenants", () => {
    const { order, skipped } = planMigrationOrder([tenant("a", true), tenant("b", true)], { only: ["b", "ghost"] });
    expect(order.map((s) => s.input.subdomain)).toEqual(["b"]);
    expect(skipped).toEqual([{ subdomain: "ghost", reason: "no state file" }]);
  });
});

// ── Full dry run ─────────────────────────────────────────

function dryContext(state?: TenantState, flags = { keyBackedUp: false, oauthConfigured: false }) {
  const paths = tenantPaths("acme", { REVUALY_TENANT_STATE_DIR: join(dir, "state"), REVUALY_TENANT_HOME: join(dir, "home") });
  const secrets = new SecretStore(paths.secretsFile, false);
  const lines: string[] = [];
  const exec = new DryRunExecutor(() => secrets.forRedaction(), (l) => lines.push(l));
  const st = state ?? newState(INPUT, new Date(0));
  const now = () => new Date(0);
  const ctx: StepContext = {
    input: INPUT,
    state: st,
    paths,
    flags,
    exec,
    operatorEnv: {},
    now,
    isTTY: false,
    secrets,
    save: makeSaver(false, paths.stateDir, st, secrets, now),
  };
  return { ctx, exec, lines, paths };
}

const cmd = (a: Action) => (a.kind === "cli" ? (a as CliAction).argv.join(" ") : a.kind === "http" ? `${(a as HttpAction).method} ${(a as HttpAction).url}` : a.kind);

describe("dry run", () => {
  it("prints the full command list in step order and writes nothing", async () => {
    const { ctx, exec, lines, paths } = dryContext();
    const result = await runSteps(ctx, [...STEP_IDS]);

    expect(result).toEqual({ status: "waiting", step: "secrets", reason: expect.any(String) });
    const commands = exec.actions.map(cmd);
    const at = (needle: string) => commands.findIndex((c) => c.includes(needle));

    expect(commands[0]).toBe("local");
    expect(commands).toContain("railway list --json");
    expect(commands).toContain("railway init -n revualy-acme");
    expect(commands.filter((c) => c === `POST https://backboard.railway.com/graphql/v2`)).toHaveLength(3);
    expect(commands).toContain("railway variables --service api --json");
    expect(commands).toContain("railway domain acme.revualy.com --service web --json");
    expect(commands).toContain("POST https://api.cloudflare.com/client/v4/zones/<zone-id>/dns_records");
    expect(commands.some((c) => c.includes("--filter=@revualy/db migrate"))).toBe(true);
    expect(commands.some((c) => c.includes("seed:defaults"))).toBe(true);
    expect(commands.some((c) => /seed(?!:defaults)/.test(c.replace("seed:defaults", "")))).toBe(false);
    expect(commands).toContain("GET https://acme.revualy.com/api/test-login");

    // Order: project < variables < domain < migrate < seed < readiness
    const order = ["railway init", "railway variables", "railway domain acme", "db migrate", "seed:defaults", "/api/auth/providers", "encryption-check.ts"];
    const positions = order.map(at);
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);

    // Every railway command runs in the tenant's own link directory.
    for (const a of exec.actions) if (a.kind === "cli") expect((a as CliAction).cwd).toBe(paths.linkDir);

    // Secrets go over stdin, never argv, and are placeholders in a dry run.
    const envEdit = exec.actions.find((a) => a.kind === "cli" && (a as CliAction).stdin?.includes("ENCRYPTION_KEYS")) as CliAction;
    expect(envEdit.argv.join(" ")).not.toMatch(/SECRET|ENCRYPTION/);
    expect(envEdit.stdin).toContain("<generated:ENCRYPTION_KEYS>");

    // Manual steps: key backup, OAuth.
    const text = lines.join("\n");
    expect(text).toContain("--reveal-key");
    expect(text).toContain("https://acme.revualy.com/api/auth/callback/google");
    expect(text).not.toMatch(/[0-9a-f]{64}/);

    // Nothing touched the disk.
    expect(() => statSync(join(dir, "state"))).toThrow();
    expect(() => statSync(join(dir, "home"))).toThrow();
  });

  it("resumes from a recorded state without recreating the project", async () => {
    const state = newState(INPUT, new Date(0));
    state.railway = { projectId: "p1", environmentId: "e1", services: { api: "sa", web: "sw", postgres: "sp", redis: "sr" } };
    state.encryptionKey = { id: "k1", fingerprint: "sha256:0123456789abcdef" };
    state.orgId = "org-1";
    state.keyRevealedAt = state.keyBackedUpAt = "2026-01-01T00:00:00.000Z";
    for (const s of ["railway-project", "secrets", "env-vars"] as const) state.completedSteps[s] = "2026-01-01T00:00:00.000Z";
    state.dns = { webRecords: [{ type: "CNAME", host: "acme", value: "t.up.railway.app" }], apiDomain: "api-acme.up.railway.app" };

    const { ctx, exec } = dryContext(state, { keyBackedUp: false, oauthConfigured: true });
    const { steps } = selectSteps(state, undefined, "dry-run");
    expect(steps[0]).toBe("dns");
    const result = await runSteps(ctx, steps);
    expect(result).toEqual({ status: "complete" });
    const commands = exec.actions.map(cmd);
    expect(commands.some((c) => c.includes("railway init"))).toBe(false);
    expect(commands.some((c) => c.includes("railway domain"))).toBe(false);
    expect(commands).toContain("GET https://api-acme.up.railway.app/health");
    const check = exec.actions.find((a) => a.kind === "cli" && (a as CliAction).argv.includes("encryption-check.ts")) as CliAction;
    expect(check.argv).toContain("sha256:0123456789abcdef");
  });

  it("redacts real secrets in printed actions", () => {
    const s = generateTenantSecrets();
    const lines = formatAction({ kind: "cli", purpose: "x", argv: ["railway", "environment", "edit"], stdin: JSON.stringify(s) }, s);
    const text = lines.join("\n");
    for (const v of Object.values(s)) expect(text).not.toContain(v);
    expect(text).toContain("<secret:ENCRYPTION_KEYS>");
  });
});

it("the state dir is gitignored", () => {
  const gitignore = readFileSync(join(__dirname, "..", "..", "..", ".gitignore"), "utf8");
  expect(gitignore).toMatch(/^scripts\/tenant\/state\/$/m);
});
