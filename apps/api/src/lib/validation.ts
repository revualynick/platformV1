import { z } from "zod";

// ── Shared primitives ──────────────────────────────────

const uuid = z.string().uuid();

// ── Org / Core Values ──────────────────────────────────

export const createCoreValueSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const bulkCreateCoreValuesSchema = z.object({
  values: z.array(createCoreValueSchema).min(1).max(100),
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

export const createUserSchema = z.object({
  email: z.string().email().max(255),
  name: z.string().min(1).max(255),
  role: z.enum(["employee", "manager", "admin", "super_admin"]).optional(),
  teamId: uuid.optional(),
  managerId: uuid.optional(),
  timezone: z.string().max(100).optional(),
});

export const bulkCreateUsersSchema = z.object({
  users: z.array(createUserSchema).min(1).max(500),
});

export const updateOrgSettingsSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  timezone: z.string().max(100).optional(),
  allowedDomains: z.array(z.string().max(255)).optional(),
  checkInTitleMarker: z.string().min(1).max(100).optional(),
  oneOnOneIngestionMode: z.enum(["automatic", "semi_automatic", "manual"]).optional(),
});

export const listUsersQuerySchema = z.object({
  teamId: z.string().uuid().optional(),
  managerId: z.string().uuid().optional(),
  limit: z.string().optional(),
});

export const updateUserSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  role: z.enum(["employee", "manager", "admin", "super_admin"]).optional(),
  teamId: uuid.nullable().optional(),
  timezone: z.string().max(100).optional(),
  preferences: z
    .object({
      preferredInteractionTime: z.string().max(10).optional(),
      // Total check-ins a week: one peer plus one or two personal (see weeklyQuota).
      weeklyInteractionTarget: z.number().int().min(2).max(3).optional(),
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
  type: z.enum(["weekly_digest", "flag_alert", "nudge", "assessment_invite"]),
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

// ── 1:1 ingestion ─────────────────────────────────────

/** Manual upload of a 1:1 notes or transcript file (processed in memory, never stored). */
export const uploadOneOnOneSchema = z.object({
  /** The other person in the 1:1 (the uploader's manager or direct report). */
  counterpartId: uuid,
  fileName: z.string().min(1).max(255),
  /** Base64 file content; the decoded size limit is checked in the route. */
  contentBase64: z.string().min(1).max(8_000_000),
  /** When the 1:1 happened (defaults to now). */
  meetingDate: dateString.optional(),
});

export const betweenMeetingGoalQuerySchema = z.object({
  /** Only goals shared with this person (the other side of the 1:1). */
  withUserId: uuid.optional(),
  status: z.enum(["active", "done", "dropped"]).optional(),
});

export const updateBetweenMeetingGoalSchema = z
  .object({
    text: z.string().min(1).max(500).optional(),
    status: z.enum(["active", "done", "dropped"]).optional(),
    visibility: z.enum(["private", "shareable"]).optional(),
    shareReason: z.string().min(1).max(300).optional(),
  })
  .refine((b) => b.visibility !== "shareable" || !!b.shareReason, {
    message: "shareReason is required to make an item shareable",
    path: ["shareReason"],
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
  // Blind by default (privacy step 2): only an explicit blind=false shows
  // subject names and raw text. Reviewers are never named either way.
  blind: z.preprocess((v) => (v === undefined ? undefined : !(v === "false" || v === false)), z.boolean()).default(true),
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

// ── Team Insights ─────────────────────────────────────

export const monthParamSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, "Must be YYYY-MM format"),
});

// ── Campaigns ────────────────────────────────────────

export const createCampaignSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(5000).optional(),
  questionnaireId: uuid.optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD format").optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD format").optional(),
  targetAudience: z.string().max(100).optional(),
  targetTeamId: uuid.optional(),
});

export const updateCampaignSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(5000).optional(),
  questionnaireId: uuid.nullable().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD format").nullable().optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD format").nullable().optional(),
  targetAudience: z.string().max(100).nullable().optional(),
  targetTeamId: uuid.nullable().optional(),
});

export const campaignChatSchema = z.object({
  message: z.string().min(1).max(5000),
});

// ── Integrations ─────────────────────────────────────

const slackConfigSchema = z.object({
  bot_token: z.string().min(1),
  signing_secret: z.string().min(1),
}).strict();

