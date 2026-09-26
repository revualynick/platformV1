import crypto from "node:crypto";
import { mkdirSync } from "node:fs";
import { CLOUDFLARE_API_URL, RAILWAY_GRAPHQL_URL, REGIONS, ROOT_DOMAIN, SERVICES, STEP_TITLES, type StepId } from "./constants.js";
import { decideRecord, parseCloudflare, recordBody, toFqdn, type ExistingRecord } from "./cloudflare.js";
import type { StepContext, TenantPaths } from "./context.js";
import { buildServiceVariables, secretValuesIn, tenantOrigin } from "./env-vars.js";
import type { CliAction, HttpResult } from "./executor.js";
import {
  TEMPLATE_DEPLOY_MUTATION,
  TEMPLATE_QUERY,
  WORKSPACE_QUERY,
  findServiceIds,
  graphqlData,
  parseCustomDomain,
  parseGeneratedDomain,
  parseRailwayStatus,
  projectExists,
  regionPatch,
  variablesPatch,
} from "./railway.js";
import { deleteSecretsFile, encryptionKeyFingerprint, generateTenantSecrets, writeSecretsFile } from "./secrets.js";
import { markStepComplete, type TenantState } from "./state.js";

export type StepOutcome = { status: "done" } | { status: "waiting"; reason: string };
export type StepFn = (ctx: StepContext) => Promise<StepOutcome>;

const DONE: StepOutcome = { status: "done" };

// ── Shared command builders (also used by fleet.ts) ─────

export function projectName(subdomain: string): string {
  return `revualy-${subdomain}`;
}

function railway(paths: TenantPaths, purpose: string, args: string[], extra: Partial<Omit<CliAction, "kind" | "argv">> = {}): Omit<CliAction, "kind"> {
  return { purpose, argv: ["railway", ...args], cwd: paths.linkDir, ...extra };
}

/**
 * `railway run` executes locally with the service's variables injected. The
 * Postgres service's DATABASE_URL is a private *.railway.internal address,
 * so database work uses its DATABASE_PUBLIC_URL (expanded inside the child
 * shell, never printed).
 */
function withPublicDb(paths: TenantPaths, purpose: string, command: string, env?: Record<string, string>): Omit<CliAction, "kind"> {
  return railway(paths, purpose, ["run", "--service", SERVICES.postgres, "--", "sh", "-c", `DATABASE_URL="$DATABASE_PUBLIC_URL" exec ${command}`], { env });
}

export function migrateAction(paths: TenantPaths): Omit<CliAction, "kind"> {
  return withPublicDb(paths, "Apply pending Drizzle migrations to the tenant database", `pnpm --dir ${paths.repoRoot} --filter=@revualy/db migrate`);
}

export function seedAction(paths: TenantPaths, state: TenantState): Omit<CliAction, "kind"> {
  const { input } = state;
  const env: Record<string, string> = {
    SEED_ORG_NAME: input.name,
    SEED_SUBDOMAIN: input.subdomain,
    SEED_ADMIN_EMAIL: input.adminEmail,
  };
  if (input.adminName) env.SEED_ADMIN_NAME = input.adminName;
  return withPublicDb(
    paths,
    "Seed tenant defaults (non-destructive: packages/db/src/seed-defaults.ts, never seed.ts)",
    `pnpm --dir ${paths.repoRoot} --filter=@revualy/db seed:defaults`,
    env,
  );
}

export function encryptionCheckAction(paths: TenantPaths, service: "api" | "web", fingerprint: string): Omit<CliAction, "kind"> {
  return railway(
    paths,
    `Encryption round trip with the ${service} service's configured key (prints the fingerprint only)`,
    ["run", "--service", SERVICES[service], "--", "pnpm", "--dir", `${paths.repoRoot}/scripts/tenant`, "exec", "tsx", "encryption-check.ts", "--expect", fingerprint],
  );
}

export function statusAction(paths: TenantPaths, state: TenantState, withServices: boolean, purpose = "Read project, environment and service ids"): Omit<CliAction, "kind"> {
  return railway(paths, purpose, ["status", "--json"], { dryResult: dryStatus(state, withServices) });
}

