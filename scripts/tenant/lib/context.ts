import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Executor } from "./executor.js";
import type { TenantInput } from "./inputs.js";
import { placeholderSecrets, readSecretsFile, type TenantSecrets } from "./secrets.js";
import { saveState, type TenantState } from "./state.js";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

export interface TenantPaths {
  repoRoot: string;
  stateDir: string;
  /** ~/.revualy/tenants/<subdomain>: outside the repo, never committed. */
  tenantHome: string;
  /** Directory linked to the tenant's Railway project; every railway command runs here. */
  linkDir: string;
  secretsFile: string;
}

export function tenantPaths(subdomain: string, env: Record<string, string | undefined> = process.env): TenantPaths {
  const stateDir = env.REVUALY_TENANT_STATE_DIR ?? join(REPO_ROOT, "scripts", "tenant", "state");
  const home = env.REVUALY_TENANT_HOME ?? join(homedir(), ".revualy", "tenants");
  const tenantHome = join(home, subdomain);
  return {
    repoRoot: REPO_ROOT,
    stateDir,
    tenantHome,
    linkDir: join(tenantHome, "railway"),
    secretsFile: join(tenantHome, "secrets.json"),
  };
}

export interface StepFlags {
  keyBackedUp: boolean;
  oauthConfigured: boolean;
}

export interface StepContext {
  input: TenantInput;
  state: TenantState;
  paths: TenantPaths;
  flags: StepFlags;
  exec: Executor;
  operatorEnv: Record<string, string | undefined>;
  now: () => Date;
  /** Is stdout a terminal Nick is looking at (as opposed to Claude Code's captured output)? */
  isTTY: boolean;
  /** Secrets for this run: real ones once generated, placeholders in a dry run. */
  secrets: SecretStore;
  /** Persist state. A no-op in a dry run. */
  save: () => void;
}

/**
 * Holds the tenant's generated secrets for the current process and exposes
 * every sensitive value for redaction.
 */
export class SecretStore {
  private current: TenantSecrets | undefined;
  private readonly extra: Record<string, string> = {};

  constructor(private readonly path: string, private readonly live: boolean) {
    this.current = readSecretsFile(path);
  }

  get file(): string {
    return this.path;
  }

  /** Real secrets if present; in a dry run, placeholders when none exist yet. */
  get(): TenantSecrets | undefined {
    if (this.current) return this.current;
    return this.live ? undefined : placeholderSecrets();
  }

  hasReal(): boolean {
    return this.current !== undefined;
  }

  set(secrets: TenantSecrets): void {
    this.current = secrets;
  }

  forget(): void {
    this.current = undefined;
  }

  addForRedaction(values: Record<string, string>): void {
    Object.assign(this.extra, values);
  }

  forRedaction(): Record<string, string | undefined> {
    const out: Record<string, string | undefined> = { ...this.extra };
    if (this.current) {
      Object.assign(out, this.current);
      out.ENCRYPTION_KEY_HEX = this.current.ENCRYPTION_KEYS.split(":")[1];
    }
    return out;
  }

  knownValues(): string[] {
    return Object.values(this.forRedaction()).filter((v): v is string => !!v);
  }
}

export function makeSaver(live: boolean, stateDir: string, state: TenantState, store: SecretStore, now: () => Date): () => void {
  return () => {
    if (live) saveState(stateDir, state, store.knownValues(), now());
  };
}
