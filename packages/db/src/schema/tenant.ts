import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  real,
  doublePrecision,
  timestamp,
  date,
  jsonb,
  index,
  unique,
  primaryKey,
  customType,
  uniqueIndex,
  bigint,
  char,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import {
  encryptField,
  decryptField,
  isEncryptedValue,
  legacyReadsAllowed,
} from "@revualy/shared/server";
import { registerEncryptedColumn } from "../encrypted-columns.js";

/**
 * A `text` column encrypted at rest (AES-256-GCM, see @revualy/shared
 * crypto). Encryption happens in the ORM mapping, so every insert, update
 * and select through Drizzle is covered in both the API and the web app,
 * and no call site can forget. The Postgres type stays `text`, so switching
 * a column needs no migration; legacy plaintext rows read back unchanged
 * until the backfill rewrites them (and are refused once
 * ENCRYPTION_LEGACY_READS=off).
 *
 * The associated data is "table.column", so a value copied into another
 * column will not decrypt.
 *
 * Limits: encrypted columns cannot be filtered, sorted, searched or indexed
 * in SQL (every write uses a fresh IV), and raw `sql` selects bypass the
 * mapping and return ciphertext. Empty strings are stored as-is.
 */
export function encryptedText(table: string, column: string) {
  const aad = `${table}.${column}`;
  registerEncryptedColumn({ table, column, kind: "text", aad });
  return customType<{ data: string; driverData: string }>({
    dataType() {
      return "text";
    },
    toDriver(value) {
      return encryptField(value, aad);
    },
    fromDriver(value) {
      return decryptField(value, aad);
    },
  })(column);
}

/** Empty JSON hides nothing, so {} and [] are stored as they are (like ''). */
export function isEmptyJson(value: unknown): boolean {
  if (Array.isArray(value)) return value.length === 0;
  return (
    typeof value === "object" && value !== null && Object.keys(value as object).length === 0
  );
}

/**
 * A `jsonb` column encrypted at rest. The whole value is serialised,
 * encrypted with AAD "table.column" and stored as a JSON string
 * (`"enc:v1:..."`), so the Postgres type stays `jsonb` and switching a
 * column needs no migration. Legacy rows (plain JSON) read back unchanged
 * until the backfill rewrites them, and are refused once
 * ENCRYPTION_LEGACY_READS=off. {} and [] are stored as they are.
 *
 * Limits: as encryptedText, plus no jsonb operators (->, @>) in SQL.
 */
export function encryptedJson<T>(table: string, column: string) {
  const aad = `${table}.${column}`;
  registerEncryptedColumn({ table, column, kind: "json", aad });
  return customType<{ data: T; driverData: unknown }>({
    dataType() {
      return "jsonb";
    },
    toDriver(value) {
      // postgres.js sends jsonb parameters as given (drizzle sets a
      // pass-through serialiser), so this must be JSON text.
      if (value === null || value === undefined || isEmptyJson(value)) return JSON.stringify(value ?? null);
      return JSON.stringify(encryptField(JSON.stringify(value), aad));
    },
    fromDriver(value) {
      // postgres.js parses jsonb, so an encrypted value arrives as a string.
      if (typeof value === "string" && isEncryptedValue(value)) {
        return JSON.parse(decryptField(value, aad)) as T;
      }
      if (value !== null && !isEmptyJson(value) && !legacyReadsAllowed()) {
        throw new Error(
          `Refusing an unencrypted value in ${aad} (ENCRYPTION_LEGACY_READS=off). Run the encryption backfill.`,
        );
      }
      return value as T;
    },
  })(column);
}

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
    // Set by people imports (migration 0040).
    jobTitle: varchar("job_title", { length: 255 }),
    startDate: date("start_date"),
    isActive: boolean("is_active").notNull().default(true),
    onboardingCompleted: boolean("onboarding_completed")
      .notNull()
      .default(false),
    preferences: jsonb("preferences").$type<{
      preferredInteractionTime?: string;
      weeklyInteractionTarget?: number;
      /** Set by the "stop" chat keyword; the scheduler skips them until "start". */
      chatPaused?: boolean;
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
    }).notNull().default(""),
    displayName: varchar("display_name", { length: 255 }).notNull().default(""),
    // How to DM them: Slack user id, Google Chat space name (spaces/...),
    // Teams conversation id. Required once status is "reachable".
    dmAddress: varchar("dm_address", { length: 255 }),
    status: varchar("status", { length: 20 })
      .$type<"linked" | "reachable">()
      .notNull()
      .default("linked"),
    linkSource: varchar("link_source", { length: 20 })
      .$type<"auto" | "admin" | "manager" | "self">()
      .notNull()
      .default("admin"),
    linkedByUserId: uuid("linked_by_user_id").references(() => users.id, { onDelete: "set null" }),
    // Manual links must be confirmed by the person before feedback flows.
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  // CHECK constraints (status, link_source, reachable needs dm_address) live
  // in migration 0032.
  (table) => [
    unique("uq_user_platform").on(table.userId, table.platform),
    unique("uq_platform_user_id").on(table.platform, table.platformUserId),
    index("idx_platform_identities_platform_user").on(
      table.platform,
      table.platformUserId,
    ),
  ],
);

