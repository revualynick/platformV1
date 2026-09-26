import { REGIONS, SERVICES, type ServiceKey } from "./constants.js";
import type { DnsRecord } from "./state.js";

// The Railway CLI's JSON shapes are not formally documented and the skills
// describe them slightly differently, so these parsers accept both forms
// and fail loudly on anything else rather than guessing.

export interface RailwayStatus {
  projectId: string;
  environmentId: string;
  services: { id: string; name: string }[];
}

type Json = Record<string, unknown>;

function edges(value: unknown): Json[] {
  if (Array.isArray(value)) return value as Json[];
  const e = (value as { edges?: { node: Json }[] } | undefined)?.edges;
  return Array.isArray(e) ? e.map((x) => x.node) : [];
}

export function parseRailwayStatus(stdout: string): RailwayStatus {
  const raw = JSON.parse(stdout) as Json;
  const project = (raw.project as Json | undefined) ?? raw;
  const projectId = project.id as string | undefined;
  const envs = edges(project.environments);
  const env =
    (raw.environment as Json | undefined) ??
    envs.find((e) => e.name === "production") ??
    envs[0];
  const services = edges(project.services).map((s) => ({ id: String(s.id), name: String(s.name) }));
  if (!projectId || !env?.id) {
    throw new Error("Unexpected `railway status --json` output: no project or environment id");
  }
  return { projectId, environmentId: String(env.id), services };
}

export function findServiceIds(status: RailwayStatus): { found: Partial<Record<ServiceKey, string>>; missing: ServiceKey[] } {
  const found: Partial<Record<ServiceKey, string>> = {};
  const missing: ServiceKey[] = [];
  for (const [key, name] of Object.entries(SERVICES) as [ServiceKey, string][]) {
    const svc = status.services.find((s) => s.name === name);
    if (svc) found[key] = svc.id;
    else missing.push(key);
  }
  return { found, missing };
}

export function projectExists(listStdout: string, projectName: string): boolean {
  const raw = JSON.parse(listStdout) as unknown;
  const projects = Array.isArray(raw) ? (raw as Json[]) : edges((raw as Json).projects);
  return projects.some((p) => p.name === projectName);
}

/** Output of `railway domain <custom> --json`: the records to create in DNS. */
export function parseCustomDomain(stdout: string): DnsRecord[] {
  const raw = JSON.parse(stdout) as Json;
  const records = (raw.dnsRecords ?? raw.records) as Json[] | undefined;
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error("Unexpected `railway domain --json` output: no dnsRecords");
  }
  return records.map((r) => {
    const type = String(r.type ?? r.recordType ?? "").toUpperCase();
    const host = String(r.host ?? r.hostlabel ?? r.name ?? "");
    const value = String(r.value ?? r.requiredValue ?? r.content ?? "");
    if (!type || !host || !value) throw new Error("Unexpected DNS record shape from `railway domain --json`");
    return { type, host, value };
  });
}

/** Output of `railway domain --service api --json`: the generated *.up.railway.app host. */
export function parseGeneratedDomain(stdout: string): string {
  const raw = JSON.parse(stdout) as Json;
  const value = String(raw.domain ?? raw.url ?? "");
  const host = value.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!host) throw new Error("Unexpected `railway domain --json` output: no domain");
  return host;
}

/**
 * Pin every service to one region (other regions explicitly nulled, since
 * `environment edit` merges) and give the api its health check.
 */
export function regionPatch(serviceIds: Partial<Record<ServiceKey, string>>, region: string): Json {
  const multiRegionConfig: Record<string, { numReplicas: number } | null> = {};
  for (const r of Object.keys(REGIONS)) multiRegionConfig[r] = r === region ? { numReplicas: 1 } : null;
  const services: Json = {};
  for (const [key, id] of Object.entries(serviceIds)) {
    if (!id) continue;
    services[id] = {
      deploy: {
        multiRegionConfig,
        ...(key === "api" ? { healthcheckPath: "/health", healthcheckTimeout: 120 } : {}),
      },
    };
  }
  return { services };
}

export function variablesPatch(perService: { serviceId: string; variables: Record<string, string> }[]): Json {
  const services: Json = {};
  for (const { serviceId, variables } of perService) {
    services[serviceId] = {
      variables: Object.fromEntries(Object.entries(variables).map(([k, v]) => [k, { value: v }])),
    };
  }
  return { services };
}

export const TEMPLATE_QUERY = "query template($code: String!) { template(code: $code) { id serializedConfig } }";
export const WORKSPACE_QUERY = "query project($id: String!) { project(id: $id) { workspaceId } }";
export const TEMPLATE_DEPLOY_MUTATION =
  "mutation deploy($input: TemplateDeployV2Input!) { templateDeployV2(input: $input) { projectId workflowId } }";

export function graphqlData<T>(body: string): T {
  const parsed = JSON.parse(body) as { data?: T; errors?: { message: string }[] };
  if (parsed.errors?.length) throw new Error(`Railway API error: ${parsed.errors.map((e) => e.message).join("; ")}`);
  if (!parsed.data) throw new Error("Railway API returned no data");
  return parsed.data;
}
