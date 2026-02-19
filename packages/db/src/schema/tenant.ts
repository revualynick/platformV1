import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  real,
  timestamp,
  date,
  jsonb,
  index,
  unique,
} from "drizzle-orm/pg-core";

/**
 * Tenant Schema — per-organization database.
 * Each org gets its own isolated PostgreSQL database with these tables.
 */

// ── Users ──────────────────────────────────────────────

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    name: varchar("name", { length: 255 }).notNull(),
    role: varchar("role", { length: 50 }).notNull().default("employee"),
    teamId: uuid("team_id").references(() => teams.id),
    managerId: uuid("manager_id"), // self-reference added via raw SQL in migration
    timezone: varchar("timezone", { length: 100 }).notNull().default("UTC"),
    isActive: boolean("is_active").notNull().default(true),
    onboardingCompleted: boolean("onboarding_completed")
      .notNull()
      .default(false),
    preferences: jsonb("preferences").$type<{
      preferredInteractionTime?: string;
      weeklyInteractionTarget?: number;
      quietDays?: number[];
    }>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_users_team_id").on(table.teamId),
    index("idx_users_manager_id").on(table.managerId),
    index("idx_users_is_active").on(table.isActive),
    index("idx_users_role").on(table.role),
  ],
);

export const userPlatformIdentities = pgTable(
  "user_platform_identities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    platform: varchar("platform", { length: 50 }).notNull(),
    platformUserId: varchar("platform_user_id", { length: 255 }).notNull(),
    platformWorkspaceId: varchar("platform_workspace_id", {
      length: 255,
    }).notNull(),
    displayName: varchar("display_name", { length: 255 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("uq_user_platform").on(table.userId, table.platform),
    unique("uq_platform_user_id").on(table.platform, table.platformUserId),
    index("idx_platform_identities_platform_user").on(
      table.platform,
      table.platformUserId,
    ),
  ],
);

// ── Teams & Org Config ─────────────────────────────────

export const teams = pgTable(
  "teams",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 255 }).notNull(),
    managerId: uuid("manager_id"), // FK to users added via raw SQL in migration
    parentTeamId: uuid("parent_team_id"), // self-reference added via raw SQL in migration
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_teams_parent_team_id").on(table.parentTeamId),
    index("idx_teams_manager_id").on(table.managerId),
  ],
);

export const coreValues = pgTable("core_values", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description").notNull().default(""),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ── Conversations ──────────────────────────────────────

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reviewerId: uuid("reviewer_id")
      .notNull()
      .references(() => users.id),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => users.id),
    interactionType: varchar("interaction_type", { length: 50 }).notNull(),
    platform: varchar("platform", { length: 50 }).notNull(),
    platformChannelId: varchar("platform_channel_id", { length: 255 }).notNull(),
    status: varchar("status", { length: 50 }).notNull().default("scheduled"),
    messageCount: integer("message_count").notNull().default(0),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    initiatedAt: timestamp("initiated_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_conversations_reviewer_id").on(table.reviewerId),
    index("idx_conversations_subject_id").on(table.subjectId),
    index("idx_conversations_status").on(table.status),
    index("idx_conversations_scheduled_at").on(table.scheduledAt),
    index("idx_conversations_reviewer_created").on(table.reviewerId, table.createdAt),
  ],
);

export const conversationMessages = pgTable(
  "conversation_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 20 }).notNull(), // system | assistant | user
    content: text("content").notNull(),
    platformMessageId: varchar("platform_message_id", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_conversation_messages_conversation_id").on(table.conversationId),
    index("idx_conversation_messages_conv_created").on(table.conversationId, table.createdAt),
  ],
);

// ── Feedback ───────────────────────────────────────────