/** Audit trail of chat account link changes. actorUserId null = system. */
export const identityLinkEvents = pgTable(
  "identity_link_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    platform: varchar("platform", { length: 50 }).notNull(),
    platformUserId: varchar("platform_user_id", { length: 255 }).notNull(),
    action: varchar("action", { length: 20 })
      .$type<"link" | "unlink" | "confirm" | "reject" | "reachable" | "unreachable">()
      .notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_identity_link_events_user").on(table.userId, table.createdAt.desc()),
  ],
);

export type InboundOutcome =
  | "conversation_reply"
  | "late_addition"
  | "identity_confirmation"
  | "keyword"
  | "paused"
  | "unknown_sender"
  | "no_open_conversation";

/**
 * Inbound ledger: every chat message is stored here by the webhook before it
 * is queued (content encrypted), deduplicated on the platform message id.
 * The worker resolves it and records the outcome. See migration 0032.
 */
export const inboundMessages = pgTable(
  "inbound_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    platform: varchar("platform", { length: 50 }).notNull(),
    platformMessageId: varchar("platform_message_id", { length: 255 }).notNull(),
    platformUserId: varchar("platform_user_id", { length: 255 }).notNull(),
    platformChannelId: varchar("platform_channel_id", { length: 255 }).notNull(),
    threadId: varchar("thread_id", { length: 255 }),
    content: encryptedText("inbound_messages", "content").notNull().default(""),
    truncated: boolean("truncated").notNull().default(false),
    status: varchar("status", { length: 20 })
      .$type<"pending" | "processed">()
      .notNull()
      .default("pending"),
    outcome: varchar("outcome", { length: 30 }).$type<InboundOutcome>(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    // When the chat platform says it was sent (its clock; evidence only).
    sentAt: timestamp("sent_at", { withTimezone: true }),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (table) => [
    unique("uq_inbound_platform_message").on(table.platform, table.platformMessageId),
    index("idx_inbound_pending").on(table.receivedAt).where(sql`status = 'pending'`),
    index("idx_inbound_received").on(table.receivedAt),
    index("idx_inbound_unknown_sender")
      .on(table.platform, table.platformUserId)
      .where(sql`outcome = 'unknown_sender'`),
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
    // Persisted so an in-progress conversation can be reconstructed from the DB
    // after Redis state loss (nullable: legacy rows + non-questionnaire flows).
    questionnaireId: uuid("questionnaire_id").references(() => questionnaires.id, {
      onDelete: "set null",
    }),
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
    // Turn state (migration 0033): conversation state lives here, not Redis.
    selectedThemeIds: jsonb("selected_theme_ids").$type<string[]>().notNull().default([]),
    currentThemeIndex: integer("current_theme_index").notNull().default(0),
    phase: varchar("phase", { length: 20 })
      .$type<"opening" | "exploring" | "follow_up" | "closing">()
      .notNull()
      .default("opening"),
    followUpCount: integer("follow_up_count").notNull().default(0),
    threadId: varchar("thread_id", { length: 255 }),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Optimistic concurrency: commit a turn only if `turn` is unchanged.
    turn: integer("turn").notNull().default(0),
    // Makes scheduled initiation idempotent (unique when set).
    // AnyPgColumn breaks the type cycle (interaction_schedule also references
    // conversations).
    scheduleEntryId: uuid("schedule_entry_id").references((): AnyPgColumn => interactionSchedule.id, {
      onDelete: "set null",
    }),
    // The shared meeting it opens with (migration 0038), and how it is
    // described ("the Q3 planning call on Wednesday"); encrypted, titles
    // can be sensitive.
    anchorEventId: uuid("anchor_event_id").references((): AnyPgColumn => calendarEvents.id, { onDelete: "set null" }),
    anchorLabel: encryptedText("conversations", "anchor_label"),
    // What the calendar model suggested asking about (migration 0039).
    // Background for the bot's questions, never quoted; encrypted.
    anchorFocus: encryptedText("conversations", "anchor_focus"),
  },
  (table) => [
    uniqueIndex("uq_conversations_schedule_entry")
      .on(table.scheduleEntryId)
      .where(sql`schedule_entry_id IS NOT NULL`),
    index("idx_conversations_open_by_reviewer")
      .on(table.reviewerId, table.createdAt.desc())
      .where(sql`status IN ('initiated', 'in_progress')`),
    index("idx_conversations_open_activity")
      .on(table.lastActivityAt)
      .where(sql`status IN ('initiated', 'in_progress')`),
    index("idx_conversations_reviewer_id").on(table.reviewerId),
    index("idx_conversations_subject_id").on(table.subjectId),
    index("idx_conversations_status").on(table.status),
    index("idx_conversations_scheduled_at").on(table.scheduledAt),
    index("idx_conversations_reviewer_created").on(table.reviewerId, table.createdAt),
  ],
);

export type ThemeOutcome = "answered" | "weak" | "unanswered";

/**
 * How each theme went in a conversation (migration 0037). Created when a
 * theme is first asked (or unreached at the end), judged from the reply.
 */
export const conversationThemeOutcomes = pgTable(
  "conversation_theme_outcomes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    themeId: uuid("theme_id").references(() => questionnaireThemes.id, { onDelete: "set null" }),
    reviewerId: uuid("reviewer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Null for self-reflections.
    subjectId: uuid("subject_id").references(() => users.id, { onDelete: "cascade" }),
    interactionType: varchar("interaction_type", { length: 50 }).notNull(),
    outcome: varchar("outcome", { length: 20 }).$type<ThemeOutcome>().notNull().default("unanswered"),
    followUpCount: integer("follow_up_count").notNull().default(0),
    // As first asked; null if never reached. Encrypted: it can name the subject.
    questionText: encryptedText("conversation_theme_outcomes", "question_text"),
    judgedBy: varchar("judged_by", { length: 20 }).$type<"llm" | "fallback">(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (table) => [
    uniqueIndex("uq_theme_outcome_conversation_theme").on(table.conversationId, table.themeId),
    index("idx_theme_outcomes_reviewer_recent")
      .on(table.reviewerId, table.createdAt.desc())
      .where(sql`outcome IN ('weak', 'unanswered')`),
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
    content: encryptedText("conversation_messages", "content").notNull(),
    platformMessageId: varchar("platform_message_id", { length: 255 }),
    // Write time (clock_timestamp, migration 0035). Display only: order by seq.
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),
    // User messages: when the chat platform says it was sent (its clock).
    sentAt: timestamp("sent_at", { withTimezone: true }),
    // Outbox (migration 0033): set when the platform accepted the message.
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    // Insertion order (migration 0034). Always order messages by seq, never
    // created_at, which is fixed at transaction start.
    seq: bigint("seq", { mode: "number" }).generatedAlwaysAsIdentity(),
  },
  (table) => [
    uniqueIndex("uq_conv_msg_platform_id")
      .on(table.conversationId, table.platformMessageId)
      .where(sql`platform_message_id IS NOT NULL`),
    index("idx_conversation_messages_undelivered")
      .on(table.createdAt)
      .where(sql`role = 'assistant' AND delivered_at IS NULL`),
    index("idx_conversation_messages_conv_seq").on(table.conversationId, table.seq),
    index("idx_conversation_messages_conversation_id").on(table.conversationId),
    index("idx_conversation_messages_conv_created").on(table.conversationId, table.createdAt),
  ],
);

// ── Feedback ───────────────────────────────────────────

export const feedbackEntries = pgTable(
  "feedback_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Null once the (named) conversation is deleted after its retention
    // window (migration 0043).
    conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
    // Tier A: HMAC pseudonym of the reviewer (apps/api/src/lib/pseudonym.ts),
    // never their user id (migration 0043).
    reviewerRef: varchar("reviewer_ref", { length: 64 }).notNull(),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => users.id),
    interactionType: varchar("interaction_type", { length: 50 }).notNull(),
    rawContent: encryptedText("feedback_entries", "raw_content").notNull(), // encrypted at rest (AES-256-GCM)
    aiSummary: encryptedText("feedback_entries", "ai_summary").notNull().default(""),
    sentiment: varchar("sentiment", { length: 20 }).notNull().default("neutral"),
    engagementScore: real("engagement_score").notNull().default(0),
    wordCount: integer("word_count").notNull().default(0),
    hasSpecificExamples: boolean("has_specific_examples")
      .notNull()
      .default(false),
    // embedding: vector('embedding', { dimensions: 1536 }), // enable when pgvector extension is added
    // Analysed from an `incomplete` conversation (migration 0036): shown,
    // labelled, but excluded from quality averages and completed counts.
    isPartial: boolean("is_partial").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("uq_feedback_entry_conversation").on(table.conversationId),
    index("idx_feedback_entries_subject_id").on(table.subjectId),
    index("idx_feedback_entries_reviewer_ref").on(table.reviewerRef),
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
    evidence: encryptedText("feedback_value_scores", "evidence").notNull().default(""),
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
    message: encryptedText("kudos", "message").notNull(),
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
    reason: encryptedText("escalations", "reason").notNull(),
    description: encryptedText("escalations", "description").notNull().default(""),
    flaggedContent: encryptedText("escalations", "flagged_content").notNull().default(""),
    resolution: encryptedText("escalations", "resolution"),
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
    content: encryptedText("escalation_notes", "content").notNull().default(""),
    notes: encryptedText("escalation_notes", "notes"),
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
    // Enables DB-level dedup (ON CONFLICT DO NOTHING) for calendar-inferred
    // relationships so concurrent syncs can't create duplicate directional rows.
    unique("uq_user_relationship_pair").on(table.fromUserId, table.toUserId),
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

// ── Campaigns ─────────────────────────────────────────

export const campaigns = pgTable(
  "campaigns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description").notNull().default(""),
    questionnaireId: uuid("questionnaire_id").references(
      () => questionnaires.id,
    ),
    status: varchar("status", { length: 20 })
      .notNull()
      .default("draft"), // draft | scheduled | collecting | analyzing | complete
    startDate: date("start_date"),
    endDate: date("end_date"),
    targetAudience: varchar("target_audience", { length: 100 }),
    targetTeamId: uuid("target_team_id").references(() => teams.id),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_campaigns_status").on(table.status),
    index("idx_campaigns_questionnaire_id").on(table.questionnaireId),
    index("idx_campaigns_target_team_id").on(table.targetTeamId),
    index("idx_campaigns_created_by").on(table.createdByUserId),
    index("idx_campaigns_start_date").on(table.startDate),
  ],
);

