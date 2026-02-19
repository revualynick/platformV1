import type { FastifyPluginAsync } from "fastify";
import { eq, and, desc } from "drizzle-orm";
import {
  discoveredThemes,
  coreValues,
  questionnaireThemes,
  questionnaires,
} from "@revualy/db";
import { requireRole, getAuthenticatedUserId } from "../../lib/rbac.js";
import {
  parseBody,
  idParamSchema,
  discoveredThemeQuerySchema,
  triggerDiscoverySchema,
  updateDiscoveredThemeSchema,
  promoteThemeSchema,
} from "../../lib/validation.js";
import { discoverThemes } from "../../lib/theme-discovery-engine.js";

export const themeRoutes: FastifyPluginAsync = async (app) => {
  // GET /discovered — List discovered themes with optional status filter (admin only)
  app.get(
    "/discovered",
    { preHandler: requireRole("admin") },
    async (request, reply) => {
      const { db } = request.tenant;
      const query = parseBody(discoveredThemeQuerySchema, request.query);

      const conditions = [];
      if (query.status) {
        conditions.push(eq(discoveredThemes.status, query.status));
      }

      const rows = await db
        .select({
          theme: discoveredThemes,
          coreValueName: coreValues.name,
        })
        .from(discoveredThemes)
        .leftJoin(
          coreValues,
          eq(discoveredThemes.relatedCoreValueId, coreValues.id),
        )
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(discoveredThemes.discoveredAt))
        .limit(100);

      const data = rows.map((r) => ({
        ...r.theme,
        relatedCoreValueName: r.coreValueName,
      }));

      return reply.send({ data });
    },
  );

  // POST /discover — Trigger a new theme discovery run (admin only)
  app.post(
    "/discover",
    { preHandler: requireRole("admin") },
    async (request, reply) => {
      const { db } = request.tenant;
      getAuthenticatedUserId(request);
      const body = parseBody(triggerDiscoverySchema, request.body);

      const themes = await discoverThemes(db, app.llm, {
        windowDays: body.windowDays,
      });

      if (themes.length === 0) {
        return reply.send({ data: [], message: "No themes discovered" });
      }

      // Resolve core value names to IDs
      const orgValues = await db
        .select({ id: coreValues.id, name: coreValues.name })
        .from(coreValues)
        .where(eq(coreValues.isActive, true));

      const nameToId = new Map(
        orgValues.map((v) => [v.name.toLowerCase(), v.id]),
      );

      // Upsert discovered themes into the database
      const now = new Date();
      const upserted = [];

      for (const theme of themes) {
        const relatedCoreValueId = theme.relatedCoreValueName
          ? nameToId.get(theme.relatedCoreValueName.toLowerCase()) ?? null
          : null;

        // Check if a theme with the same name already exists (case-insensitive)
        const conditions = [eq(discoveredThemes.name, theme.name)];
        const [existing] = await db
          .select({ id: discoveredThemes.id, status: discoveredThemes.status })
          .from(discoveredThemes)
          .where(and(...conditions));

        if (existing) {
          // Update existing theme — but don't overwrite accepted/rejected status
          if (
            existing.status === "accepted" ||
            existing.status === "rejected"
          ) {
            // Just update lastSeenAt and frequency
            const [updated] = await db
              .update(discoveredThemes)
              .set({
                frequency: theme.frequency,
                confidence: theme.confidence,
                lastSeenAt: now,
                sampleEvidence: theme.sampleEvidence,
              })
              .where(eq(discoveredThemes.id, existing.id))
              .returning();
            upserted.push(updated);
          } else {
            const [updated] = await db
              .update(discoveredThemes)
              .set({
                description: theme.description,
                frequency: theme.frequency,
                confidence: theme.confidence,
                relatedCoreValueId,
                sampleEvidence: theme.sampleEvidence,
                lastSeenAt: now,
              })
              .where(eq(discoveredThemes.id, existing.id))
              .returning();
            upserted.push(updated);
          }
        } else {
          // Insert new discovered theme
          const [created] = await db
            .insert(discoveredThemes)
            .values({
              name: theme.name,
              description: theme.description,
              frequency: theme.frequency,
              confidence: theme.confidence,
              relatedCoreValueId,
              sampleEvidence: theme.sampleEvidence,
              discoveredAt: now,
              lastSeenAt: now,
            })
            .returning();
          upserted.push(created);
        }
      }

      return reply.code(201).send({ data: upserted });
    },
  );

  // PATCH /discovered/:id — Update theme status (admin only)
  app.patch(
    "/discovered/:id",
    { preHandler: requireRole("admin") },
    async (request, reply) => {
      const { id } = parseBody(idParamSchema, request.params);
      const { db } = request.tenant;
      getAuthenticatedUserId(request);
      const body = parseBody(updateDiscoveredThemeSchema, request.body);

      const [updated] = await db
        .update(discoveredThemes)
        .set({ status: body.status })
        .where(eq(discoveredThemes.id, id))
        .returning();

      if (!updated) {
        return reply.code(404).send({ error: "Discovered theme not found" });
      }

      return reply.send(updated);
    },
  );

  // POST /discovered/:id/promote — Promote to questionnaire theme (admin only)
  app.post(
    "/discovered/:id/promote",
    { preHandler: requireRole("admin") },
    async (request, reply) => {
      const { id } = parseBody(idParamSchema, request.params);
      const { db } = request.tenant;
      getAuthenticatedUserId(request);
      const body = parseBody(promoteThemeSchema, request.body);

      // Verify the discovered theme exists and is not already accepted
      const [theme] = await db
        .select()
        .from(discoveredThemes)
        .where(eq(discoveredThemes.id, id));

      if (!theme) {
        return reply.code(404).send({ error: "Discovered theme not found" });
      }

      if (theme.status === "accepted" && theme.acceptedAsThemeId) {
        return reply
          .code(409)
          .send({ error: "Theme has already been promoted" });
      }

      // Verify the target questionnaire exists
      const [questionnaire] = await db
        .select({ id: questionnaires.id })
        .from(questionnaires)
        .where(eq(questionnaires.id, body.questionnaireId));

      if (!questionnaire) {
        return reply.code(404).send({ error: "Questionnaire not found" });
      }

      // Get the next sort order for the questionnaire
      const existingThemes = await db
        .select({ sortOrder: questionnaireThemes.sortOrder })
        .from(questionnaireThemes)
        .where(eq(questionnaireThemes.questionnaireId, body.questionnaireId))
        .orderBy(desc(questionnaireThemes.sortOrder))
        .limit(1);

      const nextSortOrder =
        existingThemes.length > 0 ? existingThemes[0].sortOrder + 1 : 0;

      // Create the questionnaire theme and update the discovered theme in a transaction
      const result = await db.transaction(async (tx) => {
        const [newTheme] = await tx
          .insert(questionnaireThemes)
          .values({
            questionnaireId: body.questionnaireId,
            intent: theme.description ?? theme.name,
            dataGoal: `Explore the "${theme.name}" theme identified in peer feedback`,
            examplePhrasings: theme.sampleEvidence ?? [],
            coreValueId: theme.relatedCoreValueId,
            sortOrder: nextSortOrder,
          })
          .returning();

        const [updatedTheme] = await tx
          .update(discoveredThemes)
          .set({
            status: "accepted",
            acceptedAsThemeId: newTheme.id,
          })
          .where(eq(discoveredThemes.id, id))
          .returning();

        return { questionnaireTheme: newTheme, discoveredTheme: updatedTheme };
      });

      return reply.code(201).send(result);
    },
  );
};
