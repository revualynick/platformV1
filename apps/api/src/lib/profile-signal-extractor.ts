export interface ProfileSignalInput {
  text: string;
  sentiment: string;
  wordCount: number;
  hasSpecificExamples: boolean;
  interactionType: string;
}

export interface ProfileSignal {
  framework: string;
  dimension: string;
  value: number;
  confidence: number;
}

// ── Colour signal extraction ─────────────────────────────

const COLOUR_PATTERNS = {
  red: {
    keywords: ["need", "must", "immediately", "let's", "decided", "result", "action", "done", "deadline", "deliver", "achieve", "execute"],
    patterns: [/\b(we need|must|immediately|action required|bottom line|end result|let's get|decided to)\b/gi],
  },
  yellow: {
    keywords: ["great", "love", "team", "together", "excited", "amazing", "brainstorm", "collaborate", "celebrate", "energy", "fun", "inspire"],
    patterns: [/!/g, /\b(love|amazing|excited|great work|brainstorm|together|collaborate|let's explore)\b/gi],
  },
  green: {
    keywords: ["feel", "understand", "help", "support", "appreciate", "listen", "care", "wellbeing", "comfortable", "trust", "safe"],
    patterns: [/\b(how are you|take your time|appreciate|i understand|here to help|feel free|you're doing|i value)\b/gi],
  },
  blue: {
    keywords: ["data", "analysis", "evidence", "specifically", "process", "measured", "according", "based on", "structured", "methodology", "metric", "benchmark"],
    patterns: [/\b(data shows|analysis|evidence suggests|specifically|according to|based on|measured|process|methodology)\b/gi],
  },
};

function countMatches(text: string, keywords: string[], patterns: RegExp[]): number {
  const lower = text.toLowerCase();
  let count = 0;
  for (const kw of keywords) {
    if (lower.includes(kw)) count++;
  }
  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches) count += matches.length;
  }
  return count;
}

function extractColourSignals(text: string): Array<{ dimension: string; value: number; confidence: number }> {
  const results: Array<{ dimension: string; value: number; confidence: number }> = [];
  const counts: Record<string, number> = {};

  for (const [colour, spec] of Object.entries(COLOUR_PATTERNS)) {
    counts[colour] = countMatches(text, spec.keywords, spec.patterns);
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0) return results;

  for (const [colour, count] of Object.entries(counts)) {
    if (count < 2) continue;
    const value = count / total;
    const confidence = Math.min(1, count / 6);
    results.push({ dimension: colour, value, confidence });
  }

  return results;
}

// ── CDM signal extraction ────────────────────────────────

function extractCdmSignals(text: string): Array<{ dimension: string; value: number; confidence: number }> {
  const results: Array<{ dimension: string; value: number; confidence: number }> = [];
  const lower = text.toLowerCase();

  // inquiryVsAdvocacy: question ratio vs statements
  const questionCount = (text.match(/\?/g) || []).length;
  const sentenceCount = Math.max(1, (text.match(/[.!?]/g) || []).length);
  if (questionCount + sentenceCount >= 2) {
    const value = questionCount / sentenceCount;
    const confidence = Math.min(1, (questionCount + sentenceCount) / 8);
    if (confidence >= 0.2) {
      results.push({ dimension: "inquiryVsAdvocacy", value: Math.min(1, value), confidence });
    }
  }

  // conflictTolerance: disagreement / challenge phrases
  const conflictTerms = ["however", "but i think", "disagree", "on the other hand", "i'd push back", "challenge this", "not sure i agree", "contrary to", "in contrast"];
  const hedgeTerms = ["i agree", "absolutely", "exactly", "definitely", "of course", "totally agree"];
  const conflictCount = conflictTerms.filter((t) => lower.includes(t)).length;
  const hedgeCount = hedgeTerms.filter((t) => lower.includes(t)).length;
  if (conflictCount + hedgeCount >= 2) {
    const value = conflictCount / (conflictCount + hedgeCount + 1);
    const confidence = Math.min(1, (conflictCount + hedgeCount) / 4);
    results.push({ dimension: "conflictTolerance", value, confidence });
  }

  // frameFlexibility: reframing language
  const reframeTerms = ["another way to look at", "what if we", "alternatively", "reframe", "different perspective", "another angle", "let's consider", "flip this", "viewed differently"];
  const reframeCount = reframeTerms.filter((t) => lower.includes(t)).length;
  if (reframeCount >= 2) {
    const value = Math.min(1, reframeCount / 4);
    const confidence = Math.min(1, reframeCount / 3);
    results.push({ dimension: "frameFlexibility", value, confidence });
  }

  // analysisVsAction: data/evidence refs vs action words
  const analysisTerms = ["data", "evidence", "analysis", "research", "metrics", "statistics", "findings", "measured", "according to", "based on"];
  const actionTerms = ["let's do", "we should", "action item", "next step", "move forward", "implement", "execute", "start now", "immediately"];
  const analysisCount = analysisTerms.filter((t) => lower.includes(t)).length;
  const actionCount = actionTerms.filter((t) => lower.includes(t)).length;
  if (analysisCount + actionCount >= 2) {
    const value = analysisCount / (analysisCount + actionCount + 1);
    const confidence = Math.min(1, (analysisCount + actionCount) / 5);
    results.push({ dimension: "analysisVsAction", value, confidence });
  }

  // cogDiversitySeeking: asking for other perspectives
  const diversityTerms = ["what do others think", "different angle", "have you considered", "other perspectives", "what's your view", "curious what", "anyone else think", "diverse views", "other opinions"];
  const diversityCount = diversityTerms.filter((t) => lower.includes(t)).length;
  if (diversityCount >= 2) {
    const value = Math.min(1, diversityCount / 4);
    const confidence = Math.min(1, diversityCount / 3);
    results.push({ dimension: "cogDiversitySeeking", value, confidence });
  }

  // postMortemOrientation: past decisions / lessons learned
  const postMortemTerms = ["lessons learned", "retrospective", "looking back", "in hindsight", "what we learned", "past decision", "review what happened", "post-mortem", "debrief", "what went wrong", "what went well"];
  const postMortemCount = postMortemTerms.filter((t) => lower.includes(t)).length;
  if (postMortemCount >= 2) {
    const value = Math.min(1, postMortemCount / 4);
    const confidence = Math.min(1, postMortemCount / 3);
    results.push({ dimension: "postMortemOrientation", value, confidence });
  }

  return results;
}

// ── Public API ───────────────────────────────────────────

export function extractProfileSignals(params: ProfileSignalInput): ProfileSignal[] {
  const colourSignals = extractColourSignals(params.text).map((s) => ({
    framework: "colour",
    ...s,
  }));

  const cdmSignals = extractCdmSignals(params.text).map((s) => ({
    framework: "cdm",
    ...s,
  }));

  return [...colourSignals, ...cdmSignals];
}
