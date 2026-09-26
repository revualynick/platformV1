import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { STEP_IDS, type StepId } from "./constants.js";
import type { TenantInput } from "./inputs.js";

export interface DnsRecord {
  type: string;
  host: string;
  value: string;
}

/**
 * Per-tenant provisioning state. Holds identifiers and progress only: no
 * secret ever goes in here (saveState enforces it). Gitignored.
 */
export interface TenantState {
  version: 1;
  input: TenantInput;
  orgId?: string;
  railway: {
    projectId?: string;
    environmentId?: string;
    services: Partial<Record<"api" | "web" | "postgres" | "redis", string>>;
  };
  encryptionKey?: {
    id: string;
    /** Truncated SHA-256 of the key bytes: identifies the key, reveals nothing. */
    fingerprint: string;
  };
  keyRevealedAt?: string;
  keyBackedUpAt?: string;
  dns: {
    webRecords?: DnsRecord[];
    apiDomain?: string;
  };
  completedSteps: Partial<Record<StepId, string>>;
  createdAt: string;
  updatedAt: string;
}

export function newState(input: TenantInput, now: Date): TenantState {
  const iso = now.toISOString();
  return {
    version: 1,
    input,
    railway: { services: {} },
    dns: {},
    completedSteps: {},
    createdAt: iso,
    updatedAt: iso,
  };
}

export function statePath(stateDir: string, subdomain: string): string {
  return join(stateDir, `${subdomain}.json`);
}

export function loadState(stateDir: string, subdomain: string): TenantState | undefined {
  const path = statePath(stateDir, subdomain);
  if (!existsSync(path)) return undefined;
  return parseState(readFileSync(path, "utf8"), path);
}

export function parseState(json: string, source = "state"): TenantState {
  const data = JSON.parse(json) as Partial<TenantState>;
  if (data.version !== 1 || !data.input?.subdomain || typeof data.completedSteps !== "object") {
    throw new Error(`${source} is not a version 1 tenant state file`);
  }
  return {
    ...data,
    railway: { services: {}, ...data.railway },
    dns: { ...data.dns },
  } as TenantState;
}

/** Values that look like key material. A last line of defence, not the main control. */
const SECRET_SHAPES = [/\b[0-9a-f]{64}\b/i, /\bk[0-9a-z]*:[0-9a-f]{32,}/i];

export function assertNoSecrets(serialised: string, knownSecrets: string[]): void {
  for (const secret of knownSecrets) {
    if (secret.length >= 8 && serialised.includes(secret)) {
      throw new Error("Refusing to write the state file: it contains a secret value");
    }
  }
  for (const shape of SECRET_SHAPES) {
    if (shape.test(serialised)) {
      throw new Error("Refusing to write the state file: it contains something shaped like key material");
    }
  }
}

/** Atomic write (temp file + rename), after checking no secret is in it. */
export function saveState(stateDir: string, state: TenantState, knownSecrets: string[], now: Date): void {
  state.updatedAt = now.toISOString();
  const serialised = `${JSON.stringify(state, null, 2)}\n`;
  assertNoSecrets(serialised, knownSecrets);
  mkdirSync(stateDir, { recursive: true });
  const path = statePath(stateDir, state.input.subdomain);
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, serialised, { mode: 0o644 });
  renameSync(tmp, path);
}

export function markStepComplete(state: TenantState, step: StepId, now: Date): void {
  state.completedSteps[step] = now.toISOString();
}

export function firstIncompleteStep(state: TenantState | undefined): StepId | undefined {
  return STEP_IDS.find((s) => !state?.completedSteps[s]);
}

/**
 * Which steps to run. Without --from-step: from the first incomplete step to
 * the end. With --from-step: from that step, which requires every earlier
 * step to be complete (a dry run only warns, so a plan can be previewed).
 */
export function selectSteps(
  state: TenantState | undefined,
  fromStep: StepId | undefined,
  mode: "dry-run" | "apply",
): { steps: StepId[]; warnings: string[] } {
  const warnings: string[] = [];
  if (!fromStep) {
    const first = firstIncompleteStep(state);
    return { steps: first ? STEP_IDS.slice(STEP_IDS.indexOf(first)) : [], warnings };
  }
  const index = STEP_IDS.indexOf(fromStep);
  const missing = STEP_IDS.slice(0, index).filter((s) => !state?.completedSteps[s]);
  if (missing.length > 0) {
    const message = `--from-step ${fromStep} needs these earlier steps completed first: ${missing.join(", ")}`;
    if (mode === "apply") throw new Error(message);
    warnings.push(message);
  }
  return { steps: STEP_IDS.slice(index), warnings };
}

export function listStates(stateDir: string): { states: TenantState[]; errors: string[] } {
  if (!existsSync(stateDir)) return { states: [], errors: [] };
  const states: TenantState[] = [];
  const errors: string[] = [];
  for (const file of readdirSync(stateDir).filter((f) => f.endsWith(".json")).sort()) {
    const path = join(stateDir, file);
    try {
      states.push(parseState(readFileSync(path, "utf8"), path));
    } catch (err) {
      errors.push(`${file}: ${(err as Error).message}`);
    }
  }
  return { states, errors };
}