const gchatConfigSchema = z.object({
  service_account_json: z.string().min(1),
  project_id: z.string().min(1),
}).strict();

const teamsConfigSchema = z.object({
  app_id: z.string().min(1),
  app_password: z.string().min(1),
  tenant_id: z.string().min(1),
}).strict();

const googleCalendarConfigSchema = z.object({
  client_id: z.string().min(1),
  client_secret: z.string().min(1),
}).strict();

export const platformConfigSchemas: Record<string, z.ZodSchema> = {
  slack: slackConfigSchema,
  google_chat: gchatConfigSchema,
  teams: teamsConfigSchema,
  google_calendar: googleCalendarConfigSchema,
};

export const connectIntegrationSchema = z.object({
  config: z.record(z.string()).optional(),
  workspace: z.string().max(255).optional(),
});

export const updateIntegrationSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  config: z.record(z.string()).optional(),
  workspace: z.string().max(255).optional(),
});

// ── Lead Capture (Demo Mode) ─────────────────────────

export const leadCaptureSchema = z.object({
  email: z.string().email().max(255),
  name: z.string().max(255).optional(),
});

// ── Assessments & Profiling ─────────────────────────────

export const frameworkParamSchema = z.object({
  framework: z.enum(["colour", "cdm"]),
});

export const startSessionSchema = z.object({
  framework: z.enum(["colour", "cdm"]),
  context: z.enum(["onboarding", "quarterly", "coaching", "retake"]).optional(),
});

export const submitSessionSchema = z.object({
  responses: z.record(z.string().uuid(), z.string().min(1)), // questionId → option key
});

export const profileQuerySchema = z.object({
  framework: z.enum(["colour", "cdm"]).optional(),
});

export const profileTimelineQuerySchema = z.object({
  framework: z.enum(["colour", "cdm"]),
  source: z.enum(["assessment", "behavioral", "all"]).optional(),
});

export const teamProfileQuerySchema = z.object({
  framework: z.enum(["colour", "cdm"]),
});

export const createDevelopmentGoalSchema = z.object({
  framework: z.enum(["colour", "cdm"]),
  dimension: z.string().min(1).max(30),
  targetDirection: z.enum(["increase", "decrease"]),
  baselineSnapshotId: uuid.optional(),
  notes: z.string().max(5000).optional(),
});

export const updateDevelopmentGoalSchema = z.object({
  status: z.enum(["active", "achieved", "paused"]).optional(),
  notes: z.string().max(5000).optional(),
});

// ── Goals ──────────────────────────────────────────────

const goalLevel = z.enum(["org", "team", "individual", "personal"]);
const goalStatus = z.enum([
  "draft",
  "on_track",
  "at_risk",
  "behind",
  "achieved",
  "archived",
]);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

export const createGoalCycleSchema = z
  .object({
    name: z.string().min(1).max(100),
    startDate: isoDate,
    endDate: isoDate,
  })
  .refine((c) => c.endDate > c.startDate, {
    message: "endDate must be after startDate",
    path: ["endDate"],
  });

export const updateGoalCycleSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    startDate: isoDate.optional(),
    endDate: isoDate.optional(),
  })
  .refine(
    (c) => !c.startDate || !c.endDate || c.endDate > c.startDate,
    { message: "endDate must be after startDate", path: ["endDate"] },
  );

const goalMetricFields = {
  metricName: z.string().min(1).max(255).nullish(),
  metricStartValue: z.number().finite().nullish(),
  metricTargetValue: z.number().finite().nullish(),
  metricCurrentValue: z.number().finite().nullish(),
};

function metricAllOrNone(
  g: {
    metricName?: string | null;
    metricStartValue?: number | null;
    metricTargetValue?: number | null;
    metricCurrentValue?: number | null;
  },
  ctx: z.RefinementCtx,
) {
  const parts = [
    g.metricName,
    g.metricStartValue,
    g.metricTargetValue,
    g.metricCurrentValue,
  ];
  const set = parts.filter((p) => p !== null && p !== undefined).length;
  if (set !== 0 && set !== parts.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        "metric fields (name, start, target, current) must be provided together",
      path: ["metricName"],
    });
  }
}

