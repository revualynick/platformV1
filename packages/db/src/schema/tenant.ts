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
  ],
);

export const conversationMessages = pgTable(
  "conversation_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id),
    role: varchar("role", { length: 20 }).notNull(), // system | assistant | user
    content: text("content").notNull(),
    platformMessageId: varchar("platform_message_id", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_conversation_messages_conversation_id").on(table.conversationId),
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
    index("idx_feedback_entries_subject_id").on(table.subjectId),
    index("idx_feedback_entries_reviewer_id").on(table.reviewerId),
    index("idx_feedback_entries_created_at").on(table.createdAt),
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
    feedbackEntryId: uuid("feedback_entry_id")
      .notNull()
      .references(() => feedbackEntries.id),
    severity: varchar("severity", { length: 20 }).notNull(),
    reason: text("reason").notNull(),
    flaggedContent: text("flagged_content").notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: uuid("resolved_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_escalations_feedback_entry_id").on(table.feedbackEntryId),
    index("idx_escalations_created_at").on(table.createdAt),
  ],
);

export const escalationAuditLog = pgTable("escalation_audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  escalationId: uuid("escalation_id")
    .notNull()
    .references(() => escalations.id),
  action: varchar("action", { length: 100 }).notNull(),
  performedBy: uuid("performed_by")
    .notNull()
    .references(() => users.id),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ── Questions ──────────────────────────────────────────

export const questions = pgTable("questions", {
  id: uuid("id").primaryKey().defaultRandom(),
  text: text("text").notNull(),
  category: varchar("category", { length: 50 }).notNull(),
  coreValueId: uuid("core_value_id").references(() => coreValues.id),
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

export const questionnaires = pgTable("questionnaires", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  category: varchar("category", { length: 50 }).notNull(), // peer_review | self_reflection | three_sixty | pulse_check
  source: varchar("source", { length: 50 }).notNull().default("custom"), // built_in | custom | imported
  verbatim: boolean("verbatim").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

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

export const pulseCheckTriggers = pgTable("pulse_check_triggers", {
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
});

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
  ],
);
