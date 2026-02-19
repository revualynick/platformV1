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

export const listUsersQuerySchema = z.object({
  teamId: z.string().uuid().optional(),
  managerId: z.string().uuid().optional(),
  limit: z.string().optional(),
});

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

// ── One-on-One Sessions ──────────────────────────────

export const createSessionSchema = z.object({
  employeeId: uuid,
  scheduledAt: z.string().datetime().refine(
    (dt) => new Date(dt) > new Date(),
    { message: "scheduledAt must be in the future" },
  ),
});

export const updateSessionSchema = z.object({
  status: z.enum(["scheduled", "active", "completed", "cancelled"]).optional(),
  notes: z.string().max(100000).optional(),
  summary: z.string().max(10000).optional(),
  scheduledAt: z.string().datetime().optional(),
});

export const sessionQuerySchema = z.object({
  employeeId: uuid.optional(),
  status: z.enum(["scheduled", "active", "completed", "cancelled"]).optional(),
});

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD format");

export const createActionItemSchema = z.object({
  text: z.string().min(1).max(2000),
  assigneeId: uuid.optional(),
  dueDate: dateString.optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const updateActionItemSchema = z.object({
  text: z.string().min(1).max(2000).optional(),
  assigneeId: uuid.nullable().optional(),
  dueDate: dateString.nullable().optional(),
  completed: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const createAgendaItemSchema = z.object({
  text: z.string().min(1).max(2000),
  source: z.enum(["ai", "manual"]).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const updateAgendaItemSchema = z.object({
  covered: z.boolean().optional(),
  text: z.string().min(1).max(2000).optional(),
});

// ── Escalations ──────────────────────────────────────

export const createEscalationSchema = z.object({
  subjectId: uuid.optional(),
  feedbackEntryId: uuid.optional(),
  type: z.enum(["harassment", "bias", "retaliation", "other"]).optional().default("other"),
  severity: z.enum(["low", "medium", "high", "critical"]),
  reason: z.string().min(1).max(5000),
  description: z.string().max(10000).optional().default(""),
  flaggedContent: z.string().max(10000).optional().default(""),
});

export const updateEscalationSchema = z.object({
  status: z.enum(["open", "investigating", "resolved", "dismissed"]).optional(),
  resolution: z.string().max(10000).optional(),
  severity: z.enum(["low", "medium", "high", "critical"]).optional(),
});

export const escalationQuerySchema = z.object({
  status: z.enum(["open", "investigating", "resolved", "dismissed"]).optional(),
  severity: z.enum(["low", "medium", "high", "critical"]).optional(),
});

export const createEscalationNoteSchema = z.object({
  content: z.string().min(1).max(10000),
  action: z.string().min(1).max(100).optional().default("Note added"),
});

// ── 360 Reviews ─────────────────────────────────────

export const createThreeSixtySchema = z.object({
  subjectId: uuid,
  reviewerIds: z.array(uuid).min(3).max(15),
});

export const updateThreeSixtyResponseSchema = z.object({
  status: z.enum(["completed", "declined"]),
});

export const threeSixtyCompleteSchema = z.object({
  force: z.boolean().optional().default(false),
});

// ── Pulse Check Config ───────────────────────────────

export const updatePulseCheckConfigSchema = z.object({
  negativeSentimentThreshold: z.number().int().min(1).max(50).optional(),
  windowDays: z.number().int().min(1).max(90).optional(),
  cooldownDays: z.number().int().min(1).max(90).optional(),
  isEnabled: z.boolean().optional(),
});

export const userIdParamSchema = z.object({
  userId: uuid,
});

// ── Data Export ──────────────────────────────────────

export const exportQuerySchema = z.object({
  format: z.enum(["csv", "json"]).default("json"),
  blind: z.preprocess((v) => v === "true" || v === true, z.boolean()).default(false),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export const exportUsersQuerySchema = z.object({
  format: z.enum(["csv", "json"]).default("json"),
});

// ── Self Reflections ────────────────────────────────

export const completeReflectionSchema = z.object({
  mood: z.enum(["energized", "focused", "reflective", "tired", "optimistic", "stressed"]),
  highlights: z.string().max(2000).optional(),
  challenges: z.string().max(2000).optional(),
  goalForNextWeek: z.string().max(2000).optional(),
});

// ── Theme Discovery ─────────────────────────────────

export const triggerDiscoverySchema = z.object({
  windowDays: z.number().int().min(7).max(90).default(30),
});

export const discoveredThemeQuerySchema = z.object({
  status: z.enum(["suggested", "accepted", "rejected", "archived"]).optional(),
});

export const updateDiscoveredThemeSchema = z.object({
  status: z.enum(["accepted", "rejected", "archived"]),
});

export const promoteThemeSchema = z.object({
  questionnaireId: uuid,
});

// ── Params ─────────────────────────────────────────────

export const idParamSchema = z.object({
  id: uuid,
});

export const qidParamSchema = z.object({
  qid: uuid,
});

export const sessionItemParamSchema = z.object({
  id: uuid,
  itemId: uuid,
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