function dryStatus(state: TenantState, withServices: boolean): string {
  const ids = state.railway.services;
  const service = (key: keyof typeof SERVICES) => ({ node: { id: ids[key] ?? `<${key}-service-id>`, name: SERVICES[key] } });
  return JSON.stringify({
    id: state.railway.projectId ?? "<project-id>",
    name: projectName(state.input.subdomain),
    environments: { edges: [{ node: { id: state.railway.environmentId ?? "<environment-id>", name: "production" } }] },
    services: { edges: withServices ? (Object.keys(SERVICES) as (keyof typeof SERVICES)[]).map(service) : [] },
  });
}

/** Guard against acting on the wrong tenant: the link directory must point at this tenant's project. */
async function assertLinkedProject(ctx: StepContext): Promise<void> {
  const { projectId } = ctx.state.railway;
  if (!projectId && ctx.exec.live) throw new Error("No Railway project recorded for this tenant: run the railway-project step first");
  const status = parseRailwayStatus(await ctx.exec.cli(statusAction(ctx.paths, ctx.state, true, "Confirm the link directory points at this tenant's project")));
  if (projectId && status.projectId !== projectId) {
    throw new Error(`Link directory ${ctx.paths.linkDir} points at project ${status.projectId}, state file says ${projectId}. Stopping.`);
  }
}

// ── 1. Railway project ───────────────────────────────────

const railwayProject: StepFn = async (ctx) => {
  const { exec, state, input, paths } = ctx;
  const name = projectName(input.subdomain);

  await exec.local({
    purpose: `Create the Railway link directory ${paths.linkDir} (mode 700)`,
    run: () => void mkdirSync(paths.linkDir, { recursive: true, mode: 0o700 }),
  });

  if (!state.railway.projectId) {
    const list = await exec.cli(railway(paths, `Check that no Railway project called ${name} exists yet`, ["list", "--json"], { dryResult: "[]" }));
    if (projectExists(list, name)) {
      throw new Error(`A Railway project called ${name} already exists but is not in this tenant's state file. Check it by hand before continuing.`);
    }
    await exec.cli(railway(paths, `Create the Railway project ${name} and link the directory to it`, ["init", "-n", name, ...(input.workspace ? ["-w", input.workspace] : [])]));
  }

  let status = parseRailwayStatus(await exec.cli(statusAction(paths, state, Object.keys(state.railway.services).length > 0)));
  if (state.railway.projectId && state.railway.projectId !== status.projectId) {
    throw new Error(`Link directory points at project ${status.projectId}, state file says ${state.railway.projectId}. Stopping.`);
  }
  state.railway.projectId = status.projectId;
  state.railway.environmentId = status.environmentId;
  ctx.save();

  let { found, missing } = findServiceIds(status);
  if (missing.length > 0) {
    if (missing.length < 4) {
      throw new Error(`Project has some but not all Revualy services (missing: ${missing.join(", ")}). Fix by hand; a second template deploy would duplicate services.`);
    }
    if (!input.template && exec.live) {
      throw new Error("No Railway template code: pass --template <code> (or set REVUALY_RAILWAY_TEMPLATE)");
    }
    if (!input.template) exec.log("  (dry run: no --template given; a live run needs one)");
    const code = input.template ?? "<template-code>";
    const tpl = graphqlData<{ template: { id: string; serializedConfig: unknown } }>(
      (await exec.http({
        purpose: `Fetch the Railway template "${code}" (api, web, Postgres, Redis)`,
        method: "POST",
        url: RAILWAY_GRAPHQL_URL,
        auth: "railway",
        body: { query: TEMPLATE_QUERY, variables: { code } },
        dryResult: ok({ data: { template: { id: "<template-id>", serializedConfig: "<serializedConfig>" } } }),
      })).body,
    ).template;
    const ws = graphqlData<{ project: { workspaceId: string } }>(
      (await exec.http({
        purpose: "Look up the project's workspace id",
        method: "POST",
        url: RAILWAY_GRAPHQL_URL,
        auth: "railway",
        body: { query: WORKSPACE_QUERY, variables: { id: status.projectId } },
        dryResult: ok({ data: { project: { workspaceId: "<workspace-id>" } } }),
      })).body,
    ).project;
    graphqlData(
      (await exec.http({
        purpose: "Deploy the template into the tenant project",
        method: "POST",
        url: RAILWAY_GRAPHQL_URL,
        auth: "railway",
        body: {
          query: TEMPLATE_DEPLOY_MUTATION,
          variables: {
            input: {
              templateId: tpl.id,
              serializedConfig: tpl.serializedConfig,
              projectId: status.projectId,
              environmentId: status.environmentId,
              workspaceId: ws.workspaceId,
            },
          },
        },
        dryResult: ok({ data: { templateDeployV2: { projectId: status.projectId, workflowId: "<workflow-id>" } } }),
      })).body,
    );
    status = parseRailwayStatus(await exec.cli(statusAction(paths, state, true, "Re-read services after the template deploy")));
    ({ found, missing } = findServiceIds(status));
    if (missing.length > 0) {
      return { status: "waiting", reason: `Template deploy still creating services (${missing.join(", ")} not visible yet). Re-run this step in a minute.` };
    }
  }
  state.railway.services = found;
  ctx.save();

  await exec.cli(
    railway(paths, `Pin all four services to ${input.region} (${REGIONS[input.region]}) and set the api health check`, ["environment", "edit", "-m", "revualy: region and health check", "--json"], {
      stdin: JSON.stringify(regionPatch(found, input.region), null, 2),
      sensitiveOutput: true,
    }),
  );
  return DONE;
};

