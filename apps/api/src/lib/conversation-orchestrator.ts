import { eq } from "drizzle-orm";
import type { Queue } from "bullmq";
import type { TenantDb } from "@revualy/db";
import {
  conversations,
  conversationMessages,
  questionnaires,
  questionnaireThemes,
  users,
} from "@revualy/db";
import type { LLMGateway } from "@revualy/ai-core";
import type { AdapterRegistry, OutboundMessage } from "@revualy/chat-core";
import type { ChatPlatform, InteractionType } from "@revualy/shared";

// ── Redis conversation state (hot path) ─────────────────

export interface ConversationState {
  conversationId: string;
  orgId: string;
  reviewerId: string;
  subjectId: string;
  interactionType: InteractionType;
  platform: ChatPlatform;
  channelId: string;
  threadId?: string;
  questionnaireId: string;
  /** Theme IDs selected for this conversation */
  selectedThemes: string[];
  /** Index of the current theme being explored */
  currentThemeIndex: number;
  /** Number of messages exchanged so far */
  messageCount: number;
  /** Max messages before auto-close (1-5 based on interaction type) */
  maxMessages: number;
  /** Conversation phase */
  phase: "opening" | "exploring" | "follow_up" | "closing";
  /** Message history for LLM context */
  messages: Array<{ role: "system" | "assistant" | "user"; content: string }>;
}

// ── Orchestrator ─────────────────────────────────────────

export interface OrchestratorDeps {
  llm: LLMGateway;
  adapters: AdapterRegistry;
  analysisQueue: Queue;
}

/**
 * Initiate a new conversation.
 * Called by the scheduler worker when it's time for an interaction.
 */
export async function initiateConversation(
  db: TenantDb,
  deps: OrchestratorDeps,
  params: {
    orgId: string;
    reviewerId: string;
    subjectId: string;
    interactionType: InteractionType;
    platform: ChatPlatform;
    channelId: string;
    questionnaireId: string;
  },
): Promise<ConversationState> {
  // 1. Fetch questionnaire and themes
  const [questionnaire] = await db
    .select()
    .from(questionnaires)
    .where(eq(questionnaires.id, params.questionnaireId));

  const themes = await db
    .select()
    .from(questionnaireThemes)
    .where(eq(questionnaireThemes.questionnaireId, params.questionnaireId))
    .orderBy(questionnaireThemes.sortOrder);

  // 2. Fetch reviewer and subject names for personalization
  const [reviewer] = await db
    .select()
    .from(users)
    .where(eq(users.id, params.reviewerId));
  const [subject] = await db
    .select()
    .from(users)
    .where(eq(users.id, params.subjectId));

  // 3. Select 2-3 themes for this conversation (don't use all every time)
  const maxThemes = Math.min(themes.length, params.interactionType === "self_reflection" ? 3 : 2);
  const selectedThemes = themes.slice(0, maxThemes);

  // 4. Determine max messages based on interaction type
  const maxMessages = getMaxMessages(params.interactionType);

  // 5. Generate opening question
  const firstTheme = selectedThemes[0];
  const openingQuestion = await generateQuestion(deps.llm, {
    theme: firstTheme,
    verbatim: questionnaire?.verbatim ?? false,
    reviewerName: reviewer?.name ?? "there",
    subjectName: subject?.name ?? "your colleague",
    interactionType: params.interactionType,
    isOpening: true,
    priorMessages: [],
  });

  // 6. Create conversation record in DB
  const [conversation] = await db
    .insert(conversations)
    .values({
      reviewerId: params.reviewerId,
      subjectId: params.subjectId,
      interactionType: params.interactionType,
      platform: params.platform,
      platformChannelId: params.channelId,
      status: "initiated",
      messageCount: 1,
      scheduledAt: new Date(),
      initiatedAt: new Date(),
    })
    .returning();

  // 7. Store the opening message
  await db.insert(conversationMessages).values({
    conversationId: conversation.id,
    role: "assistant",
    content: openingQuestion,
  });

  // 8. Send the message via chat adapter
  await sendMessage(deps.adapters, {
    platform: params.platform,
    channelId: params.channelId,
    text: openingQuestion,
  });

  // 9. Build conversation state for Redis
  const state: ConversationState = {
    conversationId: conversation.id,
    orgId: params.orgId,
    reviewerId: params.reviewerId,
    subjectId: params.subjectId,
    interactionType: params.interactionType,
    platform: params.platform,
    channelId: params.channelId,
    questionnaireId: params.questionnaireId,
    selectedThemes: selectedThemes.map((t) => t.id),
    currentThemeIndex: 0,
    messageCount: 1,
    maxMessages,
    phase: "opening",
    messages: [{ role: "assistant", content: openingQuestion }],
  };

  return state;
}

