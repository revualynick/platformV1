/**
 * Bootstrap script — creates a clean instance with just an admin user.
 * Usage: DATABASE_URL=... tsx src/bootstrap.ts
 */
import { sql } from "drizzle-orm";
import { createTenantClient } from "./tenant.js";
import {
  users,
  userPlatformIdentities,
  teams,
  coreValues,
  userRelationships,
  questionnaires,
  questionnaireThemes,
  kudos,
  engagementScores,
  feedbackEntries,
  feedbackValueScores,
  conversations,
  conversationMessages,
  escalations,
  escalationNotes,
  questions,
  interactionSchedule,
  pulseCheckTriggers,
  notificationPreferences,
  calendarTokens,
  calendarEvents,
  oneOnOneSessions,
  oneOnOneActionItems,
  oneOnOneAgendaItems,
  managerNotes,
  campaigns,
  feedbackDigests,
  selfReflections,
  discoveredThemes,
  calibrationReports,
  pulseCheckConfig,
  threeSixtyResponses,
  threeSixtyReviews,
  integrations,
  leads,
} from "./schema/tenant.js";

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error("DATABASE_URL env var is required");
  process.exit(1);
}

async function bootstrap() {
  console.log("Bootstrapping clean instance...");
  const { db, sql: pgSql } = createTenantClient(DB_URL!);

  // Clear everything in reverse FK order
  console.log("  Clearing all data...");
  await db.delete(calendarEvents);
  await db.delete(calendarTokens);
  await db.delete(notificationPreferences);
  await db.delete(pulseCheckTriggers);
  await db.delete(pulseCheckConfig);
  await db.delete(interactionSchedule);
  await db.delete(oneOnOneAgendaItems);
  await db.delete(oneOnOneActionItems);
  await db.delete(oneOnOneSessions);
  await db.delete(managerNotes);
  await db.delete(escalationNotes);
  await db.delete(escalations);
  await db.delete(engagementScores);
  await db.delete(kudos);
  await db.delete(threeSixtyResponses);
  await db.delete(threeSixtyReviews);
  await db.delete(selfReflections);
  await db.delete(feedbackValueScores);
  await db.delete(feedbackEntries);
  await db.delete(conversationMessages);
  await db.delete(conversations);
  await db.delete(discoveredThemes);
  await db.delete(questions);
  await db.delete(questionnaireThemes);
  await db.delete(campaigns);
  await db.delete(questionnaires);
  await db.delete(userRelationships);
  await db.delete(userPlatformIdentities);
  await db.execute(sql`UPDATE users SET manager_id = NULL`);
  await db.execute(sql`UPDATE teams SET manager_id = NULL`);
  await db.delete(feedbackDigests);
  await db.delete(integrations);
  await db.delete(leads);
  await db.delete(calibrationReports);
  await db.delete(users);
  await db.delete(coreValues);
  await db.delete(teams);

  // Create admin user
  const [admin] = await db
    .insert(users)
    .values({
      email: "nick@revualy.com",
      name: "Nick Farmer",
      role: "super_admin",
      timezone: "Europe/London",
      onboardingCompleted: true,
    })
    .returning();

  console.log(`  ✓ Admin user created: ${admin.email} (${admin.id})`);

  await pgSql.end({ timeout: 5 });
  console.log("\nBootstrap complete — clean instance ready.");
}

bootstrap().catch((err) => {
  console.error("Bootstrap failed:", err);
  process.exit(1);
});