export const feedbackEntries = pgTable(
  "feedback_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id),
    reviewerId: uuid("reviewer_id")
      .notNull()
      .references(() => users.id),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => users.id),
    interactionType: varchar("interaction_type", { length: 50 }).notNull(),
    rawContent: text("raw_content").notNull(), // encrypt via pgcrypto
    aiSummary: text("ai_summary").notNull().default(""),
    sentiment: varchar("sentiment", { length: 20 }).notNull().default("neutral"),
    engagementScore: real("engagement_score").notNull().default(0),
    wordCount: integer("word_count").notNull().default(0),
    hasSpecificExamples: boolean("has_specific_examples")
      .notNull()
      .default(false),
    // embedding: vector('embedding', { dimensions: 1536 }), // enable when pgvector extension is added
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("uq_feedback_entry_conversation").on(table.conversationId),
    index("idx_feedback_entries_subject_id").on(table.subjectId),
    index("idx_feedback_entries_reviewer_id").on(table.reviewerId),
    index("idx_feedback_entries_created_at").on(table.createdAt),
    index("idx_feedback_entries_subject_created").on(table.subjectId, table.createdAt),
  ],
);

export const feedbackValueScores = pgTable(
  "feedback_value_scores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    feedbackEntryId: uuid("feedback_entry_id")
      .notNull()
      .references(() => feedbackEntries.id),
    coreValueId: uuid("core_value_id")
      .notNull()
      .references(() => coreValues.id),
    score: real("score").notNull().default(0),
    evidence: text("evidence").notNull().default(""),
  },
  (table) => [
    index("idx_feedback_value_scores_entry_id").on(table.feedbackEntryId),
  ],
);

// ── Kudos ──────────────────────────────────────────────

export const kudos = pgTable(
  "kudos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    giverId: uuid("giver_id")
      .notNull()
      .references(() => users.id),
    receiverId: uuid("receiver_id")
      .notNull()
      .references(() => users.id),
    message: text("message").notNull(),
    coreValueId: uuid("core_value_id").references(() => coreValues.id),
    source: varchar("source", { length: 20 }).notNull().default("chat"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_kudos_giver_id").on(table.giverId),
    index("idx_kudos_receiver_id").on(table.receiverId),
    index("idx_kudos_created_at").on(table.createdAt),
  ],
);

// ── Engagement ─────────────────────────────────────────

export const engagementScores = pgTable(
  "engagement_scores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    weekStarting: date("week_starting").notNull(),
    interactionsCompleted: integer("interactions_completed").notNull().default(0),
    interactionsTarget: integer("interactions_target").notNull().default(3),
    averageQualityScore: real("average_quality_score").notNull().default(0),
    responseRate: real("response_rate").notNull().default(0),
    streak: integer("streak").notNull().default(0),
    rank: integer("rank"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_engagement_scores_user_id").on(table.userId),
    index("idx_engagement_scores_week_starting").on(table.weekStarting),
    unique("uq_engagement_user_week").on(table.userId, table.weekStarting),
  ],
);

// ── Escalations ────────────────────────────────────────

export const escalations = pgTable(
  "escalations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    feedbackEntryId: uuid("feedback_entry_id").references(
      () => feedbackEntries.id,
    ),
    reporterId: uuid("reporter_id").references(() => users.id),
    subjectId: uuid("subject_id").references(() => users.id),
    type: varchar("type", { length: 50 }).notNull().default("other"), // harassment | bias | retaliation | other
    severity: varchar("severity", { length: 20 }).notNull(), // low | medium | high | critical
    status: varchar("status", { length: 20 }).notNull().default("open"), // open | investigating | resolved | dismissed
    reason: text("reason").notNull(),
    description: text("description").notNull().default(""),
    flaggedContent: text("flagged_content").notNull().default(""),
    resolution: text("resolution"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedById: uuid("resolved_by_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_escalations_feedback_entry_id").on(table.feedbackEntryId),
    index("idx_escalations_status").on(table.status),
    index("idx_escalations_subject_id").on(table.subjectId),
    index("idx_escalations_reporter_id").on(table.reporterId),
    index("idx_escalations_created_at").on(table.createdAt),
    // Unique partial index on feedbackEntryId (applied via migration 0011)
    // uniqueIndex("uq_escalation_feedback_entry").on(table.feedbackEntryId).where(sql`feedback_entry_id IS NOT NULL`),
  ],
);