/**
 * Handle an inbound reply from the user.
 * Decides whether to follow up, move to next theme, or close.
 */
export async function handleReply(
  db: TenantDb,
  deps: OrchestratorDeps,
  state: ConversationState,
  userMessage: string,
): Promise<{ state: ConversationState; closed: boolean }> {
  // 1. Store the user's message
  await db.insert(conversationMessages).values({
    conversationId: state.conversationId,
    role: "user",
    content: userMessage,
  });

  state.messages.push({ role: "user", content: userMessage });
  state.messageCount++;

  // 2. Update conversation record
  await db
    .update(conversations)
    .set({ messageCount: state.messageCount, status: "in_progress" })
    .where(eq(conversations.id, state.conversationId));

  // 3. Decide next action
  const decision = await decideNextAction(deps.llm, state, userMessage);

  if (decision === "close" || state.messageCount >= state.maxMessages) {
    // Close the conversation
    return await closeConversation(db, deps, state);
  }

  if (decision === "next_theme") {
    state.currentThemeIndex++;
    state.phase = "exploring";
  } else {
    state.phase = "follow_up";
  }

  // 4. Generate next question
  const currentTheme = await getCurrentTheme(db, state);
  const [questionnaire] = await db
    .select()
    .from(questionnaires)
    .where(eq(questionnaires.id, state.questionnaireId));

  const [subject] = await db
    .select()
    .from(users)
    .where(eq(users.id, state.subjectId));

  const nextQuestion = await generateQuestion(deps.llm, {
    theme: currentTheme,
    verbatim: questionnaire?.verbatim ?? false,
    reviewerName: "", // not needed for follow-ups
    subjectName: subject?.name ?? "your colleague",
    interactionType: state.interactionType,
    isOpening: false,
    priorMessages: state.messages,
  });

  // 5. Store and send
  await db.insert(conversationMessages).values({
    conversationId: state.conversationId,
    role: "assistant",
    content: nextQuestion,
  });

  state.messages.push({ role: "assistant", content: nextQuestion });
  state.messageCount++;

  await sendMessage(deps.adapters, {
    platform: state.platform,
    channelId: state.channelId,
    text: nextQuestion,
  });

  return { state, closed: false };
}

/**
 * Close the conversation and enqueue analysis.
 */
async function closeConversation(
  db: TenantDb,
  deps: OrchestratorDeps,
  state: ConversationState,
): Promise<{ state: ConversationState; closed: boolean }> {
  // Send closing message
  const closingMessage = getClosingMessage(state.interactionType);

  await db.insert(conversationMessages).values({
    conversationId: state.conversationId,
    role: "assistant",
    content: closingMessage,
  });

  await sendMessage(deps.adapters, {
    platform: state.platform,
    channelId: state.channelId,
    text: closingMessage,
  });

  // Update conversation status
  await db
    .update(conversations)
    .set({
      status: "closed",
      closedAt: new Date(),
      messageCount: state.messageCount + 1,
    })
    .where(eq(conversations.id, state.conversationId));

  // Enqueue analysis job
  await deps.analysisQueue.add("analyze", {
    conversationId: state.conversationId,
    orgId: state.orgId,
  });

  state.phase = "closing";
  return { state, closed: true };
}

// ── LLM helpers ─────────────────────────────────────────

interface QuestionGenParams {
  theme: {
    intent: string;
    dataGoal: string;
    examplePhrasings: string[];
  } | null;
  verbatim: boolean;
  reviewerName: string;
  subjectName: string;
  interactionType: InteractionType;
  isOpening: boolean;
  priorMessages: Array<{ role: string; content: string }>;
}

