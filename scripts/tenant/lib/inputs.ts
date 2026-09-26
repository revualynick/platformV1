import { parseArgs } from "node:util";
import {
  CHAT_PLATFORMS,
  REGIONS,
  RESERVED_SUBDOMAINS,
  STEP_IDS,
  type ChatPlatform,
  type StepId,
} from "./constants.js";

export interface TenantInput {
  name: string;
  subdomain: string;
  adminEmail: string;
  adminName?: string;
  chatPlatform: ChatPlatform;
  region: string;
  /** Railway workspace id or name, needed when the account has several. */
  workspace?: string;
  /** Railway template code for the four-service Revualy stack. */
  template?: string;
}

export interface ProvisionOptions {
  input: Partial<TenantInput>;
  fromStep?: StepId;
  apply: boolean;
  keyBackedUp: boolean;
  oauthConfigured: boolean;
  revealKey: boolean;
  help: boolean;
}

const SUBDOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const EMAIL_RE = /^[^\s@]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i;
const TEMPLATE_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function parseProvisionArgs(argv: string[]): ProvisionOptions {
  // pnpm forwards a literal "--" in some versions; drop it.
  const args = argv[0] === "--" ? argv.slice(1) : argv;
  const { values } = parseArgs({
    args,
    strict: true,
    allowPositionals: false,
    options: {
      name: { type: "string" },
      subdomain: { type: "string" },
      "admin-email": { type: "string" },
      "admin-name": { type: "string" },
      "chat-platform": { type: "string" },
      region: { type: "string" },
      workspace: { type: "string" },
      template: { type: "string" },
      "from-step": { type: "string" },
      apply: { type: "boolean", default: false },
      "key-backed-up": { type: "boolean", default: false },
      "oauth-configured": { type: "boolean", default: false },
      "reveal-key": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  const fromStep = values["from-step"];
  if (fromStep !== undefined && !isStepId(fromStep)) {
    throw new Error(`--from-step must be one of: ${STEP_IDS.join(", ")}`);
  }

  const input: Partial<TenantInput> = {};
  if (values.name !== undefined) input.name = values.name.trim();
  if (values.subdomain !== undefined) input.subdomain = values.subdomain.trim().toLowerCase();
  if (values["admin-email"] !== undefined) input.adminEmail = values["admin-email"].trim().toLowerCase();
  if (values["admin-name"] !== undefined) input.adminName = values["admin-name"].trim();
  if (values["chat-platform"] !== undefined) input.chatPlatform = values["chat-platform"] as ChatPlatform;
  if (values.region !== undefined) input.region = values.region.trim();
  if (values.workspace !== undefined) input.workspace = values.workspace.trim();
  if (values.template !== undefined) input.template = values.template.trim();

  return {
    input,
    fromStep: fromStep as StepId | undefined,
    apply: values.apply ?? false,
    keyBackedUp: values["key-backed-up"] ?? false,
    oauthConfigured: values["oauth-configured"] ?? false,
    revealKey: values["reveal-key"] ?? false,
    help: values.help ?? false,
  };
}

export function isStepId(value: string): value is StepId {
  return (STEP_IDS as readonly string[]).includes(value);
}

export function validateSubdomain(subdomain: string | undefined): string[] {
  if (!subdomain) return ["--subdomain is required"];
  const errors: string[] = [];
  if (!SUBDOMAIN_RE.test(subdomain)) {
    errors.push("--subdomain must be a DNS label: lowercase letters, digits and inner hyphens, 1-63 characters");
  }
  if (RESERVED_SUBDOMAINS.has(subdomain)) errors.push(`--subdomain "${subdomain}" is reserved`);
  return errors;
}

/** Validate a complete tenant input. Returns every problem at once. */
export function validateTenantInput(input: Partial<TenantInput>): { ok: true; value: TenantInput } | { ok: false; errors: string[] } {
  const errors: string[] = [];

  if (!input.name) errors.push("--name is required");
  else if (input.name.length > 100) errors.push("--name must be 100 characters or fewer");
  else if (/[\u0000-\u001f]/.test(input.name)) errors.push("--name must not contain control characters");

  errors.push(...validateSubdomain(input.subdomain));

  if (!input.adminEmail) errors.push("--admin-email is required");
  else if (!EMAIL_RE.test(input.adminEmail) || input.adminEmail.length > 255) errors.push("--admin-email is not a valid email address");

  if (input.adminName !== undefined && (input.adminName.length === 0 || input.adminName.length > 255)) {
    errors.push("--admin-name must be 1-255 characters");
  }

  if (!input.chatPlatform) errors.push(`--chat-platform is required (${CHAT_PLATFORMS.join(" | ")})`);
  else if (!(CHAT_PLATFORMS as readonly string[]).includes(input.chatPlatform)) {
    errors.push(`--chat-platform must be one of: ${CHAT_PLATFORMS.join(", ")}`);
  }

  if (!input.region) errors.push(`--region is required (${Object.keys(REGIONS).join(" | ")})`);
  else if (!(input.region in REGIONS)) errors.push(`--region must be one of: ${Object.keys(REGIONS).join(", ")}`);

  if (input.template !== undefined && !TEMPLATE_RE.test(input.template)) {
    errors.push("--template must be a Railway template code (letters, digits, - and _)");
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: input as TenantInput };
}

/**
 * Merge CLI input over the input recorded in the state file. The identity
 * of a tenant (name, subdomain, admin, platform, region) cannot change once
 * provisioning has started: a mismatch is an error, not an override.
 */
export function mergeWithRecordedInput(cli: Partial<TenantInput>, recorded: TenantInput | undefined): { merged: Partial<TenantInput>; conflicts: string[] } {
  if (!recorded) return { merged: cli, conflicts: [] };
  const conflicts: string[] = [];
  const locked: (keyof TenantInput)[] = ["name", "subdomain", "adminEmail", "chatPlatform", "region"];
  for (const key of locked) {
    const given = cli[key];
    if (given !== undefined && given !== recorded[key]) {
      conflicts.push(`${key}: state file has "${recorded[key]}", command line has "${given}"`);
    }
  }
  return { merged: { ...recorded, ...stripUndefined(cli) }, conflicts };
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}