// ── Feedback Digests ──────────────────────────────────

export const feedbackDigests = pgTable(
  "feedback_digests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id").references(() => teams.id),
    managerId: uuid("manager_id")
      .notNull()
      .references(() => users.id),
    monthStarting: date("month_starting").notNull(),
    // Encrypted (tier 2: derived from feedback).
    data: encryptedJson<{
        memberSummaries: Array<{
          userId: string;
          name: string;
          feedbackCount: number;
          avgSentiment: number;
          sentimentTrend: "improving" | "stable" | "declining";
          topThemes: string[];
          languageQuality: number;
        }>;
        teamHealth: {
          overallSentiment: number;
          participationRate: number;
          topValues: string[];
          themeFrequency: Record<string, number>;
          languagePatterns: {
            constructive: number;
            vague: number;
          };
        };
        feedbackEntryIds: string[];
      }>("feedback_digests", "data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("uq_feedback_digest_manager_month").on(
      table.managerId,
      table.monthStarting,
    ),
    index("idx_feedback_digests_manager_id").on(table.managerId),
    index("idx_feedback_digests_team_id").on(table.teamId),
    index("idx_feedback_digests_month_starting").on(table.monthStarting),
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
    conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
    // The shared meeting this check-in is about (migration 0038).
    anchorEventId: uuid("anchor_event_id").references((): AnyPgColumn => calendarEvents.id, { onDelete: "set null" }),
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