export const escalationNotes = pgTable(
  "escalation_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    escalationId: uuid("escalation_id")
      .notNull()
      .references(() => escalations.id, { onDelete: "cascade" }),
    action: varchar("action", { length: 100 }).notNull(),
    performedBy: uuid("performed_by")
      .notNull()
      .references(() => users.id),
    content: text("content").notNull().default(""),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_escalation_notes_escalation_created").on(table.escalationId, table.createdAt),
  ],
);

// ── Questions ──────────────────────────────────────────

export const questions = pgTable("questions", {
  id: uuid("id").primaryKey().defaultRandom(),
  text: text("text").notNull(),
  category: varchar("category", { length: 50 }).notNull(),
  coreValueId: uuid("core_value_id").references(() => coreValues.id, { onDelete: "set null" }),
  isSystemDefault: boolean("is_system_default").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ── Relationships (Threads) ───────────────────────────

export const userRelationships = pgTable(
  "user_relationships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fromUserId: uuid("from_user_id")
      .notNull()
      .references(() => users.id),
    toUserId: uuid("to_user_id")
      .notNull()
      .references(() => users.id),
    label: varchar("label", { length: 255 }).notNull().default(""),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    strength: real("strength").notNull().default(0.5), // 0–1
    source: varchar("source", { length: 50 }).notNull().default("manual"), // manual | calendar | chat
    notes: text("notes"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_user_relationships_from_user_id").on(table.fromUserId),
    index("idx_user_relationships_to_user_id").on(table.toUserId),
    index("idx_user_relationships_is_active").on(table.isActive),
  ],
);

// ── Questionnaires ────────────────────────────────────

export const questionnaires = pgTable(
  "questionnaires",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 255 }).notNull(),
    category: varchar("category", { length: 50 }).notNull(), // peer_review | self_reflection | three_sixty | pulse_check
    source: varchar("source", { length: 50 }).notNull().default("custom"), // built_in | custom | imported
    verbatim: boolean("verbatim").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdByUserId: uuid("created_by_user_id").references(() => users.id), // null = org-wide (admin), set = manager-owned
    teamScope: uuid("team_scope").references(() => teams.id), // null = org-wide
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_questionnaires_created_by").on(table.createdByUserId),
    index("idx_questionnaires_team_scope").on(table.teamScope),
  ],
);

export const questionnaireThemes = pgTable(
  "questionnaire_themes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    questionnaireId: uuid("questionnaire_id")
      .notNull()
      .references(() => questionnaires.id, { onDelete: "cascade" }),
    intent: text("intent").notNull(),
    dataGoal: text("data_goal").notNull(),
    examplePhrasings: jsonb("example_phrasings")
      .$type<string[]>()
      .notNull()
      .default([]),
    coreValueId: uuid("core_value_id").references(() => coreValues.id),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_questionnaire_themes_questionnaire_id").on(table.questionnaireId),
  ],
);

// ── Scheduling ─────────────────────────────────────────

export const interactionSchedule = pgTable(
  "interaction_schedule",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    interactionType: varchar("interaction_type", { length: 50 }).notNull(),
    subjectId: uuid("subject_id").references(() => users.id),
    conversationId: uuid("conversation_id").references(() => conversations.id),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_interaction_schedule_user_id").on(table.userId),
    index("idx_interaction_schedule_scheduled_at").on(table.scheduledAt),
    index("idx_interaction_schedule_status").on(table.status),
  ],
);

// ── Pulse Checks ───────────────────────────────────────