async function generateQuestion(
  llm: LLMGateway,
  params: QuestionGenParams,
): Promise<string> {
  if (!params.theme) {
    return "Thanks for your time! Is there anything else you'd like to share?";
  }

  // Verbatim mode: use exact first example phrasing
  if (params.verbatim && params.theme.examplePhrasings.length > 0) {
    return params.theme.examplePhrasings[0];
  }

  const interactionLabel = {
    peer_review: "peer review",
    self_reflection: "self-reflection",
    three_sixty: "360 review",
    pulse_check: "pulse check",
  }[params.interactionType];

  const systemPrompt = `You are a warm, professional AI coach conducting a ${interactionLabel} conversation.
Your goal: ${params.theme.dataGoal}
Theme intent: ${params.theme.intent}
${params.theme.examplePhrasings.length > 0 ? `Example phrasings (for inspiration, don't copy verbatim): ${params.theme.examplePhrasings.join(" | ")}` : ""}

Rules:
- Ask ONE focused question at a time
- Be conversational and warm, not robotic
- Keep it under 2 sentences
- ${params.isOpening ? `Address the reviewer by name ("Hi ${params.reviewerName}")` : "Build on what they just shared"}
- Reference ${params.subjectName} naturally when relevant
- Never reveal you're following a questionnaire`;

  const messages = params.isOpening
    ? [{ role: "system" as const, content: systemPrompt }]
    : [
        { role: "system" as const, content: systemPrompt },
        ...params.priorMessages.map((m) => ({
          role: m.role as "system" | "user" | "assistant",
          content: m.content,
        })),
      ];

  const response = await llm.complete({
    messages,
    tier: "standard",
    maxTokens: 150,
    temperature: 0.7,
  });

  return response.content.trim();
}

async function decideNextAction(
  llm: LLMGateway,
  state: ConversationState,
  lastReply: string,
): Promise<"follow_up" | "next_theme" | "close"> {
  // If we've used all themes, close
  if (state.currentThemeIndex >= state.selectedThemes.length - 1 && state.phase !== "opening") {
    return "close";
  }

  // If only 1 message left before max, close
  if (state.messageCount >= state.maxMessages - 1) {
    return "close";
  }

  // Use LLM to decide if the response was substantive enough to move on
  const response = await llm.complete({
    messages: [
      {
        role: "system",
        content: `You are analyzing a conversation reply to decide the next action.
The user replied: "${lastReply}"

Evaluate:
1. Did they give a substantive, specific answer? (more than a few words, includes details/examples)
2. Is there a clear opportunity for a meaningful follow-up?

Respond with exactly ONE word: "follow_up" if the answer is vague and needs elaboration, "next_theme" if the answer is complete and specific, or "close" if the conversation feels natural to end.`,
      },
    ],
    tier: "fast",
    maxTokens: 10,
    temperature: 0,
  });

  const decision = response.content.trim().toLowerCase();
  if (decision.includes("follow_up")) return "follow_up";
  if (decision.includes("close")) return "close";
  return "next_theme";
}

// ── Utilities ────────────────────────────────────────────

function getMaxMessages(type: InteractionType): number {
  switch (type) {
    case "peer_review":
      return 5;
    case "self_reflection":
      return 4;
    case "three_sixty":
      return 5;
    case "pulse_check":
      return 3;
    default:
      return 4;
  }
}

function getClosingMessage(type: InteractionType): string {
  switch (type) {
    case "peer_review":
      return "Thanks so much for sharing your thoughts! Your feedback makes a real difference. Have a great rest of your day.";
    case "self_reflection":
      return "Great reflection session! Taking time to think about your week is a real strength. Keep it up!";
    case "three_sixty":
      return "Really appreciate your candid feedback. This kind of input is invaluable for growth. Thank you!";
    case "pulse_check":
      return "Thanks for the quick check-in! Your input helps us keep a pulse on how things are going.";
    default:
      return "Thanks for your time! Your input is really valuable.";
  }
}

async function getCurrentTheme(
  db: TenantDb,
  state: ConversationState,
): Promise<{ intent: string; dataGoal: string; examplePhrasings: string[] } | null> {
  const themeId = state.selectedThemes[state.currentThemeIndex];
  if (!themeId) return null;

  const [theme] = await db
    .select()
    .from(questionnaireThemes)
    .where(eq(questionnaireThemes.id, themeId));

  return theme
    ? {
        intent: theme.intent,
        dataGoal: theme.dataGoal,
        examplePhrasings: theme.examplePhrasings,
      }
    : null;
}

async function sendMessage(
  adapters: AdapterRegistry,
  params: { platform: ChatPlatform; channelId: string; text: string; threadId?: string },
): Promise<void> {
  if (!adapters.has(params.platform)) return;

  const message: OutboundMessage = {
    platform: params.platform,
    channelId: params.channelId,
    threadId: params.threadId,
    text: params.text,
    blocks: [],
  };

  await adapters.sendMessage(message);
}