export type CheckinJobStatus = "proposed" | "scheduled" | "used" | "rejected" | "expired";

/**
 * Check-ins proposed ahead of scheduling (migration 0039): who to ask
 * about which recent meeting, and what to focus on. The calendar model
 * writes them nightly; the scheduler takes the best unexpired one first.
 * Rejected proposals are kept, with the rule that rejected them, so the
 * model can be evaluated. Reason and focus are encrypted: both are free
 * text about named colleagues.
 */
export const checkinJobs = pgTable(
  "checkin_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reviewerId: uuid("reviewer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Null for self-reflection jobs, and for rejected proposals naming nobody real.
    subjectId: uuid("subject_id").references(() => users.id, { onDelete: "cascade" }),
    anchorEventId: uuid("anchor_event_id").references((): AnyPgColumn => calendarEvents.id, { onDelete: "set null" }),
    interactionType: varchar("interaction_type", { length: 50 }).notNull(),
    reason: encryptedText("checkin_jobs", "reason").notNull().default(""),
    focus: encryptedText("checkin_jobs", "focus").notNull().default(""),
    sensitivity: varchar("sensitivity", { length: 10 }).$type<"low" | "medium" | "high">().notNull(),
    // The model's judgement; the title is repeated only if safeMeetingTitle() also allows it.
    titleSafe: boolean("title_safe").notNull().default(false),
    priority: integer("priority").notNull().default(3),
    status: varchar("status", { length: 20 }).$type<CheckinJobStatus>().notNull().default("proposed"),
    source: varchar("source", { length: 20 }).$type<"calendar_model" | "rules">().notNull(),
    model: varchar("model", { length: 100 }),
    rejectionReason: varchar("rejection_reason", { length: 50 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    unique("uq_checkin_jobs_pair").on(table.reviewerId, table.subjectId, table.anchorEventId),
    index("idx_checkin_jobs_lookup").on(table.reviewerId, table.status, table.priority.desc()),
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
      { onDelete: "set null" },
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
    type: varchar("type", { length: 50 }).notNull(), // weekly_digest | flag_alert | nudge
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
    // Space-separated granted OAuth scopes. Empty for tokens issued
    // before scope tracking — those users must reconnect to grant
    // drive.readonly for check-in transcript access.
    scopes: text("scopes").notNull().default(""),
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
    notes: encryptedText("one_on_one_sessions", "notes").notNull().default(""),
    summary: encryptedText("one_on_one_sessions", "summary").notNull().default(""),
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
    text: encryptedText("one_on_one_action_items", "text").notNull(),
    assigneeId: uuid("assignee_id").references(() => users.id),
    dueDate: date("due_date"),
    completed: boolean("completed").notNull().default(false),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    sortOrder: integer("sort_order").notNull().default(0),
    // Migration 0041: private | shareable. Shareable only for items that by
    // nature involve other people, with the reason recorded.
    visibility: varchar("visibility", { length: 20 }).notNull().default("private"),
    shareReason: encryptedText("one_on_one_action_items", "share_reason"),
    // The ingested 1:1 this task came from (null for tasks typed by hand).
    sourceMeetingId: uuid("source_meeting_id").references((): AnyPgColumn => checkInMeetings.id, { onDelete: "set null" }),
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
    text: encryptedText("one_on_one_agenda_items", "text").notNull(),
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
    highlights: encryptedText("self_reflections", "highlights"),
    challenges: encryptedText("self_reflections", "challenges"),
    goalForNextWeek: encryptedText("self_reflections", "goal_for_next_week"),
    engagementScore: integer("engagement_score"),
    promptTheme: varchar("prompt_theme", { length: 100 }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    // Set when the person completes or edits it; analysis then only fills
    // fields they left empty (migration 0035).
    personEditedAt: timestamp("person_edited_at", { withTimezone: true }),
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
    content: encryptedText("manager_notes", "content").notNull(),
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
    data: encryptedJson<unknown>("calibration_reports", "data").notNull(), // encrypted (tier 2)
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
    aggregatedData: encryptedJson<unknown>("three_sixty_reviews", "aggregated_data"), // encrypted (tier 2)
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
    // Tier A pseudonym (migration 0043); the invitee list is not kept by name.
    reviewerRef: varchar("reviewer_ref", { length: 64 }).notNull(),
    feedbackEntryId: uuid("feedback_entry_id").references(
      () => feedbackEntries.id,
    ),
    conversationId: uuid("conversation_id").references(
      () => conversations.id,
      { onDelete: "set null" },
    ),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    invitedAt: timestamp("invited_at", { withTimezone: true }).defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_three_sixty_responses_review_id").on(table.reviewId),
    index("idx_three_sixty_responses_reviewer_ref").on(table.reviewerRef),
    uniqueIndex("uq_three_sixty_response_review_reviewer").on(
      table.reviewId,
      table.reviewerRef,
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
    sampleEvidence: encryptedJson<string[]>("discovered_themes", "sample_evidence").default([]), // encrypted (tier 2)
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
    // Attendees who declined (migration 0038): never asked about this meeting.
    declined: jsonb("declined").$type<string[]>().notNull().default([]),
    // Google visibility: "default" | "public" | "private" | "confidential".
    visibility: varchar("visibility", { length: 20 }).notNull().default("default"),
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

// ── Auth Tables (NextAuth.js) ─────────────────────────
// Per-tenant deployment: auth tables live in the same DB as business data.

export const authUsers = pgTable("auth_user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  // Revualy-specific columns (synced on sign-in)
  orgId: uuid("org_id"),
  tenantUserId: uuid("tenant_user_id").unique(),
  role: varchar("role", { length: 50 }),
  teamId: uuid("team_id"),
  onboardingCompleted: boolean("onboarding_completed").default(false),
});

export const authAccounts = pgTable(
  "auth_account",
  {
    userId: text("userId")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
  ],
);

export const authSessions = pgTable("auth_session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const authVerificationTokens = pgTable(
  "auth_verification_token",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (verificationToken) => [
    primaryKey({
      columns: [verificationToken.identifier, verificationToken.token],
    }),
  ],
);

// ── Org Settings ────────────────────────────────────
// Single-row table for per-tenant organization metadata.

export const orgSettings = pgTable("org_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull().default("My Organization"),
  subdomain: varchar("subdomain", { length: 100 }).notNull().default(""),
  timezone: varchar("timezone", { length: 100 }).notNull().default("UTC"),
  allowedDomains: jsonb("allowed_domains").$type<string[]>().notNull().default([]),
  // Calendar events whose title contains this marker are treated as
  // goal check-in meetings by the transcript pipeline.
  checkInTitleMarker: varchar("check_in_title_marker", { length: 100 })
    .notNull()
    .default("[Check-in]"),
  // How 1:1s are ingested (migration 0041): automatic | semi_automatic | manual.
  oneOnOneIngestionMode: varchar("one_on_one_ingestion_mode", { length: 20 })
    .notNull()
    .default("semi_automatic"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ── Integrations ──────────────────────────────────────

// One chat platform per tenant: migration 0032 adds a partial unique index
// (uq_integrations_one_chat_platform) allowing at most one connected row
// among slack / google_chat / teams. Not expressible in Drizzle.
export const integrations = pgTable(
  "integrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    platform: varchar("platform", { length: 50 }).notNull().unique(),
    name: varchar("name", { length: 255 }).notNull(),
    status: varchar("status", { length: 50 }).notNull().default("disconnected"),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    workspace: varchar("workspace", { length: 255 }),
    connectedAt: timestamp("connected_at", { withTimezone: true }),
    connectedByUserId: uuid("connected_by_user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

// ── Leads (demo/marketing site) ──────────────────────
// Used when DEMO_MODE=true for lead capture before demo chat.

export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 255 }).notNull(),
    name: varchar("name", { length: 255 }),
    /** Conversations started today (reset when conversationDate changes) */
    countToday: integer("count_today").notNull().default(0),
    /** Date (YYYY-MM-DD) of the last conversation — used to reset countToday */
    conversationDate: date("conversation_date"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("uq_leads_email").on(table.email),
    index("idx_leads_email").on(table.email),
  ],
);

// ── Profiling: Assessment Questions ─────────────────────
// Quiz content for colour and CDM frameworks.

export const assessmentQuestions = pgTable(
  "assessment_questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    framework: varchar("framework", { length: 20 }).notNull(), // colour | cdm
    questionType: varchar("question_type", { length: 20 }).notNull(), // forced_choice | scenario
    text: text("text").notNull(),
    options: jsonb("options")
      .$type<
        Array<{ key: string; text: string; scores: Record<string, number> }>
      >()
      .notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_assessment_questions_framework").on(table.framework),
  ],
);

// ── Profiling: Assessment Sessions ──────────────────────
// Each time a user takes a quiz.

export const assessmentSessions = pgTable(
  "assessment_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    framework: varchar("framework", { length: 20 }).notNull(),
    context: varchar("context", { length: 30 }).notNull().default("onboarding"),
    // questionId → selected option key. Encrypted (tier 2).
    responses: encryptedJson<Record<string, string>>("assessment_sessions", "responses")
      .notNull()
      .default({}),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_assessment_sessions_user").on(table.userId),
    index("idx_assessment_sessions_user_framework").on(
      table.userId,
      table.framework,
    ),
  ],
);

// ── Profiling: Profile Snapshots ────────────────────────
// Scored profile at a point in time — from assessment or behavioral aggregation.

export const profileSnapshots = pgTable(
  "profile_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    framework: varchar("framework", { length: 20 }).notNull(),
    source: varchar("source", { length: 20 }).notNull(), // assessment | behavioral
    sessionId: uuid("session_id").references(() => assessmentSessions.id),
    dimensions: jsonb("dimensions")
      .$type<Record<string, number>>()
      .notNull(),
    signalCount: integer("signal_count").notNull().default(0),
    periodStart: date("period_start"),
    periodEnd: date("period_end"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_profile_snapshots_user_framework").on(
      table.userId,
      table.framework,
      table.createdAt,
    ),
  ],
);

// ── Profiling: Behavioral Signals ───────────────────────
// Raw data points captured from interactions over time.

export const behavioralSignals = pgTable(
  "behavioral_signals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    framework: varchar("framework", { length: 20 }).notNull(),
    dimension: varchar("dimension", { length: 30 }).notNull(),
    value: real("value").notNull(), // 0–1
    confidence: real("confidence").notNull(), // 0–1
    sourceType: varchar("source_type", { length: 30 }).notNull(), // peer_review, feedback, one_on_one, self_reflection
    sourceId: uuid("source_id"),
    capturedAt: timestamp("captured_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_behavioral_signals_user_framework").on(
      table.userId,
      table.framework,
      table.capturedAt,
    ),
    index("idx_behavioral_signals_user_dimension").on(
      table.userId,
      table.dimension,
      table.capturedAt,
    ),
  ],
);

// ── Profiling: Development Goals ────────────────────────
// Coaching-oriented goals tied to specific profile dimensions.

export const profileDevelopmentGoals = pgTable(
  "profile_development_goals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    framework: varchar("framework", { length: 20 }).notNull(),
    dimension: varchar("dimension", { length: 30 }).notNull(),
    targetDirection: varchar("target_direction", { length: 10 }).notNull(), // increase | decrease
    setById: uuid("set_by_id")
      .notNull()
      .references(() => users.id),
    baselineSnapshotId: uuid("baseline_snapshot_id").references(
      () => profileSnapshots.id,
    ),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    notes: encryptedText("profile_development_goals", "notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_profile_goals_user").on(table.userId),
    index("idx_profile_goals_user_framework").on(
      table.userId,
      table.framework,
    ),
  ],
);