export const pulseCheckTriggers = pgTable(
  "pulse_check_triggers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceType: varchar("source_type", { length: 50 }).notNull(),
    sourceRef: text("source_ref").notNull(),
    sentiment: varchar("sentiment", { length: 50 }),
    followUpConversationId: uuid("follow_up_conversation_id").references(
      () => conversations.id,
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_pulse_check_triggers_source_type").on(table.sourceType),
    index("idx_pulse_check_triggers_created_at").on(table.createdAt),
  ],
);

export const pulseCheckConfig = pgTable("pulse_check_config", {
  id: uuid("id").primaryKey().defaultRandom(),
  negativeSentimentThreshold: integer("negative_sentiment_threshold")
    .notNull()
    .default(2),
  windowDays: integer("window_days").notNull().default(7),
  cooldownDays: integer("cooldown_days").notNull().default(14),
  isEnabled: boolean("is_enabled").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ── Notification Preferences ──────────────────────────

export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    type: varchar("type", { length: 50 }).notNull(), // weekly_digest | flag_alert | nudge | leaderboard_update
    enabled: boolean("enabled").notNull().default(true),
    channel: varchar("channel", { length: 20 }).notNull().default("email"), // email | in_app (future)
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("uq_notification_pref_user_type").on(table.userId, table.type),
    index("idx_notification_preferences_user_id").on(table.userId),
  ],
);

// ── Calendar Tokens ───────────────────────────────────

export const calendarTokens = pgTable(
  "calendar_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    provider: varchar("provider", { length: 20 }).notNull(), // google | outlook
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("uq_calendar_token_user_provider").on(table.userId, table.provider),
    index("idx_calendar_tokens_user_id").on(table.userId),
  ],
);

// ── One-on-One Sessions ───────────────────────────────

export const oneOnOneSessions = pgTable(
  "one_on_one_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    managerId: uuid("manager_id")
      .notNull()
      .references(() => users.id),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => users.id),
    status: varchar("status", { length: 20 }).notNull().default("scheduled"), // scheduled | active | completed | cancelled
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    notes: text("notes").notNull().default(""),
    summary: text("summary").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_one_on_one_sessions_pair").on(table.managerId, table.employeeId),
    index("idx_one_on_one_sessions_status").on(table.status),
    index("idx_one_on_one_sessions_scheduled_at").on(table.scheduledAt),
  ],
);

export const oneOnOneActionItems = pgTable(
  "one_on_one_action_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => oneOnOneSessions.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    assigneeId: uuid("assignee_id").references(() => users.id),
    dueDate: date("due_date"),
    completed: boolean("completed").notNull().default(false),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_one_on_one_action_items_session").on(table.sessionId),
    index("idx_one_on_one_action_items_assignee").on(table.assigneeId, table.completed),
  ],
);

export const oneOnOneAgendaItems = pgTable(
  "one_on_one_agenda_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => oneOnOneSessions.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    source: varchar("source", { length: 20 }).notNull().default("manual"), // ai | manual
    covered: boolean("covered").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_one_on_one_agenda_items_session").on(table.sessionId),
  ],
);

// ── Self Reflections ──────────────────────────────────

export const selfReflections = pgTable(
  "self_reflections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    conversationId: uuid("conversation_id").references(() => conversations.id),
    weekStarting: date("week_starting").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    mood: varchar("mood", { length: 20 }),
    highlights: text("highlights"),
    challenges: text("challenges"),
    goalForNextWeek: text("goal_for_next_week"),
    engagementScore: integer("engagement_score"),
    promptTheme: varchar("prompt_theme", { length: 100 }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("uq_self_reflection_user_week").on(table.userId, table.weekStarting),
    index("idx_self_reflections_user_id").on(table.userId),
    index("idx_self_reflections_status").on(table.status),
    index("idx_self_reflections_week_starting").on(table.weekStarting),
  ],
);

// ── Calendar Events ────────────────────────────────────

