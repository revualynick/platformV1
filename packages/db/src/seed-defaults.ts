/**
 * Non-destructive defaults for a new tenant: org settings, core values, the
 * built-in questionnaires and the first admin. Safe to re-run: every insert
 * is skipped when the row already exists, and nothing is ever deleted.
 *
 * Unlike seed.ts (demo data) and bootstrap.ts, which both wipe every table,
 * this is the only seed that may be pointed at a real tenant database.
 *
 * Usage:
 *   DATABASE_URL=... SEED_ORG_NAME="Acme Corp" SEED_SUBDOMAIN=acme \
 *   SEED_ADMIN_EMAIL=ops@acme.com [SEED_ADMIN_NAME="Ops"] \
 *   [SEED_ALLOWED_DOMAINS=acme.com,acme.co.uk] tsx src/seed-defaults.ts
 */
import { and, eq } from "drizzle-orm";
import { createTenantClient } from "./tenant.js";
import { coreValues, orgSettings, questionnaires, questionnaireThemes, users } from "./schema/tenant.js";

const DEFAULT_CORE_VALUES = [
  { name: "Communication", description: "Clear, honest, and empathetic exchange of ideas" },
  { name: "Teamwork", description: "Collaborative spirit and mutual support" },
  { name: "Innovation", description: "Creative problem-solving and continuous improvement" },
  { name: "Ownership", description: "Accountability and follow-through on commitments" },
  { name: "Excellence", description: "High standards and attention to detail" },
];

interface ThemeDefault {
  intent: string;
  dataGoal: string;
  examplePhrasings: string[];
  coreValue: string | null;
}

const BUILT_IN_QUESTIONNAIRES: { name: string; category: string; themes: ThemeDefault[] }[] = [
  {
    name: "Sprint Peer Review",
    category: "peer_review",
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
    themes: [
      { intent: "Celebrate wins and build confidence", dataGoal: "Track what the person values about their own contributions", examplePhrasings: ["What felt like your biggest win this week?", "What are you most proud of from the last few days?"], coreValue: null },
      { intent: "Process challenges and blockers", dataGoal: "Identify recurring obstacles and coping strategies", examplePhrasings: ["What was the trickiest part of your week?", "Where did you feel stuck?"], coreValue: null },
    ],
  },
];

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`${name} env var is required`);
    process.exit(1);
  }
  return value;
}

async function seedDefaults() {
  const dbUrl = requireEnv("DATABASE_URL");
  const orgName = requireEnv("SEED_ORG_NAME");
  const subdomain = requireEnv("SEED_SUBDOMAIN");
  const adminEmail = requireEnv("SEED_ADMIN_EMAIL").toLowerCase();
  const adminName = process.env.SEED_ADMIN_NAME?.trim() || adminEmail.split("@")[0];
  const allowedDomains = (process.env.SEED_ALLOWED_DOMAINS ?? adminEmail.split("@")[1])
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);

  const { db, sql } = createTenantClient(dbUrl, { max: 1 });
  console.log("Seeding tenant defaults (non-destructive)...");

  try {
    await db.transaction(async (tx) => {
      // ── Org settings (single row) ───────────────────────
      const [settings] = await tx.select({ id: orgSettings.id }).from(orgSettings).limit(1);
      if (settings) {
        console.log("  - org settings already present, left unchanged");
      } else {
        await tx.insert(orgSettings).values({ name: orgName, subdomain, allowedDomains });
        console.log(`  + org settings (allowed domains: ${allowedDomains.join(", ")})`);
      }

      // ── Core values (only into an empty table, so admin edits stick) ──
      const existingValues = await tx.select({ id: coreValues.id, name: coreValues.name }).from(coreValues);
      if (existingValues.length > 0) {
        console.log(`  - ${existingValues.length} core values already present, left unchanged`);
      } else {
        await tx.insert(coreValues).values(DEFAULT_CORE_VALUES.map((v, i) => ({ ...v, sortOrder: i })));
        console.log(`  + ${DEFAULT_CORE_VALUES.length} core values`);
      }
      const valueRows = await tx.select({ id: coreValues.id, name: coreValues.name }).from(coreValues);
      const valueIds = new Map(valueRows.map((v) => [v.name, v.id]));

      // ── Built-in questionnaires (matched by name) ───────
      for (const qn of BUILT_IN_QUESTIONNAIRES) {
        const [existing] = await tx
          .select({ id: questionnaires.id })
          .from(questionnaires)
          .where(and(eq(questionnaires.name, qn.name), eq(questionnaires.source, "built_in")))
          .limit(1);
        if (existing) {
          console.log(`  - questionnaire "${qn.name}" already present`);
          continue;
        }
        const [created] = await tx
          .insert(questionnaires)
          .values({ name: qn.name, category: qn.category, source: "built_in", verbatim: false })
          .returning({ id: questionnaires.id });
        await tx.insert(questionnaireThemes).values(
          qn.themes.map((t, i) => ({
            questionnaireId: created.id,
            intent: t.intent,
            dataGoal: t.dataGoal,
            examplePhrasings: t.examplePhrasings,
            coreValueId: t.coreValue ? valueIds.get(t.coreValue) ?? null : null,
            sortOrder: i,
          })),
        );
        console.log(`  + questionnaire "${qn.name}" (${qn.themes.length} themes)`);
      }

      // ── First admin ─────────────────────────────────────
      const [admin] = await tx.select({ id: users.id, role: users.role }).from(users).where(eq(users.email, adminEmail));
      if (admin) {
        console.log(`  - admin ${adminEmail} already present (role ${admin.role}), left unchanged`);
      } else {
        await tx.insert(users).values({
          email: adminEmail,
          name: adminName,
          role: "super_admin",
          onboardingCompleted: true,
        });
        console.log(`  + admin ${adminEmail} (super_admin)`);
      }
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
  console.log("Tenant defaults ready.");
}

seedDefaults().catch((err) => {
  console.error("Seeding defaults failed:", err);
  process.exit(1);
});