// ── Goals: Cycles ───────────────────────────────────────
// Admin-defined time periods (e.g. "Q3 2026") that org/team/individual
// goals belong to. Personal goals live outside cycles. "Current cycle"
// is computed from the date range — no isActive flag to maintain.
// DB enforces end_date > start_date via chk_goal_cycles_date_order (migration 0030).

export const goalCycles = pgTable(
  "goal_cycles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 100 }).notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("idx_goal_cycles_start_date").on(table.startDate)],
);

// ── Goals ───────────────────────────────────────────────
// One table for all four levels; the ladder is parentGoalId
// (org ← team ← individual). Personal goals have no parent/cycle/team
// and are private to the owner unless shareWithManager is set.
// Level/parent invariants: CHECK constraints in migration 0028 where
// expressible; parent-level correctness enforced in the API.

export const goals = pgTable(
  "goals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    level: varchar("level", { length: 20 }).notNull(), // org | team | individual | personal
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description").notNull().default(""),
    parentGoalId: uuid("parent_goal_id"), // self-reference added via raw SQL in migration
    cycleId: uuid("cycle_id").references(() => goalCycles.id),
    teamId: uuid("team_id").references(() => teams.id), // team goals; denormalized onto individual goals
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id),
    createdById: uuid("created_by_id")
      .notNull()
      .references(() => users.id),
    status: varchar("status", { length: 20 }).notNull().default("on_track"), // draft | on_track | at_risk | behind | achieved | archived
    progressPercent: integer("progress_percent").notNull().default(0),
    metricName: varchar("metric_name", { length: 255 }),
    metricStartValue: doublePrecision("metric_start_value"),
    metricTargetValue: doublePrecision("metric_target_value"),
    metricCurrentValue: doublePrecision("metric_current_value"),
    shareWithManager: boolean("share_with_manager").notNull().default(false),
    targetDate: date("target_date"),
    // Stable identity of an imported goal (partial unique index, migration 0040).
    importKey: varchar("import_key", { length: 128 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_goals_level").on(table.level),
    index("idx_goals_parent_goal_id").on(table.parentGoalId),
    index("idx_goals_cycle_id").on(table.cycleId),
    index("idx_goals_owner_id").on(table.ownerId),
    index("idx_goals_team_id").on(table.teamId),
  ],
);

