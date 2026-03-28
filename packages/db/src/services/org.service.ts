import type { ViewerContext } from "../context.js";
import { assertMinRole } from "../context.js";
import {
  getActiveCoreValues,
  getAllTeams,
  getOrgSettings as queryOrgSettings,
} from "../queries/org.js";
import { getQuestionnairesWithThemes } from "../queries/misc.js";
import { getIntegrations as queryIntegrations } from "../queries/integrations.js";

export async function getOrgConfig(ctx: ViewerContext) {
  // Any authenticated user can read org config (core values, teams)
  const [coreValues, teams] = await Promise.all([
    getActiveCoreValues(ctx.db),
    getAllTeams(ctx.db),
  ]);
  return { coreValues, teams };
}

export async function getOrgSettingsService(ctx: ViewerContext) {
  // Admin only
  assertMinRole(ctx, "admin");
  return queryOrgSettings(ctx.db);
}

export async function getQuestionnaires(ctx: ViewerContext) {
  assertMinRole(ctx, "admin");
  return getQuestionnairesWithThemes(ctx.db);
}

export async function getIntegrationsService(ctx: ViewerContext) {
  assertMinRole(ctx, "admin");
  return queryIntegrations(ctx.db);
}