// ── 2. Secrets + key backup gate ─────────────────────────

const secretsStep: StepFn = async (ctx) => {
  const { exec, state, paths, secrets } = ctx;

  if (!secrets.hasReal()) {
    if (state.encryptionKey) {
      if (state.completedSteps["env-vars"]) {
        exec.log("  Secrets were already written to Railway and the local file purged. Nothing to do.");
        return DONE;
      }
      throw new Error(
        `Secrets were generated (key ${state.encryptionKey.fingerprint}) but ${paths.secretsFile} is missing. ` +
          "Restore it from the password manager, or, only if nothing has been written to Railway, " +
          "delete encryptionKey/keyRevealedAt/keyBackedUpAt and completedSteps.secrets from the state file and re-run.",
      );
    }
    await exec.local({
      purpose: `Generate ENCRYPTION_KEYS (k1, 32 random bytes), NEXTAUTH_SECRET, INTERNAL_API_SECRET, WS_TOKEN_SECRET and ORG_ID; write the secrets to ${paths.secretsFile} (mode 600, outside the repo)`,
      run: () => {
        const generated = generateTenantSecrets();
        writeSecretsFile(paths.secretsFile, generated);
        secrets.set(generated);
      },
    });
  }

  const onFile = secrets.hasReal() ? encryptionKeyFingerprint(secrets.get()!.ENCRYPTION_KEYS) : { id: "k1", fingerprint: "<fingerprint>" };
  if (state.encryptionKey && secrets.hasReal() && state.encryptionKey.fingerprint !== onFile.fingerprint) {
    throw new Error(`${paths.secretsFile} holds key ${onFile.fingerprint} but the state file records ${state.encryptionKey.fingerprint}. Stopping.`);
  }
  if (!state.encryptionKey || !state.orgId) {
    state.encryptionKey ??= onFile;
    state.orgId ??= exec.live ? crypto.randomUUID() : "<org-id>";
    ctx.save();
  }

  if (state.keyBackedUpAt) return DONE;

  if (!state.keyRevealedAt) {
    if (exec.live && ctx.isTTY) {
      revealKey(ctx);
    } else {
      exec.manual({
        purpose: "Back up the tenant encryption key (it is unrecoverable if lost)",
        instructions: [
          "This output is captured (Claude Code or a log), so the key is NOT printed here.",
          `In your own terminal, run: pnpm tenant:provision --subdomain ${state.input.subdomain} --reveal-key`,
          `Store the key in the password manager as "Revualy ${state.input.subdomain} ENCRYPTION_KEYS (${state.encryptionKey?.fingerprint})".`,
          "Then re-run with --key-backed-up.",
        ],
      });
    }
    return { status: "waiting", reason: "Encryption key not yet revealed and backed up" };
  }

  if (!ctx.flags.keyBackedUp) {
    return { status: "waiting", reason: `Store the key (${state.encryptionKey?.fingerprint}) in the password manager, then re-run with --key-backed-up` };
  }
  state.keyBackedUpAt = ctx.now().toISOString();
  ctx.save();
  return DONE;
};