// ── Manager Notes ─────────────────────────────────────

export const managerNotes = pgTable(
  "manager_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    managerId: uuid("manager_id")
      .notNull()
      .references(() => users.id),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => users.id),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_manager_notes_manager_subject").on(table.managerId, table.subjectId),
  ],
);

// ── Calibration Reports ───────────────────────────────

export const calibrationReports = pgTable(
  "calibration_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: text("org_id").notNull(),
    weekStarting: date("week_starting").notNull(),
    data: jsonb("data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("uq_calibration_report_org_week").on(table.orgId, table.weekStarting),
    index("idx_calibration_reports_week_starting").on(table.weekStarting),
  ],
);

// ── 360 Reviews ───────────────────────────────────────

export const threeSixtyReviews = pgTable(
  "three_sixty_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => users.id),
    initiatedById: uuid("initiated_by_id")
      .notNull()
      .references(() => users.id),
    status: varchar("status", { length: 20 }).notNull().default("collecting"),
    targetReviewerCount: integer("target_reviewer_count").notNull().default(5),
    completedReviewerCount: integer("completed_reviewer_count").default(0),
    aggregatedData: jsonb("aggregated_data"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_three_sixty_reviews_subject_id").on(table.subjectId),
    index("idx_three_sixty_reviews_status").on(table.status),
    index("idx_three_sixty_reviews_initiated_by").on(table.initiatedById),
  ],
);

export const threeSixtyResponses = pgTable(
  "three_sixty_responses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reviewId: uuid("review_id")
      .notNull()
      .references(() => threeSixtyReviews.id, { onDelete: "cascade" }),
    reviewerId: uuid("reviewer_id")
      .notNull()
      .references(() => users.id),
    feedbackEntryId: uuid("feedback_entry_id").references(
      () => feedbackEntries.id,
    ),
    conversationId: uuid("conversation_id").references(
      () => conversations.id,
    ),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    invitedAt: timestamp("invited_at", { withTimezone: true }).defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_three_sixty_responses_review_id").on(table.reviewId),
    index("idx_three_sixty_responses_reviewer_id").on(table.reviewerId),
    unique("uq_three_sixty_response_review_reviewer").on(
      table.reviewId,
      table.reviewerId,
    ),
  ],
);

// ── Discovered Themes ─────────────────────────────────

export const discoveredThemes = pgTable(
  "discovered_themes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    frequency: integer("frequency").notNull().default(0),
    confidence: real("confidence").notNull().default(0),
    trend: varchar("trend", { length: 20 }).default("stable"), // rising | stable | declining
    relatedCoreValueId: uuid("related_core_value_id").references(
      () => coreValues.id,
      { onDelete: "set null" },
    ),
    sampleEvidence: jsonb("sample_evidence").$type<string[]>().default([]),
    status: varchar("status", { length: 20 }).default("suggested"), // suggested | accepted | rejected | archived
    acceptedAsThemeId: uuid("accepted_as_theme_id").references(
      () => questionnaireThemes.id,
      { onDelete: "set null" },
    ),
    discoveredAt: timestamp("discovered_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_discovered_themes_status").on(table.status),
    index("idx_discovered_themes_discovered_at").on(table.discoveredAt),
  ],
);

// ── Calendar Events ────────────────────────────────────

export const calendarEvents = pgTable(
  "calendar_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    externalEventId: varchar("external_event_id", { length: 255 }).notNull(),
    title: varchar("title", { length: 500 }).notNull(),
    attendees: jsonb("attendees").$type<string[]>().notNull().default([]),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    source: varchar("source", { length: 20 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("uq_calendar_user_event").on(table.userId, table.externalEventId),
    index("idx_calendar_events_user_id").on(table.userId),
    index("idx_calendar_events_start_at").on(table.startAt),
    index("idx_calendar_events_user_start").on(table.userId, table.startAt),
  ],
);