// ── Goals: Updates ──────────────────────────────────────
// Check-in trail. source is the future integration hook:
// "dashboard" today; "chat" (conversation orchestrator) and
// "meet_transcript" (suggestion apply) later.

export const goalUpdates = pgTable(
  "goal_updates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    goalId: uuid("goal_id")
      .notNull()
      .references(() => goals.id),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id),
    progressPercent: integer("progress_percent"),
    metricCurrentValue: doublePrecision("metric_current_value"),
    status: varchar("status", { length: 20 }),
    note: encryptedText("goal_updates", "note").notNull().default(""),
    source: varchar("source", { length: 20 }).notNull().default("dashboard"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_goal_updates_goal_created").on(table.goalId, table.createdAt),
  ],
);

// ── Goals: Check-in Meetings ────────────────────────────
// Google Meet check-in calls discovered via the organizer's Calendar
// (title contains orgSettings.checkInTitleMarker). NOT an extension of
// calendar_events — that table is a rolling 7-day-future sync; this one
// tracks past meetings through a processing lifecycle.

export const checkInMeetings = pgTable(
  "check_in_meetings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizerId: uuid("organizer_id")
      .notNull()
      .references(() => users.id),
    subjectUserId: uuid("subject_user_id").references(() => users.id),
    externalEventId: varchar("external_event_id", { length: 255 }).notNull(),
    title: varchar("title", { length: 500 }).notNull(),
    eventStart: timestamp("event_start", { withTimezone: true }).notNull(),
    transcriptDocId: varchar("transcript_doc_id", { length: 255 }),
    // Migration 0041. calendar | automatic | upload.
    source: varchar("source", { length: 20 }).notNull().default("calendar"),
    // marker (title opt-in) | pair (two-person manager/report meeting).
    detectedBy: varchar("detected_by", { length: 20 }),
    // Gemini "Take notes for me" Doc: tasks and goals come from here.
    notesDocId: varchar("notes_doc_id", { length: 255 }),
    // The 1:1 session the extracted tasks were filed under.
    sessionId: uuid("session_id").references(() => oneOnOneSessions.id, { onDelete: "set null" }),
    // Items withheld as wellbeing, conduct or safety: a count, nothing more.
    withheldCount: integer("withheld_count").notNull().default(0),
    // awaiting_approval | declined | pending_transcript | processing | processed
    // | transcript_missing | no_subject_match | no_goals | failed
    status: varchar("status", { length: 30 })
      .notNull()
      .default("pending_transcript"),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("uq_check_in_meetings_org_event").on(
      table.organizerId,
      table.externalEventId,
    ),
    index("idx_check_in_meetings_status").on(table.status),
    index("idx_check_in_meetings_subject").on(table.subjectUserId),
  ],
);

