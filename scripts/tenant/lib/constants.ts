export const ROOT_DOMAIN = "revualy.com";

export const STEP_IDS = [
  "railway-project",
  "secrets",
  "env-vars",
  "dns",
  "oauth",
  "migrate",
  "seed",
  "readiness",
] as const;
export type StepId = (typeof STEP_IDS)[number];

export const STEP_TITLES: Record<StepId, string> = {
  "railway-project": "Create the Railway project from the Revualy template",
  secrets: "Generate tenant secrets and confirm the encryption key backup",
  "env-vars": "Set environment variables on api and web",
  dns: "Attach the custom domain and create DNS records in Cloudflare",
  oauth: "Add the Google OAuth redirect URIs",
  migrate: "Run database migrations",
  seed: "Seed defaults (org settings, core values, built-in questionnaires, first admin)",
  readiness: "Readiness checks (health, login path, encryption round trip)",
};

export const CHAT_PLATFORMS = ["google_chat", "slack", "teams"] as const;
export type ChatPlatform = (typeof CHAT_PLATFORMS)[number];

/** Railway regions (see the railway-environment skill's multiRegionConfig table). */
export const REGIONS: Record<string, string> = {
  "europe-west4-drams3a": "EU West (Amsterdam)",
  "us-west2": "US West (California)",
  "us-east4-eqdc4a": "US East (Virginia)",
  "asia-southeast1-eqsg3a": "Southeast Asia (Singapore)",
};

/** Service names the Railway template must use. */
export const SERVICES = {
  api: "api",
  web: "web",
  postgres: "Postgres",
  redis: "Redis",
} as const;
export type ServiceKey = keyof typeof SERVICES;

/** Subdomains that belong to Revualy itself, never to a tenant. */
export const RESERVED_SUBDOMAINS = new Set([
  "www", "api", "app", "admin", "demo", "mail", "email", "status", "staging",
  "dev", "test", "docs", "help", "support", "blog", "auth", "login", "static",
  "cdn", "assets", "internal", "ops",
]);

export const ENCRYPTION_KEY_ID = "k1";

/** Generated per tenant. Never written to the state file or printed in a log. */
export const GENERATED_SECRET_NAMES = [
  "ENCRYPTION_KEYS",
  "NEXTAUTH_SECRET",
  "INTERNAL_API_SECRET",
  "WS_TOKEN_SECRET",
  // Tier A reviewer pseudonyms (apps/api/src/lib/pseudonym.ts). Losing it
  // breaks duplicate checks and re-identification: back it up with the rest.
  "REVIEWER_PSEUDONYM_SECRET",
] as const;
export type GeneratedSecretName = (typeof GENERATED_SECRET_NAMES)[number];

/**
 * Fleet-wide credentials copied from the operator's environment when present.
 * Chat platform credentials are deliberately NOT here: they belong to one
 * customer's workspace, and copying them from a shell could leak one tenant's
 * tokens into another.
 */
export const SHARED_OPERATOR_VARS = {
  api: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "ANTHROPIC_API_KEY", "RESEND_API_KEY"],
  web: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
} as const;

/** Per-tenant chat credentials: always a manual follow-up in the Railway dashboard. */
export const PLATFORM_VARS: Record<ChatPlatform, string[]> = {
  google_chat: ["GCHAT_SERVICE_ACCOUNT_KEY", "GCHAT_PROJECT_ID", "GOOGLE_CHAT_AUDIENCE"],
  slack: ["SLACK_BOT_TOKEN", "SLACK_SIGNING_SECRET", "SLACK_APP_TOKEN"],
  teams: ["TEAMS_APP_ID", "TEAMS_APP_PASSWORD"],
};

export const RAILWAY_GRAPHQL_URL = "https://backboard.railway.com/graphql/v2";
export const CLOUDFLARE_API_URL = "https://api.cloudflare.com/client/v4";
