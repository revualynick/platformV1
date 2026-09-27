import { sql, eq, inArray } from "drizzle-orm";
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
  orgSettings,
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
  assessmentQuestions,
  assessmentSessions,
  profileSnapshots,
  behavioralSignals,
  profileDevelopmentGoals,
  goalCycles,
  goals,
  goalUpdates,
  goalUpdateSuggestions,
  checkInMeetings,
} from "./schema/tenant.js";

function getDbUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL env var is required for seeding");
    process.exit(1);
  }
  return url;
}

const DB_URL = getDbUrl();

async function seed() {
  console.log("Seeding tenant database...");
  const { db, sql: pgSql } = createTenantClient(DB_URL);

  // ── Clean slate (idempotent) ─────────────────────────
  // Delete in reverse FK order to avoid constraint violations.
  // Every tenant table must be listed here.
  console.log("  Clearing existing data...");
  await db.delete(goalUpdateSuggestions);
  await db.delete(checkInMeetings);
  await db.delete(goalUpdates);
  await db.delete(goals);
  await db.delete(goalCycles);
  await db.delete(profileDevelopmentGoals);
  await db.delete(behavioralSignals);
  await db.delete(profileSnapshots);
  await db.delete(assessmentSessions);
  await db.delete(assessmentQuestions);
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
  // Clear manager references before deleting users
  await db.execute(sql`UPDATE users SET manager_id = NULL`);
  await db.execute(sql`UPDATE teams SET manager_id = NULL`);
  await db.delete(feedbackDigests);
  await db.delete(integrations);
  await db.delete(leads);
  await db.delete(calibrationReports);
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
      inArray(teams.id, [
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
  const SEED_DOMAIN = process.env.SEED_EMAIL_DOMAIN ?? "acmecorp.com";
  const peopleData = [
    { name: "Dana Whitfield", email: `dana.whitfield@${SEED_DOMAIN}`, role: "super_admin", team: engineering.id, manager: null as string | null },
    { name: "Alex Thompson", email: `alex.thompson@${SEED_DOMAIN}`, role: "manager", team: engineering.id, manager: null as string | null },
    { name: "Jordan Wells", email: `jordan.wells@${SEED_DOMAIN}`, role: "manager", team: corePlatform.id, manager: null as string | null },
    { name: "Sarah Chen", email: `sarah.chen@${SEED_DOMAIN}`, role: "employee", team: corePlatform.id, manager: null as string | null },
    { name: "Marcus Rivera", email: `marcus.rivera@${SEED_DOMAIN}`, role: "employee", team: corePlatform.id, manager: null as string | null },
    { name: "Aisha Patel", email: `aisha.patel@${SEED_DOMAIN}`, role: "employee", team: corePlatform.id, manager: null as string | null },
    { name: "James Okonkwo", email: `james.okonkwo@${SEED_DOMAIN}`, role: "employee", team: corePlatform.id, manager: null as string | null },
    { name: "Elena Volkov", email: `elena.volkov@${SEED_DOMAIN}`, role: "employee", team: corePlatform.id, manager: null as string | null },
    { name: "David Kim", email: `david.kim@${SEED_DOMAIN}`, role: "employee", team: corePlatform.id, manager: null as string | null },
    { name: "Priya Sharma", email: `priya.sharma@${SEED_DOMAIN}`, role: "manager", team: dataML.id, manager: null as string | null },
    { name: "Tom Nguyen", email: `tom.nguyen@${SEED_DOMAIN}`, role: "employee", team: dataML.id, manager: null as string | null },
    { name: "Rachel Adams", email: `rachel.adams@${SEED_DOMAIN}`, role: "employee", team: dataML.id, manager: null as string | null },
    { name: "Leo Park", email: `leo.park@${SEED_DOMAIN}`, role: "employee", team: infra.id, manager: null as string | null },
    { name: "Nina Torres", email: `nina.torres@${SEED_DOMAIN}`, role: "employee", team: infra.id, manager: null as string | null },
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

  // ── Org Settings ──────────────────────────────────
  await db.delete(orgSettings);
  const allowedDomains = [SEED_DOMAIN, ...(SEED_DOMAIN !== "revualy.com" ? ["revualy.com"] : [])];
  await db.insert(orgSettings).values({
    name: "Revualy",
    subdomain: "",
    timezone: "America/New_York",
    allowedDomains,
  });
  console.log(`  ✓ org settings (allowed domains: ${allowedDomains.join(", ")})`);

  // ── Assessment Questions: Colour Profiling ──────────
  console.log("  Seeding colour assessment questions...");
  await db.insert(assessmentQuestions).values([
    {
      framework: "colour",
      questionType: "forced_choice",
      text: "When faced with a tight deadline, you tend to:",
      sortOrder: 1,
      options: [
        { key: "a", text: "Take charge and push the team to deliver fast", scores: { red: 0.8, yellow: 0.1, green: 0.0, blue: 0.1 } },
        { key: "b", text: "Rally everyone's energy and keep morale high", scores: { red: 0.1, yellow: 0.8, green: 0.1, blue: 0.0 } },
        { key: "c", text: "Check in with each person to make sure they're coping", scores: { red: 0.0, yellow: 0.1, green: 0.8, blue: 0.1 } },
        { key: "d", text: "Create a detailed plan and track progress systematically", scores: { red: 0.1, yellow: 0.0, green: 0.1, blue: 0.8 } },
      ],
    },
    {
      framework: "colour",
      questionType: "forced_choice",
      text: "In a meeting where a decision needs to be made, you typically:",
      sortOrder: 2,
      options: [
        { key: "a", text: "State your position clearly and push for a quick resolution", scores: { red: 0.8, yellow: 0.1, green: 0.0, blue: 0.1 } },
        { key: "b", text: "Brainstorm out loud and get excited about possibilities", scores: { red: 0.0, yellow: 0.8, green: 0.1, blue: 0.1 } },
        { key: "c", text: "Listen to everyone's input before sharing your view", scores: { red: 0.0, yellow: 0.1, green: 0.8, blue: 0.1 } },
        { key: "d", text: "Ask for data and evidence to support each option", scores: { red: 0.1, yellow: 0.0, green: 0.1, blue: 0.8 } },
      ],
    },
    {
      framework: "colour",
      questionType: "forced_choice",
      text: "When giving feedback to a colleague, you prefer to:",
      sortOrder: 3,
      options: [
        { key: "a", text: "Be direct and specific — no sugarcoating", scores: { red: 0.8, yellow: 0.0, green: 0.1, blue: 0.1 } },
        { key: "b", text: "Frame it positively and focus on their strengths first", scores: { red: 0.0, yellow: 0.7, green: 0.3, blue: 0.0 } },
        { key: "c", text: "Have a private conversation and ask how they're feeling", scores: { red: 0.0, yellow: 0.1, green: 0.8, blue: 0.1 } },
        { key: "d", text: "Prepare specific examples and data to support your points", scores: { red: 0.1, yellow: 0.0, green: 0.1, blue: 0.8 } },
      ],
    },
    {
      framework: "colour",
      questionType: "forced_choice",
      text: "When a project isn't going well, your instinct is to:",
      sortOrder: 4,
      options: [
        { key: "a", text: "Identify the blocker and remove it immediately", scores: { red: 0.8, yellow: 0.1, green: 0.0, blue: 0.1 } },
        { key: "b", text: "Re-energize the team and pivot to a fresh approach", scores: { red: 0.1, yellow: 0.8, green: 0.1, blue: 0.0 } },
        { key: "c", text: "Understand how the team is feeling and rebuild trust", scores: { red: 0.0, yellow: 0.1, green: 0.8, blue: 0.1 } },
        { key: "d", text: "Analyze what went wrong and build a recovery plan", scores: { red: 0.1, yellow: 0.0, green: 0.1, blue: 0.8 } },
      ],
    },
    {
      framework: "colour",
      questionType: "forced_choice",
      text: "Your ideal work environment is one where:",
      sortOrder: 5,
      options: [
        { key: "a", text: "Results matter most and people are held accountable", scores: { red: 0.8, yellow: 0.0, green: 0.1, blue: 0.1 } },
        { key: "b", text: "Collaboration is constant and energy is high", scores: { red: 0.0, yellow: 0.8, green: 0.1, blue: 0.1 } },
        { key: "c", text: "People feel safe, supported, and heard", scores: { red: 0.0, yellow: 0.1, green: 0.8, blue: 0.1 } },
        { key: "d", text: "Processes are clear and quality standards are high", scores: { red: 0.1, yellow: 0.0, green: 0.1, blue: 0.8 } },
      ],
    },
    {
      framework: "colour",
      questionType: "forced_choice",
      text: "When you disagree with a colleague's approach, you:",
      sortOrder: 6,
      options: [
        { key: "a", text: "Challenge them directly — healthy conflict drives results", scores: { red: 0.8, yellow: 0.1, green: 0.0, blue: 0.1 } },
        { key: "b", text: "Propose an alternative with enthusiasm and optimism", scores: { red: 0.1, yellow: 0.8, green: 0.1, blue: 0.0 } },
        { key: "c", text: "Seek to understand their reasoning before responding", scores: { red: 0.0, yellow: 0.1, green: 0.8, blue: 0.1 } },
        { key: "d", text: "Present a logical case for why your approach is better", scores: { red: 0.1, yellow: 0.0, green: 0.1, blue: 0.8 } },
      ],
    },
    {
      framework: "colour",
      questionType: "forced_choice",
      text: "Others would describe your communication style as:",
      sortOrder: 7,
      options: [
        { key: "a", text: "Confident, concise, and to the point", scores: { red: 0.8, yellow: 0.1, green: 0.0, blue: 0.1 } },
        { key: "b", text: "Warm, expressive, and inspiring", scores: { red: 0.0, yellow: 0.8, green: 0.1, blue: 0.1 } },
        { key: "c", text: "Calm, empathetic, and thoughtful", scores: { red: 0.0, yellow: 0.1, green: 0.8, blue: 0.1 } },
        { key: "d", text: "Precise, structured, and evidence-based", scores: { red: 0.1, yellow: 0.0, green: 0.1, blue: 0.8 } },
      ],
    },
    {
      framework: "colour",
      questionType: "forced_choice",
      text: "When learning something new, you prefer to:",
      sortOrder: 8,
      options: [
        { key: "a", text: "Jump in and learn by doing — figure it out fast", scores: { red: 0.7, yellow: 0.2, green: 0.0, blue: 0.1 } },
        { key: "b", text: "Discuss it with others and bounce ideas around", scores: { red: 0.0, yellow: 0.7, green: 0.2, blue: 0.1 } },
        { key: "c", text: "Observe and reflect before taking action", scores: { red: 0.0, yellow: 0.1, green: 0.7, blue: 0.2 } },
        { key: "d", text: "Read documentation and understand the theory first", scores: { red: 0.1, yellow: 0.0, green: 0.2, blue: 0.7 } },
      ],
    },
    {
      framework: "colour",
      questionType: "forced_choice",
      text: "Under stress, you tend to become more:",
      sortOrder: 9,
      options: [
        { key: "a", text: "Impatient and demanding", scores: { red: 0.8, yellow: 0.1, green: 0.0, blue: 0.1 } },
        { key: "b", text: "Scattered and overcommitted", scores: { red: 0.1, yellow: 0.8, green: 0.0, blue: 0.1 } },
        { key: "c", text: "Withdrawn and conflict-avoidant", scores: { red: 0.0, yellow: 0.0, green: 0.8, blue: 0.2 } },
        { key: "d", text: "Rigid and overly critical", scores: { red: 0.1, yellow: 0.0, green: 0.1, blue: 0.8 } },
      ],
    },
    {
      framework: "colour",
      questionType: "forced_choice",
      text: "What motivates you most at work?",
      sortOrder: 10,
      options: [
        { key: "a", text: "Winning — achieving ambitious goals and beating targets", scores: { red: 0.8, yellow: 0.1, green: 0.0, blue: 0.1 } },
        { key: "b", text: "Connection — building relationships and having fun together", scores: { red: 0.0, yellow: 0.8, green: 0.1, blue: 0.1 } },
        { key: "c", text: "Harmony — knowing the team is happy and working well", scores: { red: 0.0, yellow: 0.1, green: 0.8, blue: 0.1 } },
        { key: "d", text: "Mastery — doing things right and producing excellent work", scores: { red: 0.1, yellow: 0.0, green: 0.1, blue: 0.8 } },
      ],
    },
    {
      framework: "colour",
      questionType: "forced_choice",
      text: "In a team brainstorm, your natural role is:",
      sortOrder: 11,
      options: [
        { key: "a", text: "Driving towards a decision and assigning actions", scores: { red: 0.8, yellow: 0.1, green: 0.0, blue: 0.1 } },
        { key: "b", text: "Generating creative ideas and building on others'", scores: { red: 0.0, yellow: 0.8, green: 0.1, blue: 0.1 } },
        { key: "c", text: "Making sure quieter voices are heard", scores: { red: 0.0, yellow: 0.1, green: 0.8, blue: 0.1 } },
        { key: "d", text: "Evaluating feasibility and identifying risks", scores: { red: 0.1, yellow: 0.0, green: 0.1, blue: 0.8 } },
      ],
    },
    {
      framework: "colour",
      questionType: "forced_choice",
      text: "When receiving feedback, you most value:",
      sortOrder: 12,
      options: [
        { key: "a", text: "Straight talk — tell me what I need to fix", scores: { red: 0.8, yellow: 0.0, green: 0.1, blue: 0.1 } },
        { key: "b", text: "Encouragement alongside constructive suggestions", scores: { red: 0.0, yellow: 0.7, green: 0.2, blue: 0.1 } },
        { key: "c", text: "Empathy — acknowledgment of effort before critique", scores: { red: 0.0, yellow: 0.1, green: 0.8, blue: 0.1 } },
        { key: "d", text: "Specifics — concrete examples and measurable goals", scores: { red: 0.1, yellow: 0.0, green: 0.1, blue: 0.8 } },
      ],
    },
    {
      framework: "colour",
      questionType: "forced_choice",
      text: "When starting a new project, your first step is to:",
      sortOrder: 13,
      options: [
        { key: "a", text: "Define the goal and start executing immediately", scores: { red: 0.8, yellow: 0.1, green: 0.0, blue: 0.1 } },
        { key: "b", text: "Get the team together and share the vision", scores: { red: 0.1, yellow: 0.8, green: 0.1, blue: 0.0 } },
        { key: "c", text: "Understand the people involved and their concerns", scores: { red: 0.0, yellow: 0.1, green: 0.8, blue: 0.1 } },
        { key: "d", text: "Map out the requirements and create a detailed plan", scores: { red: 0.0, yellow: 0.0, green: 0.1, blue: 0.9 } },
      ],
    },
    {
      framework: "colour",
      questionType: "forced_choice",
      text: "Your approach to time management is:",
      sortOrder: 14,
      options: [
        { key: "a", text: "Move fast — done is better than perfect", scores: { red: 0.8, yellow: 0.1, green: 0.0, blue: 0.1 } },
        { key: "b", text: "Flexible — adapt as priorities shift", scores: { red: 0.1, yellow: 0.7, green: 0.2, blue: 0.0 } },
        { key: "c", text: "Balanced — protect time for people and well-being", scores: { red: 0.0, yellow: 0.1, green: 0.8, blue: 0.1 } },
        { key: "d", text: "Structured — schedule everything, minimize surprises", scores: { red: 0.0, yellow: 0.0, green: 0.1, blue: 0.9 } },
      ],
    },
    {
      framework: "colour",
      questionType: "forced_choice",
      text: "You feel most valued when:",
      sortOrder: 15,
      options: [
        { key: "a", text: "Your results and impact are recognized", scores: { red: 0.8, yellow: 0.1, green: 0.0, blue: 0.1 } },
        { key: "b", text: "People enjoy working with you and seek you out", scores: { red: 0.0, yellow: 0.8, green: 0.1, blue: 0.1 } },
        { key: "c", text: "Others feel genuinely supported by you", scores: { red: 0.0, yellow: 0.1, green: 0.8, blue: 0.1 } },
        { key: "d", text: "Your expertise and thoroughness are appreciated", scores: { red: 0.1, yellow: 0.0, green: 0.1, blue: 0.8 } },
      ],
    },
  ]);
  console.log("  ✓ 15 colour assessment questions");

  // ── Assessment Questions: Critical Decision Making ─────
  console.log("  Seeding CDM assessment questions...");
  await db.insert(assessmentQuestions).values([
    {
      framework: "cdm",
      questionType: "scenario",
      text: "Your team disagrees on the approach for a critical project. Two people feel strongly about opposite directions. You:",
      sortOrder: 1,
      options: [
        { key: "a", text: "Let them debate it out — the best argument should win", scores: { conflictTolerance: 0.9, inquiryVsAdvocacy: 0.3, cogDiversitySeeking: 0.7 } },
        { key: "b", text: "Look for a compromise that takes elements from both", scores: { conflictTolerance: 0.4, inquiryVsAdvocacy: 0.5, frameFlexibility: 0.7 } },
        { key: "c", text: "Gather more data before the group decides", scores: { analysisVsAction: 0.8, inquiryVsAdvocacy: 0.7, conflictTolerance: 0.3 } },
        { key: "d", text: "Make the call yourself to keep things moving", scores: { analysisVsAction: 0.1, conflictTolerance: 0.5, inquiryVsAdvocacy: 0.2 } },
      ],
    },
    {
      framework: "cdm",
      questionType: "scenario",
      text: "You've just launched a new initiative and early results are mixed. Some metrics are up, others are down. You:",
      sortOrder: 2,
      options: [
        { key: "a", text: "Stay the course — it's too early to judge", scores: { frameFlexibility: 0.2, analysisVsAction: 0.3, postMortemOrientation: 0.2 } },
        { key: "b", text: "Dig into the data to understand what's driving the mixed signals", scores: { analysisVsAction: 0.8, inquiryVsAdvocacy: 0.7, postMortemOrientation: 0.7 } },
        { key: "c", text: "Ask the team what they're seeing on the ground", scores: { inquiryVsAdvocacy: 0.8, cogDiversitySeeking: 0.7, conflictTolerance: 0.5 } },
        { key: "d", text: "Adjust the approach based on what's working and cut what isn't", scores: { frameFlexibility: 0.8, analysisVsAction: 0.4, postMortemOrientation: 0.5 } },
      ],
    },
    {
      framework: "cdm",
      questionType: "scenario",
      text: "A trusted colleague tells you your proposed solution won't work. You've invested significant time in it. You:",
      sortOrder: 3,
      options: [
        { key: "a", text: "Ask them to explain their concerns in detail", scores: { inquiryVsAdvocacy: 0.9, conflictTolerance: 0.7, cogDiversitySeeking: 0.7 } },
        { key: "b", text: "Walk them through your reasoning to see if you can convince them", scores: { inquiryVsAdvocacy: 0.2, conflictTolerance: 0.6, frameFlexibility: 0.2 } },
        { key: "c", text: "Get a third opinion to break the tie", scores: { cogDiversitySeeking: 0.8, conflictTolerance: 0.4, analysisVsAction: 0.6 } },
        { key: "d", text: "Reconsider your solution from scratch with their input", scores: { frameFlexibility: 0.9, inquiryVsAdvocacy: 0.7, postMortemOrientation: 0.6 } },
      ],
    },
    {
      framework: "cdm",
      questionType: "scenario",
      text: "You need to decide between two vendors. One is cheaper but unproven. The other is expensive but reliable. You:",
      sortOrder: 4,
      options: [
        { key: "a", text: "Go with the proven option — reliability matters more", scores: { analysisVsAction: 0.4, frameFlexibility: 0.3, cogDiversitySeeking: 0.2 } },
        { key: "b", text: "Run a small pilot with the cheaper vendor before committing", scores: { analysisVsAction: 0.7, frameFlexibility: 0.7, postMortemOrientation: 0.6 } },
        { key: "c", text: "Get input from people who've used both", scores: { cogDiversitySeeking: 0.8, inquiryVsAdvocacy: 0.8, analysisVsAction: 0.6 } },
        { key: "d", text: "Go with the cheaper vendor — calculated risks drive innovation", scores: { analysisVsAction: 0.2, frameFlexibility: 0.5, conflictTolerance: 0.6 } },
      ],
    },
    {
      framework: "cdm",
      questionType: "scenario",
      text: "Your team just completed a major project. It was successful but had some rough patches. You:",
      sortOrder: 5,
      options: [
        { key: "a", text: "Celebrate the win and move on to the next priority", scores: { postMortemOrientation: 0.1, analysisVsAction: 0.2, conflictTolerance: 0.3 } },
        { key: "b", text: "Run a structured retrospective to capture lessons learned", scores: { postMortemOrientation: 0.9, inquiryVsAdvocacy: 0.7, analysisVsAction: 0.7 } },
        { key: "c", text: "Have informal 1:1s to understand each person's experience", scores: { postMortemOrientation: 0.6, inquiryVsAdvocacy: 0.8, cogDiversitySeeking: 0.5 } },
        { key: "d", text: "Document what worked and share it across teams", scores: { postMortemOrientation: 0.7, cogDiversitySeeking: 0.6, frameFlexibility: 0.4 } },
      ],
    },
    {
      framework: "cdm",
      questionType: "scenario",
      text: "You're in a meeting and realize the group is converging on an idea too quickly. No one has raised concerns. You:",
      sortOrder: 6,
      options: [
        { key: "a", text: "Play devil's advocate and challenge the consensus", scores: { conflictTolerance: 0.9, cogDiversitySeeking: 0.8, inquiryVsAdvocacy: 0.5 } },
        { key: "b", text: "Ask the group 'what could go wrong?' to surface risks", scores: { inquiryVsAdvocacy: 0.8, conflictTolerance: 0.7, cogDiversitySeeking: 0.7 } },
        { key: "c", text: "Trust the group — quick alignment means it's a clear decision", scores: { conflictTolerance: 0.2, analysisVsAction: 0.2, cogDiversitySeeking: 0.2 } },
        { key: "d", text: "Suggest sleeping on it and reconvening tomorrow", scores: { analysisVsAction: 0.8, frameFlexibility: 0.6, postMortemOrientation: 0.4 } },
      ],
    },
    {
      framework: "cdm",
      questionType: "scenario",
      text: "A strategy you championed six months ago isn't delivering results. The data is clear. You:",
      sortOrder: 7,
      options: [
        { key: "a", text: "Acknowledge it openly and pivot to a new approach", scores: { frameFlexibility: 0.9, postMortemOrientation: 0.7, conflictTolerance: 0.6 } },
        { key: "b", text: "Dig deeper — the data might not tell the full story yet", scores: { analysisVsAction: 0.7, frameFlexibility: 0.3, inquiryVsAdvocacy: 0.6 } },
        { key: "c", text: "Ask others what they think is happening before deciding", scores: { inquiryVsAdvocacy: 0.8, cogDiversitySeeking: 0.8, postMortemOrientation: 0.5 } },
        { key: "d", text: "Give it more time — strategy shifts take longer than people expect", scores: { frameFlexibility: 0.2, analysisVsAction: 0.4, postMortemOrientation: 0.2 } },
      ],
    },
    {
      framework: "cdm",
      questionType: "scenario",
      text: "You're hiring for a key role. The top candidate is very similar to you in thinking style. The runner-up thinks very differently but is also qualified. You:",
      sortOrder: 8,
      options: [
        { key: "a", text: "Hire the top candidate — skill match is what matters", scores: { cogDiversitySeeking: 0.2, analysisVsAction: 0.4, frameFlexibility: 0.3 } },
        { key: "b", text: "Lean towards the runner-up — diverse thinking strengthens teams", scores: { cogDiversitySeeking: 0.9, frameFlexibility: 0.6, conflictTolerance: 0.7 } },
        { key: "c", text: "Have both meet more of the team to see who adds more value", scores: { cogDiversitySeeking: 0.6, inquiryVsAdvocacy: 0.7, analysisVsAction: 0.7 } },
        { key: "d", text: "Score both against a structured rubric to remove bias", scores: { analysisVsAction: 0.8, postMortemOrientation: 0.5, cogDiversitySeeking: 0.5 } },
      ],
    },
    {
      framework: "cdm",
      questionType: "scenario",
      text: "You receive conflicting advice from two mentors you trust equally. One says go bold, the other says be cautious. You:",
      sortOrder: 9,
      options: [
        { key: "a", text: "Seek additional perspectives to break the tie", scores: { cogDiversitySeeking: 0.8, inquiryVsAdvocacy: 0.7, analysisVsAction: 0.6 } },
        { key: "b", text: "Analyze both paths in detail before choosing", scores: { analysisVsAction: 0.9, frameFlexibility: 0.5, postMortemOrientation: 0.5 } },
        { key: "c", text: "Go with your gut — you have enough context to decide", scores: { analysisVsAction: 0.1, conflictTolerance: 0.5, frameFlexibility: 0.4 } },
        { key: "d", text: "Test the bold path on a small scale first", scores: { frameFlexibility: 0.7, analysisVsAction: 0.6, postMortemOrientation: 0.6 } },
      ],
    },
    {
      framework: "cdm",
      questionType: "scenario",
      text: "During a planning session, a junior team member suggests an unconventional approach that the senior members immediately dismiss. You:",
      sortOrder: 10,
      options: [
        { key: "a", text: "Ask the junior person to elaborate — there might be something there", scores: { inquiryVsAdvocacy: 0.9, cogDiversitySeeking: 0.9, conflictTolerance: 0.7 } },
        { key: "b", text: "Move on — the experienced team members probably have good reason", scores: { cogDiversitySeeking: 0.1, conflictTolerance: 0.2, inquiryVsAdvocacy: 0.2 } },
        { key: "c", text: "Note it down and revisit after the meeting privately", scores: { conflictTolerance: 0.3, cogDiversitySeeking: 0.5, inquiryVsAdvocacy: 0.5 } },
        { key: "d", text: "Challenge the senior members on why they dismissed it so quickly", scores: { conflictTolerance: 0.9, cogDiversitySeeking: 0.7, inquiryVsAdvocacy: 0.6 } },
      ],
    },
    {
      framework: "cdm",
      questionType: "scenario",
      text: "You discover that a decision you made last quarter caused an unexpected problem downstream. You:",
      sortOrder: 11,
      options: [
        { key: "a", text: "Fix the immediate problem and move on", scores: { postMortemOrientation: 0.1, analysisVsAction: 0.2, frameFlexibility: 0.3 } },
        { key: "b", text: "Analyze the root cause to understand how your reasoning went wrong", scores: { postMortemOrientation: 0.9, analysisVsAction: 0.8, frameFlexibility: 0.6 } },
        { key: "c", text: "Share what happened openly so others can learn from it", scores: { postMortemOrientation: 0.7, conflictTolerance: 0.7, cogDiversitySeeking: 0.6 } },
        { key: "d", text: "Review your decision-making process to prevent repeating the pattern", scores: { postMortemOrientation: 0.8, frameFlexibility: 0.7, analysisVsAction: 0.7 } },
      ],
    },
    {
      framework: "cdm",
      questionType: "scenario",
      text: "You're about to present a recommendation to leadership. A team member shares last-minute data that contradicts your conclusion. You:",
      sortOrder: 12,
      options: [
        { key: "a", text: "Delay the presentation to incorporate the new data", scores: { frameFlexibility: 0.8, analysisVsAction: 0.8, postMortemOrientation: 0.5 } },
        { key: "b", text: "Present as planned but acknowledge the conflicting data openly", scores: { conflictTolerance: 0.7, frameFlexibility: 0.5, inquiryVsAdvocacy: 0.5 } },
        { key: "c", text: "Quickly assess if the data changes your recommendation", scores: { frameFlexibility: 0.7, analysisVsAction: 0.5, cogDiversitySeeking: 0.5 } },
        { key: "d", text: "Present the recommendation — one data point shouldn't derail a well-reasoned plan", scores: { frameFlexibility: 0.1, analysisVsAction: 0.2, conflictTolerance: 0.4 } },
      ],
    },
  ]);
  console.log("  ✓ 12 CDM assessment questions");

  // ── Goals ───────────────────────────────────────────
  // Cycles → org goals → team goals → individual goals → personal goals.
  // Team goal owners must match teams.managerId wired above.

  const [, q3] = await db
    .insert(goalCycles)
    .values([
      { name: "Q2 2026", startDate: "2026-04-01", endDate: "2026-06-30" },
      { name: "Q3 2026", startDate: "2026-07-01", endDate: "2026-09-30" },
    ])
    .returning();

  const [orgNps, orgFeedback] = await db
    .insert(goals)
    .values([
      {
        level: "org",
        title: "Grow NPS from 42 to 55",
        description: "Make customers measurably happier this quarter.",
        cycleId: q3.id,
        ownerId: u("Dana Whitfield"),
        createdById: u("Dana Whitfield"),
        status: "on_track",
        metricName: "NPS",
        metricStartValue: 42,
        metricTargetValue: 55,
        metricCurrentValue: 49,
      },
      {
        level: "org",
        title: "Every team runs on continuous feedback",
        description: "Weekly feedback loops embedded in every team's rhythm.",
        cycleId: q3.id,
        ownerId: u("Dana Whitfield"),
        createdById: u("Dana Whitfield"),
        status: "on_track",
        progressPercent: 40,
      },
    ])
    .returning();

  const [teamOnboarding, teamCheckout, teamThemes] = await db
    .insert(goals)
    .values([
      {
        level: "team",
        title: "Ship self-serve onboarding",
        description: "New users activate without a sales call.",
        parentGoalId: orgNps.id,
        cycleId: q3.id,
        teamId: corePlatform.id,
        ownerId: u("Jordan Wells"),
        createdById: u("Jordan Wells"),
        status: "on_track",
        progressPercent: 65,
      },
      {
        level: "team",
        title: "Make checkout feel instant",
        description: "Sub-second perceived latency on the purchase path.",
        parentGoalId: orgNps.id,
        cycleId: q3.id,
        teamId: corePlatform.id,
        ownerId: u("Jordan Wells"),
        createdById: u("Jordan Wells"),
        status: "at_risk",
        metricName: "p95 latency (ms)",
        metricStartValue: 1400,
        metricTargetValue: 800,
        metricCurrentValue: 1150,
      },
      {
        level: "team",
        title: "Automate feedback theme discovery",
        description: "Themes surface themselves — no manual tagging.",
        parentGoalId: orgFeedback.id,
        cycleId: q3.id,
        teamId: dataML.id,
        ownerId: u("Priya Sharma"),
        createdById: u("Priya Sharma"),
        status: "on_track",
        progressPercent: 35,
      },
    ])
    .returning();

  const [indChecklist, , , indLabels] = await db
    .insert(goals)
    .values([
      {
        level: "individual",
        title: "Own the onboarding checklist revamp",
        description: "Redesigned checklist flow that anchors team activation.",
        parentGoalId: teamOnboarding.id,
        cycleId: q3.id,
        teamId: corePlatform.id,
        ownerId: u("Sarah Chen"),
        createdById: u("Sarah Chen"),
        status: "on_track",
        progressPercent: 55,
      },
      {
        level: "individual",
        title: "Migrate signup service to the new API",
        parentGoalId: teamOnboarding.id,
        cycleId: q3.id,
        teamId: corePlatform.id,
        ownerId: u("Marcus Rivera"),
        createdById: u("Jordan Wells"),
        status: "on_track",
        progressPercent: 70,
      },
      {
        level: "individual",
        title: "Cut checkout image payloads by 60%",
        parentGoalId: teamCheckout.id,
        cycleId: q3.id,
        teamId: corePlatform.id,
        ownerId: u("Aisha Patel"),
        createdById: u("Aisha Patel"),
        status: "behind",
        progressPercent: 30,
      },
      {
        level: "individual",
        title: "Label 500 feedback samples for the theme model",
        parentGoalId: teamThemes.id,
        cycleId: q3.id,
        teamId: dataML.id,
        ownerId: u("Rachel Adams"),
        createdById: u("Priya Sharma"),
        status: "on_track",
        metricName: "labeled samples",
        metricStartValue: 0,
        metricTargetValue: 500,
        metricCurrentValue: 320,
      },
    ])
    .returning();

  await db.insert(goals).values([
    {
      level: "personal",
      title: "Learn Python",
      description: "Project-based course, then ship one internal tool.",
      ownerId: u("Sarah Chen"),
      createdById: u("Sarah Chen"),
      status: "on_track",
      progressPercent: 30,
      targetDate: "2026-12-15",
      shareWithManager: false,
    },
    {
      level: "personal",
      title: "Present at a team learning session",
      ownerId: u("Marcus Rivera"),
      createdById: u("Marcus Rivera"),
      status: "on_track",
      progressPercent: 10,
      shareWithManager: true,
    },
  ]);

  await db.insert(goalUpdates).values([
    {
      goalId: orgNps.id,
      authorId: u("Dana Whitfield"),
      metricCurrentValue: 46,
      status: "on_track",
      note: "First survey wave back — trending up.",
      source: "dashboard",
      createdAt: new Date("2026-07-06T10:00:00Z"),
    },
    {
      goalId: orgNps.id,
      authorId: u("Dana Whitfield"),
      metricCurrentValue: 49,
      status: "on_track",
      note: "Onboarding changes showing in the numbers.",
      source: "dashboard",
      createdAt: new Date("2026-07-13T10:00:00Z"),
    },
    {
      goalId: teamOnboarding.id,
      authorId: u("Jordan Wells"),
      progressPercent: 65,
      status: "on_track",
      note: "Checklist flow merged; email sequence remains.",
      source: "dashboard",
      createdAt: new Date("2026-07-10T15:00:00Z"),
    },
    {
      goalId: teamCheckout.id,
      authorId: u("Jordan Wells"),
      metricCurrentValue: 1150,
      status: "at_risk",
      note: "CDN migration blocked on infra review.",
      source: "dashboard",
      createdAt: new Date("2026-07-11T09:00:00Z"),
    },
    {
      goalId: indChecklist.id,
      authorId: u("Sarah Chen"),
      progressPercent: 55,
      status: "on_track",
      note: "Mentioned steady progress in weekly reflection.",
      source: "chat",
      createdAt: new Date("2026-07-12T16:30:00Z"),
    },
    {
      goalId: indLabels.id,
      authorId: u("Rachel Adams"),
      metricCurrentValue: 320,
      status: "on_track",
      note: "320 samples labeled, quality holding.",
      source: "dashboard",
      createdAt: new Date("2026-07-13T11:00:00Z"),
    },
  ]);

  console.log("  ✓ 2 goal cycles, 11 goals, 6 goal updates");

  // ── Recent activity (dates relative to today) ─────────
  // The fixed 2026 dates above go stale; these keep dashboards and the
  // browser regression checks (e2e/specs/regression.spec.ts) meaningful on a
  // fresh seed: this week's engagement, a completed reflection, and an open
  // escalation plus a pulse alert for one of Jordan's reports.
  const monday = (offsetWeeks: number) => {
    const d = new Date();
    const day = (d.getUTCDay() + 6) % 7; // 0 = Monday
    d.setUTCDate(d.getUTCDate() - day - 7 * offsetWeeks);
    return d.toISOString().slice(0, 10);
  };
  for (const user of engData) {
    const latest = user.scores[user.scores.length - 1];
    await db.insert(engagementScores).values(
      [1, 0].map((offset) => ({
        userId: u(user.name),
        weekStarting: monday(offset),
        interactionsCompleted: latest > 70 ? 3 : latest > 50 ? 2 : 1,
        interactionsTarget: 3,
        averageQualityScore: latest,
        responseRate: latest / 100,
        streak: 0,
        rank: null,
      })),
    );
  }
  await db.insert(selfReflections).values({
    userId: u("Sarah Chen"),
    weekStarting: monday(0),
    status: "completed",
    mood: "good",
    highlights: "Shipped the onboarding checklist and paired with Marcus on the migration.",
    challenges: "Estimates on the migration work keep slipping.",
    goalForNextWeek: "Break the migration into smaller, estimable pieces.",
    engagementScore: 80,
    promptTheme: "weekly",
    completedAt: new Date(),
  });
  // Raised by a colleague (an escalation needs a reporter or a feedback entry).
  await db.insert(escalations).values({
    reporterId: u("Marcus Rivera"),
    subjectId: u("David Kim"),
    type: "other",
    severity: "medium",
    status: "open",
    reason: "Dismissive tone towards teammates in recent stand-ups",
    description: "Raised by a colleague for a coaching conversation.",
    flaggedContent: "",
  });
  await db.insert(pulseCheckTriggers).values({
    sourceType: "engagement_drop",
    sourceRef: u("David Kim"),
    sentiment: "negative",
  });
  console.log("  ✓ recent activity: 2 weeks of engagement, 1 reflection, 1 escalation, 1 pulse alert");

  console.log("\nSeed complete!");
  await pgSql.end();
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