// ── Between-meeting Goals ───────────────────────────────
// Ongoing focus areas from a 1:1 that run until the next one (not formal
// performance goals). Created automatically, visible to and editable by
// the two people in the 1:1 only. Migration 0041.

export const betweenMeetingGoals = pgTable(
  "between_meeting_goals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    counterpartId: uuid("counterpart_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    text: encryptedText("between_meeting_goals", "text").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("active"), // active | done | dropped
    visibility: varchar("visibility", { length: 20 }).notNull().default("private"), // private | shareable
    shareReason: encryptedText("between_meeting_goals", "share_reason"),
    sourceMeetingId: uuid("source_meeting_id").references(() => checkInMeetings.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_between_meeting_goals_owner").on(table.ownerId, table.status),
    index("idx_between_meeting_goals_counterpart").on(table.counterpartId, table.status),
  ],
);

// ── Goals: Update Suggestions ───────────────────────────
// LLM-extracted goal updates from check-in transcripts. Never applied
// automatically — the goal owner/manager reviews, then applying creates
// a goal_updates row (source "meet_transcript"). No transcript text is
// stored, only short evidence quotes (PII decision in docs/plan.md).

export const goalUpdateSuggestions = pgTable(
  "goal_update_suggestions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    goalId: uuid("goal_id")
      .notNull()
      .references(() => goals.id),
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => checkInMeetings.id),
    suggestedProgressPercent: integer("suggested_progress_percent"),
    suggestedStatus: varchar("suggested_status", { length: 20 }),
    suggestedMetricCurrentValue: doublePrecision(
      "suggested_metric_current_value",
    ),
    suggestedNote: encryptedText("goal_update_suggestions", "suggested_note").notNull().default(""),
    evidenceQuote: encryptedText("goal_update_suggestions", "evidence_quote").notNull().default(""),
    status: varchar("status", { length: 20 }).notNull().default("pending"), // pending | applied | dismissed
    reviewedById: uuid("reviewed_by_id").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    appliedUpdateId: uuid("applied_update_id").references(() => goalUpdates.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("uq_goal_suggestion_goal_meeting").on(table.goalId, table.meetingId),
    index("idx_goal_suggestions_goal_status").on(table.goalId, table.status),
    index("idx_goal_suggestions_status").on(table.status),
  ],
);

