import type { FastifyPluginAsync } from "fastify";
import { eq, inArray } from "drizzle-orm";
import {
  campaigns,
  questionnaires,
  questionnaireThemes,
} from "@revualy/db";
import {
  parseBody,
  idParamSchema,
  createCampaignSchema,
  updateCampaignSchema,
  campaignChatSchema,
} from "../../lib/validation.js";
import { requireRole, getAuthenticatedUserId } from "../../lib/rbac.js";
import { getStateRedis } from "../../workers/index.js";

const CAMPAIGN_CHAT_TTL = 24 * 60 * 60; // 24 hours

type CampaignStatus = "draft" | "scheduled" | "collecting" | "analyzing" | "complete";

const VALID_TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  draft: ["scheduled"],
  scheduled: ["collecting", "draft"],
  collecting: ["analyzing"],
  analyzing: ["complete"],
  complete: [],
};

export const campaignRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireRole("admin"));

  // GET /campaigns — List all campaigns with joined questionnaire+themes data
  app.get("/", async (request, reply) => {
    const { db } = request.tenant;

    const allCampaigns = await db.select().from(campaigns);

    if (allCampaigns.length === 0) {
      return reply.send({ data: [] });
    }

    const questionnaireIds = [
      ...new Set(
        allCampaigns
          .map((c) => c.questionnaireId)
          .filter((id): id is string => id !== null),
      ),
    ];

    const questionnairesMap = new Map<string, { id: string; name: string }>();
    let allThemes: Array<typeof questionnaireThemes.$inferSelect> = [];

    if (questionnaireIds.length > 0) {
      const qRows = await db
        .select({ id: questionnaires.id, name: questionnaires.name })
        .from(questionnaires)
        .where(inArray(questionnaires.id, questionnaireIds));

      for (const q of qRows) {
        questionnairesMap.set(q.id, q);
      }

      allThemes = await db
        .select()
        .from(questionnaireThemes)
        .where(inArray(questionnaireThemes.questionnaireId, questionnaireIds))
        .orderBy(questionnaireThemes.sortOrder);
    }

    const themesMap = new Map<string, typeof allThemes>();
    for (const t of allThemes) {
      const list = themesMap.get(t.questionnaireId) ?? [];
      list.push(t);
      themesMap.set(t.questionnaireId, list);
    }

    const data = allCampaigns.map((c) => ({
      ...c,
      questionnaire: c.questionnaireId
        ? {
            ...questionnairesMap.get(c.questionnaireId),
            themes: themesMap.get(c.questionnaireId) ?? [],
          }
        : null,
    }));

    return reply.send({ data });
  });

  // GET /campaigns/:id — Single campaign detail
  app.get("/:id", async (request, reply) => {
    const { id } = parseBody(idParamSchema, request.params);
    const { db } = request.tenant;

    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, id));

    if (!campaign) {
      return reply.code(404).send({ error: "Campaign not found" });
    }

    let questionnaire = null;
    if (campaign.questionnaireId) {
      const [q] = await db
        .select()
        .from(questionnaires)
        .where(eq(questionnaires.id, campaign.questionnaireId));

      if (q) {
        const themes = await db
          .select()
          .from(questionnaireThemes)
          .where(eq(questionnaireThemes.questionnaireId, q.id))
          .orderBy(questionnaireThemes.sortOrder);

        questionnaire = { ...q, themes };
      }
    }

    return reply.send({ ...campaign, questionnaire });
  });

  // POST /campaigns — Create campaign (defaults to draft status)
  app.post("/", async (request, reply) => {
    const { db } = request.tenant;
    const body = parseBody(createCampaignSchema, request.body);
    const userId = getAuthenticatedUserId(request);

    const [created] = await db
      .insert(campaigns)
      .values({
        name: body.name,
        description: body.description ?? "",
        questionnaireId: body.questionnaireId ?? null,
        startDate: body.startDate ?? null,
        endDate: body.endDate ?? null,
        targetAudience: body.targetAudience ?? null,
        targetTeamId: body.targetTeamId ?? null,
        createdByUserId: userId,
        status: "draft",
      })
      .returning();

    return reply.code(201).send(created);
  });

  // PATCH /campaigns/:id — Update campaign fields
  app.patch("/:id", async (request, reply) => {
    const { id } = parseBody(idParamSchema, request.params);
    const { db } = request.tenant;
    const body = parseBody(updateCampaignSchema, request.body);

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.questionnaireId !== undefined) updates.questionnaireId = body.questionnaireId;
    if (body.startDate !== undefined) updates.startDate = body.startDate;
    if (body.endDate !== undefined) updates.endDate = body.endDate;
    if (body.targetAudience !== undefined) updates.targetAudience = body.targetAudience;
    if (body.targetTeamId !== undefined) updates.targetTeamId = body.targetTeamId;

    const [updated] = await db
      .update(campaigns)
      .set(updates)
      .where(eq(campaigns.id, id))
      .returning();

    if (!updated) return reply.code(404).send({ error: "Campaign not found" });
    return reply.send(updated);
  });

  // DELETE /campaigns/:id — Delete campaign
  app.delete("/:id", async (request, reply) => {
    const { id } = parseBody(idParamSchema, request.params);
    const { db } = request.tenant;

    const deleted = await db
      .delete(campaigns)
      .where(eq(campaigns.id, id))
      .returning();

    if (!deleted.length) return reply.code(404).send({ error: "Campaign not found" });
    return reply.send({ id, deleted: true });
  });

  // POST /campaigns/:id/advance — Advance lifecycle with state machine guard
  app.post("/:id/advance", async (request, reply) => {
    const { id } = parseBody(idParamSchema, request.params);
    const { db } = request.tenant;

    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, id));

    if (!campaign) {
      return reply.code(404).send({ error: "Campaign not found" });
    }

    const current = campaign.status as CampaignStatus;
    const allowed = VALID_TRANSITIONS[current] ?? [];

    if (allowed.length === 0) {
      return reply
        .code(400)
        .send({ error: `Cannot advance from ${current} status` });
    }

    const next = allowed[0];

    const [updated] = await db
      .update(campaigns)
      .set({ status: next, updatedAt: new Date() })
      .where(eq(campaigns.id, id))
      .returning();

    return reply.send(updated);
  });

  // POST /campaigns/:id/ai-chat — LLM assistant for campaign design
  app.post("/:id/ai-chat", async (request, reply) => {
    const { id } = parseBody(idParamSchema, request.params);
    const { db } = request.tenant;
    const body = parseBody(campaignChatSchema, request.body);
    const userId = getAuthenticatedUserId(request);

    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, id));

    if (!campaign) {
      return reply.code(404).send({ error: "Campaign not found" });
    }

    let themes: Array<typeof questionnaireThemes.$inferSelect> = [];
    if (campaign.questionnaireId) {
      themes = await db
        .select()
        .from(questionnaireThemes)
        .where(eq(questionnaireThemes.questionnaireId, campaign.questionnaireId))
        .orderBy(questionnaireThemes.sortOrder);
    }

    const redis = getStateRedis();
    const redisKey = `campaign-chat:${id}:${userId}`;

    const raw = await redis.get(redisKey);
    const history: Array<{ role: "user" | "assistant"; content: string }> = raw
      ? (JSON.parse(raw) as Array<{ role: "user" | "assistant"; content: string }>)
      : [];

    const themeSummary =
      themes.length > 0
        ? themes.map((t) => `- ${t.intent}`).join("\n")
        : "No themes configured yet.";

    const systemPrompt = [
      "You are a campaign design assistant helping an HR admin plan a peer review campaign.",
      "",
      `Current campaign: "${campaign.name}"`,
      `Status: ${campaign.status}`,
      campaign.description ? `Description: ${campaign.description}` : "",
      "",
      "Questionnaire themes:",
      themeSummary,
      "",
      "Help the admin refine campaign goals, timing, target audience, and questionnaire themes.",
      "When you have concrete suggestions, list them on separate lines starting with '- '.",
    ]
      .filter(Boolean)
      .join("\n");

    const messages = [
      { role: "system" as const, content: systemPrompt },
      ...history,
      { role: "user" as const, content: body.message },
    ];

    const response = await app.llm.complete({
      messages,
      tier: "fast",
      maxTokens: 1024,
    });

    const assistantContent = response.content;

    const updatedHistory = [
      ...history,
      { role: "user" as const, content: body.message },
      { role: "assistant" as const, content: assistantContent },
    ];

    await redis.setex(redisKey, CAMPAIGN_CHAT_TTL, JSON.stringify(updatedHistory));

    const suggestionLines = assistantContent
      .split("\n")
      .filter((line) => line.trimStart().startsWith("- "))
      .map((line) => line.replace(/^\s*-\s*/, "").trim())
      .filter(Boolean);

    return reply.send({ reply: assistantContent, suggestions: suggestionLines });
  });
};
