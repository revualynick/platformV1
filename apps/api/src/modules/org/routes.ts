import type { FastifyPluginAsync } from "fastify";
import { eq } from "drizzle-orm";
import {
  coreValues,
  teams,
  questionnaires,
  questionnaireThemes,
  userRelationships,
  orgSettings,
  integrations,
} from "@revualy/db";
import {
  parseBody,
  idParamSchema,
  qidParamSchema,
  createCoreValueSchema,
  bulkCreateCoreValuesSchema,
  updateCoreValueSchema,
  createQuestionnaireSchema,
  updateQuestionnaireSchema,
  createThemeSchema,
  updateThemeSchema,
  createRelationshipSchema,
  updateOrgSettingsSchema,
  connectIntegrationSchema,
  updateIntegrationSchema,
  platformConfigSchemas,
} from "../../lib/validation.js";
import { requireRole } from "../../lib/rbac.js";
import { encryptConfig } from "../../lib/encryption.js";

export const orgRoutes: FastifyPluginAsync = async (app) => {
  // All admin routes require admin role
  app.addHook("preHandler", requireRole("admin"));
  // ═══════════════════════════════════════════════════════
  // Org config
  // ═══════════════════════════════════════════════════════

  // GET /admin/org — Org configuration (core values, teams)
  app.get("/org", async (request, reply) => {
    const { db } = request.tenant;

    const values = await db
      .select()
      .from(coreValues)
      .where(eq(coreValues.isActive, true))
      .orderBy(coreValues.sortOrder);

    const allTeams = await db.select().from(teams);

    return reply.send({ coreValues: values, teams: allTeams });
  });

  // GET /admin/org-settings — Org profile (name, timezone, allowedDomains)
  app.get("/org-settings", async (request, reply) => {
    const { db } = request.tenant;
    const [settings] = await db.select().from(orgSettings).limit(1);
    if (!settings) return reply.code(404).send({ error: "Org settings not found" });
    return reply.send(settings);
  });

  // PATCH /admin/org — Update org settings (name, timezone, allowedDomains)
  app.patch("/org", async (request, reply) => {
    const { db } = request.tenant;
    const body = parseBody(updateOrgSettingsSchema, request.body);

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) updates.name = body.name;
    if (body.timezone !== undefined) updates.timezone = body.timezone;
    if (body.allowedDomains !== undefined) updates.allowedDomains = body.allowedDomains;

    const [existing] = await db.select({ id: orgSettings.id }).from(orgSettings);
    if (!existing) return reply.code(404).send({ error: "Org settings not found" });

    const [updated] = await db
      .update(orgSettings)
      .set(updates)
      .where(eq(orgSettings.id, existing.id))
      .returning();

    return reply.send(updated);
  });

  // ═══════════════════════════════════════════════════════
  // Core values CRUD
  // ═══════════════════════════════════════════════════════

  app.post("/values", async (request, reply) => {
    const { db } = request.tenant;
    const body = parseBody(createCoreValueSchema, request.body);

    const [created] = await db
      .insert(coreValues)
      .values({
        name: body.name,
        description: body.description ?? "",
        sortOrder: body.sortOrder ?? 0,
      })
      .returning();

    return reply.code(201).send(created);
  });

  // POST /admin/values/bulk — Bulk import core values
  app.post("/values/bulk", async (request, reply) => {
    const { db } = request.tenant;
    const body = parseBody(bulkCreateCoreValuesSchema, request.body);

    const rows = body.values.map((v, i) => ({
      name: v.name,
      description: v.description ?? "",
      sortOrder: v.sortOrder ?? i,
    }));

    const created = await db
      .insert(coreValues)
      .values(rows)
      .returning();

    return reply.code(201).send({
      created: created.length,
      skipped: 0,
      values: created,
    });
  });

  app.patch("/values/:id", async (request, reply) => {
    const { id } = parseBody(idParamSchema, request.params);
    const { db } = request.tenant;
    const body = parseBody(updateCoreValueSchema, request.body);

    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.sortOrder !== undefined) updates.sortOrder = body.sortOrder;
    if (body.isActive !== undefined) updates.isActive = body.isActive;

    const [updated] = await db
      .update(coreValues)
      .set(updates)
      .where(eq(coreValues.id, id))
      .returning();

    if (!updated) return reply.code(404).send({ error: "Core value not found" });
    return reply.send(updated);
  });

  // ═══════════════════════════════════════════════════════
  // Questionnaires CRUD
  // ═══════════════════════════════════════════════════════

  // GET /admin/questionnaires — List all with themes
  app.get("/questionnaires", async (request, reply) => {
    const { db } = request.tenant;

    const allQ = await db.select().from(questionnaires);
    const allThemes = await db
      .select()
      .from(questionnaireThemes)
      .orderBy(questionnaireThemes.sortOrder);

    const themesByQ = new Map<string, typeof allThemes>();
    allThemes.forEach((t) => {
      const list = themesByQ.get(t.questionnaireId) ?? [];
      list.push(t);
      themesByQ.set(t.questionnaireId, list);
    });

    const result = allQ.map((q) => ({
      ...q,
      themes: themesByQ.get(q.id) ?? [],
    }));

    return reply.send({ data: result });
  });

  // POST /admin/questionnaires — Create questionnaire
  app.post("/questionnaires", async (request, reply) => {
    const { db } = request.tenant;
    const body = parseBody(createQuestionnaireSchema, request.body);

    const [created] = await db
      .insert(questionnaires)
      .values({
        name: body.name,
        category: body.category,
        source: body.source ?? "custom",
        verbatim: body.verbatim ?? false,
      })
      .returning();

    // Insert themes if provided
    if (body.themes?.length) {
      await db.insert(questionnaireThemes).values(
        body.themes.map((t, i) => ({
          questionnaireId: created.id,
          intent: t.intent,
          dataGoal: t.dataGoal,
          examplePhrasings: t.examplePhrasings ?? [],
          coreValueId: t.coreValueId ?? null,
          sortOrder: i,
        })),
      );
    }

    // Re-fetch with themes
    const themes = await db
      .select()
      .from(questionnaireThemes)
      .where(eq(questionnaireThemes.questionnaireId, created.id))
      .orderBy(questionnaireThemes.sortOrder);

    return reply.code(201).send({ ...created, themes });
  });

  // PATCH /admin/questionnaires/:id — Update questionnaire metadata
  app.patch("/questionnaires/:id", async (request, reply) => {
    const { id } = parseBody(idParamSchema, request.params);
    const { db } = request.tenant;
    const body = parseBody(updateQuestionnaireSchema, request.body);

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) updates.name = body.name;
    if (body.category !== undefined) updates.category = body.category;
    if (body.verbatim !== undefined) updates.verbatim = body.verbatim;
    if (body.isActive !== undefined) updates.isActive = body.isActive;

    const [updated] = await db
      .update(questionnaires)
      .set(updates)
      .where(eq(questionnaires.id, id))
      .returning();

    if (!updated) return reply.code(404).send({ error: "Questionnaire not found" });
    return reply.send(updated);
  });

  // DELETE /admin/questionnaires/:id — Delete questionnaire (cascade deletes themes)
  app.delete("/questionnaires/:id", async (request, reply) => {
    const { id } = parseBody(idParamSchema, request.params);
    const { db } = request.tenant;

    // Themes cascade-delete via FK constraint
    const deleted = await db
      .delete(questionnaires)
      .where(eq(questionnaires.id, id))
      .returning();

    if (!deleted.length) return reply.code(404).send({ error: "Questionnaire not found" });
    return reply.send({ id, deleted: true });
  });

  // ═══════════════════════════════════════════════════════
  // Questionnaire themes CRUD
  // ═══════════════════════════════════════════════════════

  // POST /admin/questionnaires/:qid/themes — Add a theme
  app.post("/questionnaires/:qid/themes", async (request, reply) => {
    const { qid } = parseBody(qidParamSchema, request.params);
    const { db } = request.tenant;
    const body = parseBody(createThemeSchema, request.body);

    const [created] = await db
      .insert(questionnaireThemes)
      .values({
        questionnaireId: qid,
        intent: body.intent,
        dataGoal: body.dataGoal,
        examplePhrasings: body.examplePhrasings ?? [],
        coreValueId: body.coreValueId ?? null,
        sortOrder: body.sortOrder ?? 0,
      })
      .returning();

    return reply.code(201).send(created);
  });

  // PATCH /admin/themes/:id — Update a theme
  app.patch("/themes/:id", async (request, reply) => {
    const { id } = parseBody(idParamSchema, request.params);
    const { db } = request.tenant;
    const body = parseBody(updateThemeSchema, request.body);

    const updates: Record<string, unknown> = {};
    if (body.intent !== undefined) updates.intent = body.intent;
    if (body.dataGoal !== undefined) updates.dataGoal = body.dataGoal;
    if (body.examplePhrasings !== undefined) updates.examplePhrasings = body.examplePhrasings;
    if (body.coreValueId !== undefined) updates.coreValueId = body.coreValueId;
    if (body.sortOrder !== undefined) updates.sortOrder = body.sortOrder;

    const [updated] = await db
      .update(questionnaireThemes)
      .set(updates)
      .where(eq(questionnaireThemes.id, id))
      .returning();

    if (!updated) return reply.code(404).send({ error: "Theme not found" });
    return reply.send(updated);
  });

  // DELETE /admin/themes/:id — Delete a theme
  app.delete("/themes/:id", async (request, reply) => {
    const { id } = parseBody(idParamSchema, request.params);
    const { db } = request.tenant;

    const deleted = await db
      .delete(questionnaireThemes)
      .where(eq(questionnaireThemes.id, id))
      .returning();

    if (!deleted.length) return reply.code(404).send({ error: "Theme not found" });
    return reply.send({ id, deleted: true });
  });

  // ═══════════════════════════════════════════════════════
  // Relationship graph overrides (admin)
  // ═══════════════════════════════════════════════════════

  // GET /admin/relationships — Full org graph (delegates to relationships module)
  app.get("/relationships", async (request, reply) => {
    const { db } = request.tenant;
    const allRels = await db
      .select()
      .from(userRelationships)
      .where(eq(userRelationships.isActive, true));
    return reply.send({ data: allRels });
  });

  // POST /admin/relationships — Create/override relationship (admin bulk tool)
  app.post("/relationships", async (request, reply) => {
    const { db } = request.tenant;
    const body = parseBody(createRelationshipSchema, request.body);

    const [created] = await db
      .insert(userRelationships)
      .values({
        fromUserId: body.fromUserId,
        toUserId: body.toUserId,
        label: body.label ?? "",
        tags: body.tags ?? [],
        strength: body.strength ?? 0.5,
        source: body.source ?? "manual",
      })
      .returning();

    return reply.code(201).send(created);
  });

  // ═══════════════════════════════════════════════════════
  // Integrations
  // ═══════════════════════════════════════════════════════

  const DEFAULT_PLATFORMS = [
    { platform: "slack", name: "Slack" },
    { platform: "google_chat", name: "Google Chat" },
    { platform: "teams", name: "Microsoft Teams" },
    { platform: "google_calendar", name: "Google Calendar" },
  ];

  // GET /admin/integrations — List all integrations (lazy-seeds defaults if empty)
  app.get("/integrations", async (request, reply) => {
    const { db } = request.tenant;
    let rows = await db.select().from(integrations);
    if (rows.length === 0) {
      await db
        .insert(integrations)
        .values(DEFAULT_PLATFORMS)
        .onConflictDoNothing({ target: integrations.platform });
      rows = await db.select().from(integrations);
    }
    const sanitized = rows.map((r) => ({
      ...r,
      config: undefined,
      hasConfig: !!(r.config && (r.config as Record<string, unknown>)._encrypted),
    }));
    return reply.send({ data: sanitized });
  });

  // PATCH /admin/integrations/:id — Update config/status
  app.patch("/integrations/:id", async (request, reply) => {
    const { id } = parseBody(idParamSchema, request.params);
    const { db } = request.tenant;
    const body = parseBody(updateIntegrationSchema, request.body);

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) updates.name = body.name;
    if (body.config !== undefined) updates.config = { _encrypted: encryptConfig(body.config) };
    if (body.workspace !== undefined) updates.workspace = body.workspace;

    const [updated] = await db
      .update(integrations)
      .set(updates)
      .where(eq(integrations.id, id))
      .returning();

    if (!updated) return reply.code(404).send({ error: "Integration not found" });

    return reply.send({
      ...updated,
      config: undefined,
      hasConfig: !!(updated.config && (updated.config as Record<string, unknown>)._encrypted),
    });
  });

  // POST /admin/integrations/:id/connect — Mark as connected
  app.post("/integrations/:id/connect", async (request, reply) => {
    const { id } = parseBody(idParamSchema, request.params);
    const { db, userId } = request.tenant;
    const body = parseBody(connectIntegrationSchema, request.body);

    // Validate config against platform-specific schema
    if (body.config !== undefined) {
      const [existing] = await db
        .select({ platform: integrations.platform })
        .from(integrations)
        .where(eq(integrations.id, id));
      if (!existing) return reply.code(404).send({ error: "Integration not found" });

      const platformSchema = platformConfigSchemas[existing.platform];
      if (platformSchema) {
        const configResult = platformSchema.safeParse(body.config);
        if (!configResult.success) {
          return reply.code(400).send({
            error: `Invalid config for ${existing.platform}: ${configResult.error.issues[0].message}`,
          });
        }
      }
    }

    const updates: Record<string, unknown> = {
      status: "connected",
      connectedAt: new Date(),
      connectedByUserId: userId ?? null,
      updatedAt: new Date(),
    };
    if (body.config !== undefined) updates.config = { _encrypted: encryptConfig(body.config) };
    if (body.workspace !== undefined) updates.workspace = body.workspace;

    const [updated] = await db
      .update(integrations)
      .set(updates)
      .where(eq(integrations.id, id))
      .returning();

    if (!updated) return reply.code(404).send({ error: "Integration not found" });

    return reply.send({
      ...updated,
      config: undefined,
      hasConfig: !!(updated.config && (updated.config as Record<string, unknown>)._encrypted),
    });
  });

  // POST /admin/integrations/:id/disconnect — Mark as disconnected
  app.post("/integrations/:id/disconnect", async (request, reply) => {
    const { id } = parseBody(idParamSchema, request.params);
    const { db } = request.tenant;

    const [updated] = await db
      .update(integrations)
      .set({
        status: "disconnected",
        workspace: null,
        connectedAt: null,
        connectedByUserId: null,
        config: {},
        updatedAt: new Date(),
      })
      .where(eq(integrations.id, id))
      .returning();

    if (!updated) return reply.code(404).send({ error: "Integration not found" });
    const { config: _config, ...rest } = updated;
    return reply.send(rest);
  });
};