/** Print the key once, to a terminal only. Called by the step and by --reveal-key. */
export function revealKey(ctx: StepContext): void {
  const keys = ctx.secrets.get();
  if (!ctx.secrets.hasReal() || !keys) throw new Error(`No local secrets file at ${ctx.paths.secretsFile}`);
  if (!ctx.isTTY) throw new Error("Refusing to print the encryption key: stdout is not a terminal (run this in your own terminal, not through Claude Code)");
  const { fingerprint } = encryptionKeyFingerprint(keys.ENCRYPTION_KEYS);
  const bar = "=".repeat(78);
  // Deliberately bypasses the redacting executor: this is the one place the key is shown.
  process.stdout.write(
    `\n${bar}\n  ENCRYPTION KEY for ${ctx.state.input.subdomain}.${ROOT_DOMAIN}  (${fingerprint})\n\n  ${keys.ENCRYPTION_KEYS}\n\n` +
      "  Store this NOW in the password manager. If it is lost, every encrypted\n" +
      "  field in this tenant's database is lost with it. Railway is not a backup.\n" +
      `  Then clear this screen and re-run with --key-backed-up.\n${bar}\n\n`,
  );
  ctx.state.keyRevealedAt = ctx.now().toISOString();
  ctx.save();
}

// ── 3. Environment variables ─────────────────────────────

const ENCRYPTION_VARS = ["ENCRYPTION_KEYS", "ENCRYPTION_KEY"] as const;

const envVars: StepFn = async (ctx) => {
  const { exec, state, paths, secrets } = ctx;
  if (!state.keyBackedUpAt || !state.orgId || !state.encryptionKey) {
    if (exec.live) throw new Error("The encryption key backup has not been confirmed: finish the secrets step first");
    exec.log("  (dry run: a live run refuses this step until the secrets step, including the key backup, is complete)");
  }
  const orgId = state.orgId ?? "<org-id>";
  const fingerprint = state.encryptionKey?.fingerprint ?? "<fingerprint>";
  await assertLinkedProject(ctx);

  const real = secrets.get() ?? null;
  const ids = state.railway.services;
  for (const service of ["api", "web"] as const) {
    const out = await exec.cli(
      railway(paths, `Read the ${service} service's current variables (values are never printed)`, ["variables", "--service", SERVICES[service], "--json"], {
        sensitiveOutput: true,
        dryResult: "{}",
      }),
    );
    const existing = JSON.parse(out) as Record<string, string>;
    for (const name of ENCRYPTION_VARS) {
      if (existing[name] && encryptionKeyFingerprint(existing[name]).fingerprint !== fingerprint) {
        throw new Error(`${service} already has ${name} with a different key. Refusing to overwrite: that would orphan any data encrypted with it.`);
      }
    }
    if (!real) {
      const absent = ["ENCRYPTION_KEYS", "NEXTAUTH_SECRET", "INTERNAL_API_SECRET"].filter((n) => !existing[n]);
      if (absent.length > 0) {
        throw new Error(`Local secrets file is gone and ${service} is missing ${absent.join(", ")}. Restore the secrets file from the password manager.`);
      }
    }
  }

  const vars = buildServiceVariables({ input: state.input, orgId, secrets: real, operatorEnv: ctx.operatorEnv });
  secrets.addForRedaction(secretValuesIn(vars, ctx.operatorEnv));
  const patch = variablesPatch([
    { serviceId: ids.api ?? "<api-service-id>", variables: vars.api },
    { serviceId: ids.web ?? "<web-service-id>", variables: vars.web },
  ]);
  await exec.cli(
    railway(paths, "Set the api and web variables in one change (secrets go over stdin, never argv); Railway redeploys both", ["environment", "edit", "-m", "revualy: tenant variables", "--json"], {
      stdin: JSON.stringify(patch, null, 2),
      sensitiveOutput: true,
    }),
  );

  if (vars.followUps.length > 0) {
    exec.manual({
      purpose: "Variables to set by hand in the Railway dashboard (not handled by this script)",
      instructions: vars.followUps.map((f) => `${f.service} → ${f.name} (${f.why})`),
    });
  }

  if (secrets.hasReal()) {
    await exec.local({
      purpose: `Delete ${paths.secretsFile}: Railway and the password manager now hold the secrets`,
      run: () => {
        deleteSecretsFile(paths.secretsFile);
        secrets.forget();
      },
    });
  }
  return DONE;
};

