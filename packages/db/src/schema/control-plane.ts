import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
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

export const orgPlatformConfigs = pgTable("org_platform_configs", {
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
});
