import { PLATFORM_VARS, ROOT_DOMAIN, SERVICES, SHARED_OPERATOR_VARS } from "./constants.js";
import type { TenantInput } from "./inputs.js";
import type { TenantSecrets } from "./secrets.js";

export function tenantOrigin(subdomain: string): string {
  return `https://${subdomain}.${ROOT_DOMAIN}`;
}

export interface ServiceVariables {
  api: Record<string, string>;
  web: Record<string, string>;
  /** Variables Nick sets by hand in the Railway dashboard. */
  followUps: { service: "api" | "web"; name: string; why: string }[];
}

/**
 * The variables each service reads (from process.env usage in apps/api and
 * apps/web), not one shared blob: the web server never sees the LLM or
 * email keys. `secrets` is null when the local secrets file has already been
 * purged; generated secrets are then left untouched in Railway.
 */
export function buildServiceVariables(opts: {
  input: TenantInput;
  orgId: string;
  secrets: TenantSecrets | null;
  operatorEnv: Record<string, string | undefined>;
}): ServiceVariables {
  const { input, orgId, secrets, operatorEnv } = opts;
  const origin = tenantOrigin(input.subdomain);
  const pg = `\${{${SERVICES.postgres}.DATABASE_URL}}`;

  const api: Record<string, string> = {
    NODE_ENV: "production",
    DATABASE_URL: pg,
    REDIS_URL: `\${{${SERVICES.redis}.REDIS_URL}}`,
    ORG_ID: orgId,
    NEXTAUTH_URL: origin,
    APP_URL: origin,
    CORS_ORIGIN: origin,
    TRUST_PROXY: "1",
    SCHEDULER_PLATFORM: input.chatPlatform,
    GOOGLE_CALENDAR_REDIRECT_URI: `${origin}/api/integrations/google/callback`,
    TEST_LOGIN_ENABLED: "false",
  };
  const web: Record<string, string> = {
    NODE_ENV: "production",
    DATABASE_URL: pg,
    ORG_ID: orgId,
    NEXTAUTH_URL: origin,
    INTERNAL_API_URL: `http://\${{${SERVICES.api}.RAILWAY_PRIVATE_DOMAIN}}:3000`,
    TEST_LOGIN_ENABLED: "false",
  };

  if (secrets) {
    Object.assign(api, {
      ENCRYPTION_KEYS: secrets.ENCRYPTION_KEYS,
      NEXTAUTH_SECRET: secrets.NEXTAUTH_SECRET,
      INTERNAL_API_SECRET: secrets.INTERNAL_API_SECRET,
      WS_TOKEN_SECRET: secrets.WS_TOKEN_SECRET,
    });
    Object.assign(web, {
      ENCRYPTION_KEYS: secrets.ENCRYPTION_KEYS,
      NEXTAUTH_SECRET: secrets.NEXTAUTH_SECRET,
      AUTH_SECRET: secrets.NEXTAUTH_SECRET,
      INTERNAL_API_SECRET: secrets.INTERNAL_API_SECRET,
    });
  }

  const followUps: ServiceVariables["followUps"] = [];
  for (const service of ["api", "web"] as const) {
    const target = service === "api" ? api : web;
    for (const name of SHARED_OPERATOR_VARS[service]) {
      const value = operatorEnv[name];
      if (value) target[name] = value;
      else followUps.push({ service, name, why: "fleet-wide credential not in the operator environment" });
    }
  }
  for (const name of PLATFORM_VARS[input.chatPlatform]) {
    followUps.push({ service: "api", name, why: `${input.chatPlatform} credential for this customer's workspace` });
  }
  return { api, web, followUps };
}

/** Names of every value in the variable set that must be redacted when printed. */
export function secretValuesIn(vars: ServiceVariables, operatorEnv: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of new Set([...SHARED_OPERATOR_VARS.api, ...SHARED_OPERATOR_VARS.web])) {
    const value = operatorEnv[name];
    // A client id is not secret, but redacting it costs nothing.
    if (value && (vars.api[name] === value || vars.web[name] === value)) out[name] = value;
  }
  return out;
}
