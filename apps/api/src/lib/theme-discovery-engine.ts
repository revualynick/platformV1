import { gte, eq } from "drizzle-orm";
import type { TenantDb } from "@revualy/db";
import { feedbackEntries, coreValues } from "@revualy/db";
import type { LLMGateway } from "@revualy/ai-core";

export interface DiscoveredTheme {
  name: string;
  description: string;
  frequency: number;
  confidence: number;
  relatedCoreValueName?: string;
  sampleEvidence: string[];
}

interface RawLLMTheme {
  name: string;
  description: string;
  frequency: number;
  confidence: number;
  related_core_value?: string;
  sample_evidence: string[];
}

const BATCH_SIZE = 20;
const MAX_THEMES = 15;

/**
 * Analyze recent feedback entries to discover recurring themes.
 * Batches feedback content and uses the LLM to identify patterns,
 * then merges and deduplicates results across batches.
 */
export async function discoverThemes(
  db: TenantDb,
  llm: LLMGateway,
  options?: {
    windowDays?: number;
    minFrequency?: number;
  },
): Promise<DiscoveredTheme[]> {
  const windowDays = options?.windowDays ?? 30;
  const minFrequency = options?.minFrequency ?? 3;

  // 1. Fetch recent feedback entries
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - windowDays);

  const entries = await db
    .select({
      rawContent: feedbackEntries.rawContent,
      aiSummary: feedbackEntries.aiSummary,
    })
    .from(feedbackEntries)
    .where(gte(feedbackEntries.createdAt, cutoff))
    .limit(500);

  if (entries.length === 0) {
    return [];
  }

  // 2. Fetch org's active core values for reference
  const orgValues = await db
    .select({ name: coreValues.name })
    .from(coreValues)
    .where(eq(coreValues.isActive, true));

  const coreValueNames = orgValues.map((v) => v.name);

  // 3. Batch the feedback content
  const batches: string[][] = [];
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE).map((e) => {
      // Prefer aiSummary for conciseness, fall back to rawContent
      const text = e.aiSummary?.trim() || e.rawContent;
      // Truncate very long entries to keep prompt manageable
      return text.length > 500 ? text.slice(0, 500) + "..." : text;
    });
    batches.push(batch);
  }

  // 4. Analyze each batch via LLM
  const batchResults = await Promise.allSettled(
    batches.map((batch) => analyzeBatch(llm, batch, coreValueNames)),
  );

  // 5. Collect all themes from successful batches
  const allThemes: DiscoveredTheme[] = [];
  for (const result of batchResults) {
    if (result.status === "fulfilled") {
      allThemes.push(...result.value);
    }
  }

  if (allThemes.length === 0) {
    return [];
  }

  // 6. Merge/deduplicate themes by name similarity
  const merged = mergeThemes(allThemes);

  // 7. Filter by minimum frequency and sort by frequency * confidence
  return merged
    .filter((t) => t.frequency >= minFrequency)
    .sort((a, b) => b.frequency * b.confidence - a.frequency * a.confidence)
    .slice(0, MAX_THEMES);
}

async function analyzeBatch(
  llm: LLMGateway,
  feedbackTexts: string[],
  coreValueNames: string[],
): Promise<DiscoveredTheme[]> {
  const numbered = feedbackTexts
    .map((text, i) => `[${i + 1}] ${text}`)
    .join("\n\n");

  const coreValuesRef =
    coreValueNames.length > 0
      ? `\nOrganization core values: ${coreValueNames.join(", ")}`
      : "";

  const response = await llm.complete({
    messages: [
      {
        role: "system",
        content: `You are an organizational psychologist analyzing peer feedback for recurring themes.`,
      },
      {
        role: "user",
        content: `Analyze these ${feedbackTexts.length} peer feedback excerpts and identify recurring themes or topics.
${coreValuesRef}

For each theme found, provide:
- name: short label, 2-4 words
- description: one sentence explaining the theme
- frequency: how many of the ${feedbackTexts.length} excerpts mention or relate to this theme
- confidence: 0-1, how clearly this theme emerges from the data
- related_core_value: if it maps to one of the core values listed above, provide the exact name; otherwise omit
- sample_evidence: 2-3 short verbatim quotes from the excerpts that exemplify this theme

Return a JSON array of theme objects. Only include themes mentioned by at least 2 excerpts.

Feedback excerpts:
${numbered}`,
      },
    ],
    tier: "standard",
    maxTokens: 2000,
    temperature: 0.2,
    jsonMode: true,
  });

  try {
    const parsed = JSON.parse(response.content) as RawLLMTheme[];
    if (!Array.isArray(parsed)) return [];

    return parsed.map((t) => ({
      name: String(t.name ?? "").slice(0, 200),
      description: String(t.description ?? ""),
      frequency: Math.max(0, Math.round(t.frequency ?? 0)),
      confidence: Math.max(0, Math.min(1, t.confidence ?? 0)),
      relatedCoreValueName: t.related_core_value || undefined,
      sampleEvidence: Array.isArray(t.sample_evidence)
        ? t.sample_evidence.slice(0, 5).map(String)
        : [],
    }));
  } catch {
    return [];
  }
}

/**
 * Merge themes with similar names across batches.
 * Uses case-insensitive exact match for deduplication.
 * Frequencies are summed, confidence is averaged, evidence is combined.
 */
function mergeThemes(themes: DiscoveredTheme[]): DiscoveredTheme[] {
  const map = new Map<string, DiscoveredTheme & { count: number }>();

  for (const theme of themes) {
    const key = theme.name.toLowerCase().trim();
    const existing = map.get(key);

    if (existing) {
      existing.frequency += theme.frequency;
      existing.confidence =
        (existing.confidence * existing.count + theme.confidence) /
        (existing.count + 1);
      existing.count += 1;
      // Merge evidence, keeping up to 5 unique samples
      const evidenceSet = new Set([
        ...existing.sampleEvidence,
        ...theme.sampleEvidence,
      ]);
      existing.sampleEvidence = [...evidenceSet].slice(0, 5);
      // Keep the longer description
      if (theme.description.length > existing.description.length) {
        existing.description = theme.description;
      }
      // Keep relatedCoreValueName if not already set
      if (!existing.relatedCoreValueName && theme.relatedCoreValueName) {
        existing.relatedCoreValueName = theme.relatedCoreValueName;
      }
    } else {
      map.set(key, { ...theme, count: 1 });
    }
  }

  // Strip the internal count field
  return [...map.values()].map(({ count: _, ...theme }) => theme);
}
