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
} from "drizzle-orm/pg-core";

/**
 * Tenant Schema — per-organization database.
 * Each org gets its own isolated PostgreSQL database with these tables.
 */

// ── Users ──────────────────────────────────────────────

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  role: varchar("role", { length: 50 }).notNull().default("employee"),
  teamId: uuid("team_id").references(() => teams.id),
  managerId: uuid("manager_id"),
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
});

export const userPlatformIdentities = pgTable("user_platform_identities", {
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
});

// ── Teams & Org Config ─────────────────────────────────

export const teams = pgTable("teams", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  managerId: uuid("manager_id"),
  parentTeamId: uuid("parent_team_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

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

export const conversations = pgTable("conversations", {
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
});

export const conversationMessages = pgTable("conversation_messages", {
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
});

// ── Feedback ───────────────────────────────────────────

export const feedbackEntries = pgTable("feedback_entries", {
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
});

export const feedbackValueScores = pgTable("feedback_value_scores", {
  id: uuid("id").primaryKey().defaultRandom(),
  feedbackEntryId: uuid("feedback_entry_id")
    .notNull()
    .references(() => feedbackEntries.id),
  coreValueId: uuid("core_value_id")
    .notNull()
    .references(() => coreValues.id),
  score: real("score").notNull().default(0),
  evidence: text("evidence").notNull().default(""),
});

// ── Kudos ──────────────────────────────────────────────

export const kudos = pgTable("kudos", {
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
});

// ── Engagement ─────────────────────────────────────────

export const engagementScores = pgTable("engagement_scores", {
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
});

// ── Escalations ────────────────────────────────────────

export const escalations = pgTable("escalations", {
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
});

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

// ── Scheduling ─────────────────────────────────────────

export const interactionSchedule = pgTable("interaction_schedule", {
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
});

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

export const calendarEvents = pgTable("calendar_events", {
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
});