export const createGoalSchema = z
  .object({
    level: goalLevel,
    title: z.string().min(1).max(255),
    description: z.string().max(5000).default(""),
    parentGoalId: uuid.nullish(),
    cycleId: uuid.nullish(),
    teamId: uuid.nullish(),
    ownerId: uuid,
    status: goalStatus.default("on_track"),
    progressPercent: z.number().int().min(0).max(100).default(0),
    ...goalMetricFields,
    shareWithManager: z.boolean().default(false),
    targetDate: isoDate.nullish(),
  })
  .superRefine((g, ctx) => {
    metricAllOrNone(g, ctx);
    if (g.level === "personal") {
      if (g.parentGoalId || g.cycleId || g.teamId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "personal goals cannot have a parent, cycle, or team",
          path: ["level"],
        });
      }
    } else {
      if (!g.cycleId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${g.level} goals require a cycleId`,
          path: ["cycleId"],
        });
      }
      if (g.level !== "org" && !g.parentGoalId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${g.level} goals must ladder to a parent goal`,
          path: ["parentGoalId"],
        });
      }
      if (g.level === "org" && g.parentGoalId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "org goals cannot have a parent",
          path: ["parentGoalId"],
        });
      }
      if (g.level === "team" && !g.teamId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "team goals require a teamId",
          path: ["teamId"],
        });
      }
    }
  });

export const updateGoalSchema = z
  .object({
    title: z.string().min(1).max(255).optional(),
    description: z.string().max(5000).optional(),
    parentGoalId: uuid.nullish(),
    status: goalStatus.optional(),
    progressPercent: z.number().int().min(0).max(100).optional(),
    ...goalMetricFields,
    shareWithManager: z.boolean().optional(),
    targetDate: isoDate.nullish(),
  })
  .superRefine(metricAllOrNone);

export const createGoalUpdateSchema = z
  .object({
    progressPercent: z.number().int().min(0).max(100).optional(),
    metricCurrentValue: z.number().finite().optional(),
    status: goalStatus.optional(),
    note: z.string().max(5000).default(""),
  })
  .refine(
    (u) =>
      u.progressPercent !== undefined ||
      u.metricCurrentValue !== undefined ||
      u.status !== undefined ||
      u.note.length > 0,
    { message: "a check-in must include progress, metric, status, or a note" },
  );

export const goalListQuerySchema = z.object({
  level: goalLevel.optional(),
  cycleId: uuid.optional(),
  teamId: uuid.optional(),
  ownerId: uuid.optional(),
  parentGoalId: uuid.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

export const goalLadderQuerySchema = z.object({
  cycleId: uuid.optional(),
});

export const applySuggestionSchema = z.object({
  progressPercent: z.number().int().min(0).max(100).optional(),
  metricCurrentValue: z.number().finite().optional(),
  status: goalStatus.optional(),
  note: z.string().max(5000).optional(),
});

export const suggestionListQuerySchema = z.object({
  status: z.enum(["pending", "applied", "dismissed"]).optional(),
});

export const managerReviewEscalationSchema = z.object({
  action: z.enum(["investigate", "dismiss"]),
  note: z.string().max(5000).optional(),
});

// ── Params ─────────────────────────────────────────────

export const idParamSchema = z.object({
  id: uuid,
});

export const qidParamSchema = z.object({
  qid: uuid,
});

export const teamIdParamSchema = z.object({
  teamId: uuid,
});

export const sessionItemParamSchema = z.object({
  id: uuid,
  itemId: uuid,
});

// ── Data imports ───────────────────────────────────────

/** File uploads come as base64 JSON (no multipart plugin); 20 MB decoded is about 27 MB encoded. */
export const importUploadSchema = z.object({
  kind: z.enum(["people", "goals", "feedback", "org_chart"]),
  fileName: z.string().min(1).max(255),
  contentType: z.string().min(1).max(100),
  dataBase64: z.string().min(1).max(28_000_000),
  sourceSystem: z.string().regex(/^[a-z0-9_-]{1,50}$/).optional(),
});

export const importMappingSchema = z.object({
  mapping: z
    .object({
      columns: z.record(z.string().max(100), z.string().max(200)),
      dateFormat: z.enum(["iso", "dmy", "mdy"]),
    })
    .optional(),
  acceptLowConfidence: z.boolean().optional(),
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