// ── 4. DNS ───────────────────────────────────────────────

const dns: StepFn = async (ctx) => {
  const { exec, state, paths } = ctx;
  const sub = state.input.subdomain;
  const host = `${sub}.${ROOT_DOMAIN}`;
  await assertLinkedProject(ctx);

  if (!state.dns.webRecords) {
    const out = await exec.cli(
      railway(paths, `Attach ${host} to the web service (Railway issues the certificate)`, ["domain", host, "--service", SERVICES.web, "--json"], {
        dryResult: JSON.stringify({ domain: host, dnsRecords: [{ type: "CNAME", host: sub, value: "<railway-cname-target>" }] }),
      }),
    );
    state.dns.webRecords = parseCustomDomain(out);
    ctx.save();
  }
  if (!state.dns.apiDomain) {
    const out = await exec.cli(
      railway(paths, "Generate a Railway domain for the api (WebSocket and health endpoint)", ["domain", "--service", SERVICES.api, "--json"], {
        dryResult: JSON.stringify({ domain: "<api-domain>.up.railway.app" }),
      }),
    );
    state.dns.apiDomain = parseGeneratedDomain(out);
    ctx.save();
  }

  let zoneId = ctx.operatorEnv.CLOUDFLARE_ZONE_ID;
  if (!zoneId) {
    const zones = parseCloudflare<{ id: string }[]>(
      (await exec.http({
        purpose: `Look up the Cloudflare zone id for ${ROOT_DOMAIN}`,
        method: "GET",
        url: `${CLOUDFLARE_API_URL}/zones?name=${ROOT_DOMAIN}`,
        auth: "cloudflare",
        dryResult: ok({ success: true, result: [{ id: "<zone-id>" }] }),
      })).body,
    );
    if (zones.length !== 1) throw new Error(`Expected one Cloudflare zone for ${ROOT_DOMAIN}, found ${zones.length}`);
    zoneId = zones[0].id;
  }

  for (const record of state.dns.webRecords) {
    const fqdn = toFqdn(record.host, ROOT_DOMAIN);
    const existing = parseCloudflare<ExistingRecord[]>(
      (await exec.http({
        purpose: `Check for existing DNS records at ${fqdn}`,
        method: "GET",
        url: `${CLOUDFLARE_API_URL}/zones/${zoneId}/dns_records?name=${encodeURIComponent(fqdn)}`,
        auth: "cloudflare",
        dryResult: ok({ success: true, result: [] }),
      })).body,
    );
    const decision = decideRecord(record, fqdn, existing);
    if (decision.action === "exists") {
      exec.log(`  ${record.type} ${fqdn} already correct`);
      continue;
    }
    if (decision.action === "conflict") {
      throw new Error(`${fqdn} already has a ${decision.existing.type} record pointing at ${decision.existing.content}. Not overwriting; resolve it in Cloudflare by hand.`);
    }
    parseCloudflare(
      (await exec.http({
        purpose: `Create ${record.type} ${fqdn} (unproxied)`,
        method: "POST",
        url: `${CLOUDFLARE_API_URL}/zones/${zoneId}/dns_records`,
        auth: "cloudflare",
        body: recordBody(record, fqdn, sub),
        dryResult: ok({ success: true, result: { id: "<record-id>" } }),
      })).body,
    );
  }

  const ids = state.railway.services;
  await exec.cli(
    railway(paths, "Point the web service's WebSocket URL at the api domain", ["environment", "edit", "-m", "revualy: websocket url", "--json"], {
      stdin: JSON.stringify(variablesPatch([{ serviceId: ids.web ?? "<web-service-id>", variables: { NEXT_PUBLIC_WS_URL: `wss://${state.dns.apiDomain}` } }]), null, 2),
      sensitiveOutput: true,
    }),
  );
  return DONE;
};

