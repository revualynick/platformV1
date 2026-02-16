import { z } from "zod";

// ── Shared primitives ──────────────────────────────────

const uuid = z.string().uuid();

// ── Org / Core Values ──────────────────────────────────

export const createCoreValueSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const updateCoreValueSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

// ── Questionnaires ─────────────────────────────────────

const themeInputSchema = z.object({
  intent: z.string().min(1).max(1000),
  dataGoal: z.string().min(1).max(1000),
  examplePhrasings: z.array(z.string().max(500)).max(10).optional(),
  coreValueId: uuid.optional(),
});

export const createQuestionnaireSchema = z.object({
  name: z.string().min(1).max(255),
  category: z.enum(["peer_review", "self_reflection", "three_sixty", "pulse_check"]),
  source: z.string().max(50).optional(),
  verbatim: z.boolean().optional(),
  themes: z.array(themeInputSchema).max(20).optional(),
});

export const updateQuestionnaireSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  category: z.enum(["peer_review", "self_reflection", "three_sixty", "pulse_check"]).optional(),
  verbatim: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export const createThemeSchema = z.object({
  intent: z.string().min(1).max(1000),
  dataGoal: z.string().min(1).max(1000),
  examplePhrasings: z.array(z.string().max(500)).max(10).optional(),
  coreValueId: uuid.optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const updateThemeSchema = z.object({
  intent: z.string().min(1).max(1000).optional(),
  dataGoal: z.string().min(1).max(1000).optional(),
  examplePhrasings: z.array(z.string().max(500)).max(10).optional(),
  coreValueId: uuid.nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

// ── Users ──────────────────────────────────────────────

export const updateUserSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  role: z.enum(["employee", "manager", "admin"]).optional(),
  teamId: uuid.nullable().optional(),
  timezone: z.string().max(100).optional(),
  preferences: z
    .object({
      preferredInteractionTime: z.string().max(10).optional(),
      weeklyInteractionTarget: z.number().int().min(1).max(10).optional(),
      quietDays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
    })
    .optional(),
});

export const updateManagerSchema = z.object({
  managerId: uuid.nullable(),
});

// ── Relationships ──────────────────────────────────────

export const createRelationshipSchema = z.object({
  fromUserId: uuid,
  toUserId: uuid,
  label: z.string().max(500).optional(),
  tags: z.array(z.string().max(100)).max(20).optional(),
  strength: z.number().min(0).max(1).optional(),
  source: z.enum(["manual", "calendar", "chat"]).optional(),
  notes: z.string().max(5000).optional(),
});

export const updateRelationshipSchema = z.object({
  label: z.string().max(500).optional(),
  tags: z.array(z.string().max(100)).max(20).optional(),
  strength: z.number().min(0).max(1).optional(),
  notes: z.string().max(5000).optional(),
  isActive: z.boolean().optional(),
});

// ── Notifications ─────────────────────────────────────

export const updateNotificationPrefSchema = z.object({
  type: z.enum(["weekly_digest", "flag_alert", "nudge", "leaderboard_update"]),
  enabled: z.boolean(),
  channel: z.enum(["email"]).optional(),
});

// ── Kudos ─────────────────────────────────────────────

export const createKudosSchema = z.object({
  receiverId: uuid,
  message: z.string().min(1).max(5000),
  coreValueId: uuid.optional(),
});

export const kudosQuerySchema = z.object({
  userId: uuid.optional(),
});

// ── Manager Notes ────────────────────────────────────

export const createManagerNoteSchema = z.object({
  subjectId: uuid,
  content: z.string().min(1).max(10000),
});

export const updateManagerNoteSchema = z.object({
  content: z.string().min(1).max(10000),
});

export const managerNoteQuerySchema = z.object({
  subjectId: uuid,
});

// ── One-on-One Notes ─────────────────────────────────

export const createOneOnOneEntrySchema = z.object({
  partnerId: uuid,
  content: z.string().min(1).max(10000),
});

export const updateOneOnOneEntrySchema = z.object({
  content: z.string().min(1).max(10000),
});

export const oneOnOneQuerySchema = z.object({
  partnerId: uuid,
  search: z.string().max(500).optional(),
});

// ── Params ─────────────────────────────────────────────

export const idParamSchema = z.object({
  id: uuid,
});

export const qidParamSchema = z.object({
  qid: uuid,
});

// ── Helpers ────────────────────────────────────────────

/**
 * Parse request body/params with a Zod schema.
 * Throws a 400 if validation fails with a clear error message.
 */
export function parseBody<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown,
): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const errors = result.error.issues.map(
      (i) => `${i.path.join(".")}: ${i.message}`,
    );
    const err = new Error(`Validation failed: ${errors.join("; ")}`);
    (err as any).statusCode = 400;
    throw err;
  }
  return result.data;
}