// ── Data imports ────────────────────────────────────────
// Stage -> map -> dry run -> admin approves -> commit (migration 0040).
// Staged rows are personal data: encrypted, and deleted 30 days after
// commit (rowsPurgeAfter, swept by purgeExpiredImportRows).

export const importRuns = pgTable(
  "import_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: varchar("kind", { length: 20 }).notNull(), // people | goals | feedback | org_chart
    status: varchar("status", { length: 20 }).notNull().default("staged"), // staged | mapped | dry_run | approved | committed | failed
    sourceType: varchar("source_type", { length: 20 }).notNull().default("file"), // file | google_sheet
    sourceSystem: varchar("source_system", { length: 50 }),
    fileName: varchar("file_name", { length: 255 }),
    contentType: varchar("content_type", { length: 100 }),
    fileSize: integer("file_size"),
    fileSha256: varchar("file_sha256", { length: 64 }),
    columns: jsonb("columns").$type<string[]>().notNull().default([]),
    rowCount: integer("row_count").notNull().default(0),
    mapping: jsonb("mapping").$type<Record<string, unknown>>(),
    mappingSource: varchar("mapping_source", { length: 20 }), // model | heuristic | admin
    report: jsonb("report").$type<Record<string, unknown>>(),
    error: text("error"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    approvedBy: uuid("approved_by").references(() => users.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    committedAt: timestamp("committed_at", { withTimezone: true }),
    rowsPurgeAfter: timestamp("rows_purge_after", { withTimezone: true })
      .notNull()
      .default(sql`now() + interval '30 days'`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_import_runs_created").on(table.createdAt),
    index("idx_import_runs_purge").on(table.rowsPurgeAfter),
  ],
);

export const importRows = pgTable(
  "import_rows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => importRuns.id, { onDelete: "cascade" }),
    rowIndex: integer("row_index").notNull(),
    raw: encryptedText("import_rows", "raw").notNull(), // JSON
    mapped: encryptedText("import_rows", "mapped"), // JSON
    status: varchar("status", { length: 20 }).notNull().default("staged"), // staged | ready | invalid | applied | skipped
    action: varchar("action", { length: 20 }), // create | update | none
    error: text("error"), // field names and reasons only, never cell values
    targetId: uuid("target_id"),
  },
  (table) => [unique("uq_import_rows_run_index").on(table.runId, table.rowIndex)],
);

// Historical feedback from a previous tool. Separate from feedback_entries
// so it never feeds engagement scores, digests or calibration.
export const importedFeedback = pgTable(
  "imported_feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Tier A pseudonym of the author (migration 0043).
    authorRef: varchar("author_ref", { length: 64 }).notNull(),
    recipientId: uuid("recipient_id")
      .notNull()
      .references(() => users.id),
    givenAt: timestamp("given_at", { withTimezone: true }).notNull(),
    content: encryptedText("imported_feedback", "content").notNull(),
    sourceSystem: varchar("source_system", { length: 50 }).notNull().default("import"),
    importRunId: uuid("import_run_id").references(() => importRuns.id, { onDelete: "set null" }),
    sourceKey: varchar("source_key", { length: 64 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("uq_imported_feedback_source_key").on(table.sourceKey),
    index("idx_imported_feedback_recipient").on(table.recipientId, table.givenAt),
  ],
);

// ── Audit log ─────────────────────────────────────────

/**
 * Append-only, hash-chained record of sensitive actions (migration 0043),
 * such as re-identifying a reviewer. UPDATE, DELETE and TRUNCATE are
 * rejected by triggers; each row carries the previous row's hash
 * (apps/api/src/lib/audit-log.ts writes and verifies). Never holds
 * feedback content. No foreign keys: entries outlive users.
 */
export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  seq: bigint("seq", { mode: "number" }).notNull().unique("uq_audit_log_seq"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  actorId: uuid("actor_id"),
  action: varchar("action", { length: 100 }).notNull(),
  target: varchar("target", { length: 255 }),
  reason: text("reason"),
  outcome: varchar("outcome", { length: 50 }).notNull(),
  details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
  prevHash: char("prev_hash", { length: 64 }).notNull(),
  rowHash: char("row_hash", { length: 64 }).notNull(),
});