// ── 5. Google OAuth (manual) ─────────────────────────────

export function oauthInstructions(subdomain: string): string[] {
  const origin = tenantOrigin(subdomain);
  return [
    "Google Cloud Console → APIs & Services → Credentials → the Revualy OAuth 2.0 web client",
    `Authorised JavaScript origins: add ${origin}`,
    `Authorised redirect URIs: add ${origin}/api/auth/callback/google (sign-in)`,
    `Authorised redirect URIs: add ${origin}/api/integrations/google/callback (Google Calendar)`,
    `OAuth consent screen → Authorised domains: confirm ${ROOT_DOMAIN} is listed (once for the whole fleet)`,
    "Save, then re-run with --oauth-configured",
  ];
}

const oauth: StepFn = async (ctx) => {
  // Google exposes no supported API for editing a web OAuth client's redirect URIs.
  ctx.exec.manual({ purpose: "Add this tenant to the Google OAuth client", instructions: oauthInstructions(ctx.state.input.subdomain) });
  if (!ctx.flags.oauthConfigured) return { status: "waiting", reason: "Google OAuth redirect URIs not confirmed (--oauth-configured)" };
  return DONE;
};

// ── 6. Migrations ────────────────────────────────────────

const migrate: StepFn = async (ctx) => {
  await assertLinkedProject(ctx);
  await ctx.exec.cli(migrateAction(ctx.paths));
  return DONE;
};

// ── 7. Seed defaults ─────────────────────────────────────

const seed: StepFn = async (ctx) => {
  await assertLinkedProject(ctx);
  await ctx.exec.cli(seedAction(ctx.paths, ctx.state));
  return DONE;
};

// ── 8. Readiness ─────────────────────────────────────────

export interface ReadinessCheck {
  purpose: string;
  url: string;
  check: (res: HttpResult) => string | null;
}

export function readinessChecks(state: TenantState): ReadinessCheck[] {
  const origin = tenantOrigin(state.input.subdomain);
  const checks: ReadinessCheck[] = [];
  if (state.dns.apiDomain) {
    checks.push({
      purpose: "API health endpoint",
      url: `https://${state.dns.apiDomain}/health`,
      check: (r) => (r.status === 200 && safeJson(r.body)?.status === "ok" ? null : `expected 200 {"status":"ok"}, got ${r.status}`),
    });
  }
  checks.push(
    {
      purpose: "Web login page renders",
      url: `${origin}/login`,
      check: (r) => (r.status === 200 ? null : `expected 200, got ${r.status}`),
    },
    {
      purpose: "Login path: NextAuth lists Google with this tenant's callback URL",
      url: `${origin}/api/auth/providers`,
      check: (r) => {
        const cb = (safeJson(r.body)?.google as { callbackUrl?: string } | undefined)?.callbackUrl;
        const want = `${origin}/api/auth/callback/google`;
        return r.status === 200 && cb === want ? null : `expected google.callbackUrl ${want}, got ${r.status} ${cb ?? "(none)"}`;
      },
    },
    {
      purpose: "Login path: NextAuth CSRF endpoint works (AUTH_SECRET is set)",
      url: `${origin}/api/auth/csrf`,
      check: (r) => (r.status === 200 && typeof safeJson(r.body)?.csrfToken === "string" ? null : `expected 200 with csrfToken, got ${r.status}`),
    },
    {
      purpose: "Dev test-login endpoint is disabled in production",
      url: `${origin}/api/test-login`,
      check: (r) => (r.status === 404 ? null : `expected 404, got ${r.status}: TEST_LOGIN_ENABLED may be on`),
    },
  );
  return checks;
}

