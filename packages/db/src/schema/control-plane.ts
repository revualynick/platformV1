import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  timestamp,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/pg-core";

/**
 * Control Plane Schema — shared database.
 * Stores org registry and org-to-database mappings.
 */

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  dbConnectionString: text("db_connection_string").notNull(),
  region: varchar("region", { length: 50 }).notNull().default("us-east-1"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const orgPlatformConfigs = pgTable(
  "org_platform_configs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    platform: varchar("platform", { length: 50 }).notNull(), // slack | google_chat | teams
    credentials: text("credentials").notNull(), // encrypted JSON
    webhookSecret: text("webhook_secret"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_org_platform").on(table.orgId, table.platform),
  ],
);

// ── NextAuth Tables (Database Sessions) ─────────────────

/**
 * authUsers — NextAuth user records with Revualy-specific columns.
 * The adapter manages standard fields; we add custom columns for
 * org/tenant mapping so the session callback can hydrate them.
 *
 * Column names use camelCase DB names to match the default
 * @auth/drizzle-adapter expectations (id, name, email, emailVerified, image).
 */
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
  tenantUserId: uuid("tenant_user_id"),
  role: varchar("role", { length: 50 }),
  teamId: uuid("team_id"),
  onboardingCompleted: boolean("onboarding_completed").default(false),
});

/**
 * authAccounts — OAuth provider links.
 * Composite PK on (provider, providerAccountId).
 */
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

/**
 * authSessions — Active database sessions.
 * sessionToken is the PK, looked up on every request.
 */
export const authSessions = pgTable("auth_session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

/**
 * authVerificationTokens — Email verification (future use).
 * Composite PK on (identifier, token).
 */
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
