import { sql } from "drizzle-orm";
import { createTenantClient } from "./tenant.js";
import {
  users,
  teams,
  coreValues,
  userRelationships,
  questionnaires,
  questionnaireThemes,
  kudos,
  engagementScores,
  feedbackEntries,
  conversations,
  conversationMessages,
  escalations,
  escalationAuditLog,
  notificationPreferences,
  calendarTokens,
  calendarEvents,
} from "./schema/tenant.js";

const DB_URL =
  process.env.DATABASE_URL ??
  "postgresql://revualy:revualy@localhost:5432/revualy_dev";

async function seed() {
  console.log("Seeding tenant database...");
  const db = createTenantClient(DB_URL);

  // ── Clean slate (idempotent) ─────────────────────────
  // Delete in reverse FK order to avoid constraint violations
  console.log("  Clearing existing data...");
  await db.delete(calendarEvents);
  await db.delete(calendarTokens);
  await db.delete(notificationPreferences);
  await db.delete(escalationAuditLog);
  await db.delete(escalations);
  await db.delete(engagementScores);
  await db.delete(kudos);
  await db.delete(feedbackEntries);
  await db.delete(conversationMessages);
  await db.delete(conversations);
  await db.delete(questionnaireThemes);
  await db.delete(questionnaires);
  await db.delete(userRelationships);
  // Clear manager references before deleting users
  await db.execute(sql`UPDATE users SET manager_id = NULL`);
  await db.execute(sql`UPDATE teams SET manager_id = NULL`);
  await db.delete(users);
  await db.delete(coreValues);
  await db.delete(teams);

  // ── Teams ───────────────────────────────────────────
  const [engineering, corePlatform, dataML, infra] = await db
    .insert(teams)
    .values([
      { name: "Engineering" },
      { name: "Core Platform", parentTeamId: null },
      { name: "Data & ML", parentTeamId: null },
      { name: "Infrastructure", parentTeamId: null },
    ])
    .returning();

  // Wire parent team IDs
  await db
    .update(teams)
    .set({ parentTeamId: engineering.id })
    .where(
      (await import("drizzle-orm")).inArray(teams.id, [
        corePlatform.id,
        dataML.id,
        infra.id,
      ]),
    );

  console.log(`  ✓ ${4} teams`);

  // ── Core Values ─────────────────────────────────────
  const valueRows = await db
    .insert(coreValues)
    .values([
      { name: "Communication", description: "Clear, honest, and empathetic exchange of ideas", sortOrder: 0 },
      { name: "Teamwork", description: "Collaborative spirit and mutual support", sortOrder: 1 },
      { name: "Innovation", description: "Creative problem-solving and continuous improvement", sortOrder: 2 },
      { name: "Ownership", description: "Accountability and follow-through on commitments", sortOrder: 3 },
      { name: "Excellence", description: "High standards and attention to detail", sortOrder: 4 },
    ])
    .returning();

  const valueMap = new Map(valueRows.map((v) => [v.name, v.id]));
  console.log(`  ✓ ${valueRows.length} core values`);

  // ── Users ───────────────────────────────────────────
  const peopleData = [
    { name: "Dana Whitfield", email: "dana.whitfield@acmecorp.com", role: "admin", team: engineering.id, manager: null as string | null },
    { name: "Alex Thompson", email: "alex.thompson@acmecorp.com", role: "manager", team: engineering.id, manager: null as string | null },
    { name: "Jordan Wells", email: "jordan.wells@acmecorp.com", role: "manager", team: corePlatform.id, manager: null as string | null },
    { name: "Sarah Chen", email: "sarah.chen@acmecorp.com", role: "employee", team: corePlatform.id, manager: null as string | null },
    { name: "Marcus Rivera", email: "marcus.rivera@acmecorp.com", role: "employee", team: corePlatform.id, manager: null as string | null },
    { name: "Aisha Patel", email: "aisha.patel@acmecorp.com", role: "employee", team: corePlatform.id, manager: null as string | null },
    { name: "James Okonkwo", email: "james.okonkwo@acmecorp.com", role: "employee", team: corePlatform.id, manager: null as string | null },
    { name: "Elena Volkov", email: "elena.volkov@acmecorp.com", role: "employee", team: corePlatform.id, manager: null as string | null },
    { name: "David Kim", email: "david.kim@acmecorp.com", role: "employee", team: corePlatform.id, manager: null as string | null },
    { name: "Priya Sharma", email: "priya.sharma@acmecorp.com", role: "manager", team: dataML.id, manager: null as string | null },
    { name: "Tom Nguyen", email: "tom.nguyen@acmecorp.com", role: "employee", team: dataML.id, manager: null as string | null },
    { name: "Rachel Adams", email: "rachel.adams@acmecorp.com", role: "employee", team: dataML.id, manager: null as string | null },
    { name: "Leo Park", email: "leo.park@acmecorp.com", role: "employee", team: infra.id, manager: null as string | null },
    { name: "Nina Torres", email: "nina.torres@acmecorp.com", role: "employee", team: infra.id, manager: null as string | null },
  ];

  const userRows = await db
    .insert(users)
    .values(
      peopleData.map((p) => ({
        name: p.name,
        email: p.email,
        role: p.role,
        teamId: p.team,
        timezone: "America/New_York",
        onboardingCompleted: true,
        preferences: { weeklyInteractionTarget: 3, preferredInteractionTime: "10:00", quietDays: [0, 6] },
      })),
    )
    .returning();

  const userMap = new Map(userRows.map((u) => [u.name, u.id]));
  const u = (name: string) => userMap.get(name)!;

  // Set reporting structure
  const { eq } = await import("drizzle-orm");
  const reportingLines: [string, string][] = [
    ["Alex Thompson", "Dana Whitfield"],
    ["Jordan Wells", "Alex Thompson"],
    ["Sarah Chen", "Jordan Wells"],
    ["Marcus Rivera", "Jordan Wells"],
    ["Aisha Patel", "Jordan Wells"],
    ["James Okonkwo", "Jordan Wells"],
    ["Elena Volkov", "Jordan Wells"],
    ["David Kim", "Jordan Wells"],
    ["Priya Sharma", "Alex Thompson"],
    ["Tom Nguyen", "Priya Sharma"],
    ["Rachel Adams", "Priya Sharma"],
    ["Leo Park", "Alex Thompson"],
    ["Nina Torres", "Leo Park"],
  ];

  for (const [child, parent] of reportingLines) {
    await db
      .update(users)
      .set({ managerId: u(parent) })
      .where(eq(users.id, u(child)));
  }

  // Wire team managers
  await db.update(teams).set({ managerId: u("Dana Whitfield") }).where(eq(teams.id, engineering.id));
  await db.update(teams).set({ managerId: u("Jordan Wells") }).where(eq(teams.id, corePlatform.id));
  await db.update(teams).set({ managerId: u("Priya Sharma") }).where(eq(teams.id, dataML.id));
  await db.update(teams).set({ managerId: u("Leo Park") }).where(eq(teams.id, infra.id));

  console.log(`  ✓ ${userRows.length} users with reporting lines`);

  // ── Relationships (threads) ─────────────────────────
  const threadData = [
    { from: "Sarah Chen", to: "Marcus Rivera", tags: ["pair-programming", "code-review"], strength: 0.92, label: "Regular pair partners on core services" },
    { from: "Sarah Chen", to: "Aisha Patel", tags: ["code-review", "security"], strength: 0.78, label: "Security review pipeline" },
    { from: "Marcus Rivera", to: "James Okonkwo", tags: ["mentorship"], strength: 0.85, label: "Marcus mentoring James on backend patterns" },
    { from: "Aisha Patel", to: "Tom Nguyen", tags: ["cross-team", "security"], strength: 0.71, label: "ML model security audit collaboration" },
    { from: "Sarah Chen", to: "Elena Volkov", tags: ["pair-programming"], strength: 0.68, label: "Sprint pairing on API layer" },
    { from: "Leo Park", to: "Sarah Chen", tags: ["cross-team", "architecture"], strength: 0.74, label: "Platform architecture alignment" },
    { from: "Marcus Rivera", to: "David Kim", tags: ["mentorship", "onboarding"], strength: 0.80, label: "Marcus onboarding David to the codebase" },
    { from: "Priya Sharma", to: "Jordan Wells", tags: ["cross-team", "planning"], strength: 0.65, label: "Cross-team sprint coordination" },
    { from: "Elena Volkov", to: "Rachel Adams", tags: ["cross-team", "data"], strength: 0.55, label: "API ↔ data pipeline integration" },
    { from: "Nina Torres", to: "Leo Park", tags: ["deployment", "infra"], strength: 0.90, label: "CI/CD pipeline ownership" },
  ];

  const relRows = await db
    .insert(userRelationships)
    .values(
      threadData.map((t) => ({
        fromUserId: u(t.from),
        toUserId: u(t.to),
        label: t.label,
        tags: t.tags,
        strength: t.strength,
        source: "manual",
      })),
    )
    .returning();

  console.log(`  ✓ ${relRows.length} relationship threads`);

  // ── Questionnaires + themes ─────────────────────────
  const qnData = [
    {
      name: "Sprint Peer Review",
      category: "peer_review",
      source: "built_in",
      verbatim: false,
      themes: [
        { intent: "Identify specific contributions and strengths", dataGoal: "Capture concrete positive behaviors tied to recent work", examplePhrasings: ["What stood out to you about how they handled the sprint?", "Can you think of a moment where they really came through?"], coreValue: null },
        { intent: "Surface collaboration quality", dataGoal: "Assess how well the person works with others and supports teammates", examplePhrasings: ["How was it working with them on shared tasks?", "Did they make your work easier or harder? How so?"], coreValue: "Teamwork" },
        { intent: "Identify growth areas constructively", dataGoal: "Get actionable improvement suggestions without negativity", examplePhrasings: ["If you could suggest one thing for them to try differently, what would it be?", "Where do you see the most room for growth?"], coreValue: null },
        { intent: "Evaluate communication effectiveness", dataGoal: "Understand how well they keep others informed and unblock themselves", examplePhrasings: ["How clear were they about where things stood with their work?", "How effectively did they flag blockers?"], coreValue: "Communication" },
      ],
    },
    {
      name: "Weekly Self-Reflection",
      category: "self_reflection",
      source: "built_in",
      verbatim: false,
      themes: [
        { intent: "Celebrate wins and build confidence", dataGoal: "Track what the person values about their own contributions", examplePhrasings: ["What felt like your biggest win this week?", "What are you most proud of from the last few days?"], coreValue: null },
        { intent: "Process challenges and blockers", dataGoal: "Identify recurring obstacles and coping strategies", examplePhrasings: ["What was the trickiest part of your week?", "Where did you feel stuck?"], coreValue: null },
      ],
    },
    {
      name: "Manager Effectiveness",
      category: "three_sixty",
      source: "custom",
      verbatim: true,
      themes: [
        { intent: "Assess management support quality", dataGoal: "Understand whether reports feel supported and unblocked", examplePhrasings: ["How supported did you feel by your manager this week?"], coreValue: null },
        { intent: "Evaluate clarity of direction", dataGoal: "Check if priorities and expectations are communicated clearly", examplePhrasings: ["Are you clear on what's expected of you right now?"], coreValue: "Communication" },
      ],
    },
    {
      name: "Team Pulse",
      category: "pulse_check",
      source: "imported",
      verbatim: false,
      themes: [
        { intent: "Gauge team morale", dataGoal: "Track sentiment trends over time to catch culture issues early", examplePhrasings: ["How's the vibe on your team lately?", "What's the overall mood right now?"], coreValue: null },
      ],
    },
  ];

  for (const qn of qnData) {
    const [created] = await db
      .insert(questionnaires)
      .values({
        name: qn.name,
        category: qn.category,
        source: qn.source,
        verbatim: qn.verbatim,
      })
      .returning();

    if (qn.themes.length > 0) {
      await db.insert(questionnaireThemes).values(
        qn.themes.map((t, i) => ({
          questionnaireId: created.id,
          intent: t.intent,
          dataGoal: t.dataGoal,
          examplePhrasings: t.examplePhrasings,
          coreValueId: t.coreValue ? valueMap.get(t.coreValue) ?? null : null,
          sortOrder: i,
        })),
      );
    }
  }

  console.log(`  ✓ ${qnData.length} questionnaires with ${qnData.reduce((s, q) => s + q.themes.length, 0)} themes`);

  // ── Kudos ───────────────────────────────────────────
  const kudosData = [
    { from: "Marcus Rivera", to: "Sarah Chen", message: "Absolute legend for staying on that P0 until 2am. You saved the launch.", value: "Ownership" },
    { from: "Aisha Patel", to: "Sarah Chen", message: "Your code reviews are always so thoughtful — I learn something every time.", value: "Excellence" },
    { from: "Elena Volkov", to: "Sarah Chen", message: "Thanks for jumping in to help with the demo prep, even though it wasn't your project.", value: "Teamwork" },
    { from: "James Okonkwo", to: "Sarah Chen", message: "The architecture doc was super clear. Made my life so much easier ramping up.", value: "Communication" },
    { from: "Sarah Chen", to: "Aisha Patel", message: "Incredible attention to detail on the security audit. Found things nobody else caught.", value: "Excellence" },
    { from: "Sarah Chen", to: "Marcus Rivera", message: "Great mentoring of the new intern — really patient and thorough.", value: "Teamwork" },
  ];

  await db.insert(kudos).values(
    kudosData.map((k) => ({
      giverId: u(k.from),
      receiverId: u(k.to),
      message: k.message,
      coreValueId: valueMap.get(k.value) ?? null,
      source: "chat",
    })),
  );

  console.log(`  ✓ ${kudosData.length} kudos`);

  // ── Engagement scores ───────────────────────────────
  const weeks = ["2026-01-05", "2026-01-12", "2026-01-19", "2026-01-26", "2026-02-02", "2026-02-09"];
  const engData = [
    { name: "Sarah Chen", scores: [72, 78, 75, 82, 85, 87] },
    { name: "Marcus Rivera", scores: [65, 70, 68, 72, 74, 72] },
    { name: "Aisha Patel", scores: [85, 88, 86, 90, 92, 94] },
    { name: "James Okonkwo", scores: [52, 55, 48, 54, 50, 58] },
    { name: "Elena Volkov", scores: [70, 75, 72, 78, 80, 81] },
    { name: "David Kim", scores: [40, 38, 42, 35, 30, 45] },
  ];

  for (const user of engData) {
    await db.insert(engagementScores).values(
      weeks.map((w, i) => ({
        userId: u(user.name),
        weekStarting: w,
        interactionsCompleted: user.scores[i] > 70 ? 3 : user.scores[i] > 50 ? 2 : 1,
        interactionsTarget: 3,
        averageQualityScore: user.scores[i],
        responseRate: user.scores[i] / 100,
        streak: i,
        rank: null,
      })),
    );
  }

  console.log(`  ✓ ${engData.length * weeks.length} engagement score records`);

  console.log("\nSeed complete!");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