const readiness: StepFn = async (ctx) => {
  const { exec, state, paths } = ctx;
  await assertLinkedProject(ctx);
  const failures: string[] = [];

  for (const c of readinessChecks(state)) {
    try {
      const res = await exec.http({ purpose: c.purpose, method: "GET", url: c.url, dryResult: dryReadiness(c.url) });
      const problem = c.check(res);
      if (problem) failures.push(`${c.purpose}: ${problem}`);
    } catch (err) {
      failures.push(`${c.purpose}: ${(err as Error).message}`);
    }
  }
  for (const service of ["api", "web"] as const) {
    try {
      await exec.cli(encryptionCheckAction(paths, service, state.encryptionKey?.fingerprint ?? "<fingerprint>"));
    } catch (err) {
      failures.push(`Encryption round trip (${service}): ${(err as Error).message}`);
    }
  }
  exec.manual({
    purpose: "Final human check",
    instructions: [`Open ${tenantOrigin(state.input.subdomain)} in a browser and sign in with Google as ${state.input.adminEmail}; you should land on the admin home`],
  });

  if (failures.length > 0) throw new Error(`Readiness checks failed:\n  - ${failures.join("\n  - ")}`);
  return DONE;
};

function dryReadiness(url: string): HttpResult {
  if (url.endsWith("/health")) return ok({ status: "ok" });
  if (url.endsWith("/api/auth/providers")) return ok({ google: { callbackUrl: url.replace("/api/auth/providers", "/api/auth/callback/google") } });
  if (url.endsWith("/api/auth/csrf")) return ok({ csrfToken: "<csrf>" });
  if (url.endsWith("/api/test-login")) return { status: 404, body: "{}" };
  return { status: 200, body: "" };
}

// ── Registry + runner ────────────────────────────────────

export const STEPS: Record<StepId, StepFn> = {
  "railway-project": railwayProject,
  secrets: secretsStep,
  "env-vars": envVars,
  dns,
  oauth,
  migrate,
  seed,
  readiness,
};

export type RunResult = { status: "complete" } | { status: "waiting"; step: StepId; reason: string } | { status: "failed"; step: StepId; error: string };

/**
 * Run steps in order. Live: a step that is waiting on Nick stops the run.
 * Dry run: it is reported and the plan continues, so the whole sequence of
 * commands is visible up front.
 */
export async function runSteps(ctx: StepContext, steps: StepId[]): Promise<RunResult> {
  let firstWait: RunResult | undefined;
  for (const [i, step] of steps.entries()) {
    ctx.exec.log(`\n[${i + 1}/${steps.length}] ${step}: ${STEP_TITLES[step]}`);
    let outcome: StepOutcome;
    try {
      outcome = await STEPS[step](ctx);
    } catch (err) {
      return { status: "failed", step, error: (err as Error).message };
    }
    if (outcome.status === "waiting") {
      if (ctx.exec.live) return { status: "waiting", step, reason: outcome.reason };
      ctx.exec.log(`  (a live run stops here until: ${outcome.reason})`);
      firstWait ??= { status: "waiting", step, reason: outcome.reason };
      continue;
    }
    markStepComplete(ctx.state, step, ctx.now());
    ctx.save();
  }
  return firstWait ?? { status: "complete" };
}

function ok(body: unknown): HttpResult {
  return { status: 200, body: JSON.stringify(body) };
}

function safeJson(body: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(body) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}
