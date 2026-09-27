// Typed API client for Revualy backend
// Server components: uses absolute URL to Fastify + auth session headers
// Client components: not supported — use server actions instead

import "server-only";
import { auth } from "@/lib/auth";

const API_BASE = process.env.INTERNAL_API_URL ?? "http://localhost:3000";
function getInternalSecret(): string {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) {
    throw new Error("INTERNAL_API_SECRET env var is required");
  }
  return secret;
}

// ── Cache tiers ───────────────────────────────────────
type CacheTier = "none" | "short" | "medium" | "long";

const REVALIDATE: Record<Exclude<CacheTier, "none">, number> = {
  short: 60,    // 1 min — flagged items, feedback, dashboard stats
  medium: 300,  // 5 min — team roster, engagement scores, leaderboard
  long: 3600,   // 1 hr  — org config, core values, org settings
};

async function apiFetch<T>(
  path: string,
  init?: RequestInit & { cacheTier?: CacheTier; tags?: string[] },
): Promise<T> {
  // Resolve auth session for tenant context
  const session = await auth();
  if (!session) {
    throw new Error("No auth session — cannot make API request");
  }

  const authHeaders: Record<string, string> = {
    "x-org-id": session.orgId || process.env.ORG_ID || "",
    "x-user-id": session.user.id,
    "x-internal-secret": getInternalSecret(),
  };

  const cacheTier = init?.cacheTier ?? "none";

  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      // Only send Content-Type when there's actually a body — Fastify rejects an
      // empty body with content-type application/json (400), which silently broke
      // every bodyless POST/DELETE (deactivate, note delete, ws-token → realtime).
      ...(init?.body != null ? { "Content-Type": "application/json" } : {}),
      ...authHeaders,
      ...init?.headers,
    },
    cache: cacheTier === "none" ? "no-store" : "force-cache",
    next:
      cacheTier === "none"
        ? undefined
        : {
            revalidate: REVALIDATE[cacheTier],
            tags: init?.tags,
          },
  });

  if (!res.ok) {
    // Truncate body to prevent large dumps; log in all envs for observability
    const body = await res.text().catch(() => "");
    console.error(`API error ${res.status}: ${path} — ${body.slice(0, 500)}`);
    let apiMessage: string | undefined;
    try {
      const parsed = JSON.parse(body) as { error?: unknown };
      if (typeof parsed.error === "string" && res.status < 500) apiMessage = parsed.error;
    } catch {
      // not JSON
    }
    throw new ApiError(res.status, path, apiMessage);
  }

  return res.json() as Promise<T>;
}

/**
 * A failed API call. The message stays generic (it's logged and sometimes
 * shown); apiMessage carries the API's own 4xx explanation for screens
 * that want to show it ("Unsupported file type ...").
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    readonly apiMessage?: string,
  ) {
    super(`API request failed: ${status} ${path}`);
    this.name = "ApiError";
  }
}

/** The API's explanation when there is one, otherwise the fallback. */
export function friendlyError(err: unknown, fallback: string): string {
  return err instanceof ApiError && err.apiMessage ? err.apiMessage : fallback;
}

// ── Org / Admin ────────────────────────────────────────

export interface CoreValueRow {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface TeamRow {
  id: string;
  name: string;
  managerId: string | null;
  parentTeamId: string | null;
  createdAt: string;
}

export async function getOrgConfig() {
  return apiFetch<{ coreValues: CoreValueRow[]; teams: TeamRow[] }>(
    "/api/v1/admin/org",
    { cacheTier: "long", tags: ["org-config"] },
  );
}

export async function createCoreValue(data: {
  name: string;
  description?: string;
  sortOrder?: number;
}) {
  return apiFetch<CoreValueRow>("/api/v1/admin/values", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateCoreValue(
  id: string,
  data: { name?: string; description?: string; sortOrder?: number; isActive?: boolean },
) {
  return apiFetch<CoreValueRow>(`/api/v1/admin/values/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function bulkCreateCoreValues(
  values: Array<{ name: string; description?: string; sortOrder?: number }>,
) {
  return apiFetch<{ created: number; skipped: number; values: CoreValueRow[] }>(
    "/api/v1/admin/values/bulk",
    { method: "POST", body: JSON.stringify({ values }) },
  );
}

// ── Questionnaires ─────────────────────────────────────

export interface ThemeRow {
  id: string;
  questionnaireId: string;
  intent: string;
  dataGoal: string;
  examplePhrasings: string[];
  coreValueId: string | null;
  sortOrder: number;
  createdAt: string;
}

export interface QuestionnaireRow {
  id: string;
  name: string;
  category: string;
  source: string;
  verbatim: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  themes: ThemeRow[];
}

export async function getQuestionnaires() {
  return apiFetch<{ data: QuestionnaireRow[] }>(
    "/api/v1/admin/questionnaires",
    { cacheTier: "long", tags: ["questionnaires"] },
  );
}

export async function createQuestionnaire(data: {
  name: string;
  category: string;
  source?: string;
  verbatim?: boolean;
  themes?: Array<{
    intent: string;
    dataGoal: string;
    examplePhrasings?: string[];
    coreValueId?: string;
  }>;
}) {
  return apiFetch<QuestionnaireRow>("/api/v1/admin/questionnaires", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateQuestionnaire(
  id: string,
  data: { name?: string; category?: string; verbatim?: boolean; isActive?: boolean },
) {
  return apiFetch<QuestionnaireRow>(`/api/v1/admin/questionnaires/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteQuestionnaire(id: string) {
  return apiFetch<{ id: string; deleted: true }>(
    `/api/v1/admin/questionnaires/${id}`,
    { method: "DELETE" },
  );
}

export async function createTheme(
  questionnaireId: string,
  data: {
    intent: string;
    dataGoal: string;
    examplePhrasings?: string[];
    coreValueId?: string;
    sortOrder?: number;
  },
) {
  return apiFetch<ThemeRow>(
    `/api/v1/admin/questionnaires/${questionnaireId}/themes`,
    { method: "POST", body: JSON.stringify(data) },
  );
}

export async function updateTheme(
  id: string,
  data: {
    intent?: string;
    dataGoal?: string;
    examplePhrasings?: string[];
    coreValueId?: string | null;
    sortOrder?: number;
  },
) {
  return apiFetch<ThemeRow>(`/api/v1/admin/themes/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteTheme(id: string) {
  return apiFetch<{ id: string; deleted: true }>(
    `/api/v1/admin/themes/${id}`,
    { method: "DELETE" },
  );
}

// ── Org Settings ───────────────────────────────────────

export interface OrgSettingsRow {
  id: string;
  name: string;
  subdomain: string;
  timezone: string;
  allowedDomains: string[];
}

export async function updateOrgSettings(data: {
  name?: string;
  timezone?: string;
  allowedDomains?: string[];
  checkInTitleMarker?: string;
  oneOnOneIngestionMode?: IngestionMode;
  oneOnOneMaxMode?: IngestionMode;
}) {
  return apiFetch<OrgSettingsRow>("/api/v1/admin/org", {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

// ── Users ──────────────────────────────────────────────

export interface UserRow {
  id: string;
  email: string;
  name: string;
  role: string;
  teamId: string | null;
  managerId: string | null;
  timezone: string;
  isActive: boolean;
  onboardingCompleted: boolean;
  preferences: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export async function createUser(data: {
  email: string;
  name: string;
  role?: string;
  teamId?: string;
  managerId?: string;
  timezone?: string;
}) {
  return apiFetch<UserRow>("/api/v1/users", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function bulkCreateUsers(
  users: Array<{ email: string; name: string; role?: string; teamId?: string; timezone?: string }>,
) {
  return apiFetch<{ created: number; skipped: number; users: UserRow[] }>(
    "/api/v1/users/bulk",
    { method: "POST", body: JSON.stringify({ users }) },
  );
}

export async function getUser(id: string) {
  return apiFetch<UserRow>(`/api/v1/users/${id}`, { cacheTier: "short", tags: ["users"] });
}

export async function getCurrentUser() {
  return apiFetch<UserRow>("/api/v1/auth/me", { cacheTier: "short", tags: ["current-user"] });
}

export async function updateUser(
  id: string,
  data: {
    name?: string;
    role?: string;
    teamId?: string | null;
    timezone?: string;
    preferences?: Record<string, unknown>;
  },
) {
  return apiFetch<UserRow>(`/api/v1/users/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deactivateUser(id: string) {
  return apiFetch<UserRow>(`/api/v1/users/${id}/deactivate`, { method: "POST" });
}

export async function reactivateUser(id: string) {
  return apiFetch<UserRow>(`/api/v1/users/${id}/reactivate`, { method: "POST" });
}

export async function getUsers(filters?: { teamId?: string; managerId?: string }) {
  const params = new URLSearchParams();
  if (filters?.teamId) params.set("teamId", filters.teamId);
  if (filters?.managerId) params.set("managerId", filters.managerId);
  const qs = params.toString() ? `?${params.toString()}` : "";
  return apiFetch<{ data: UserRow[] }>(`/api/v1/users${qs}`, { cacheTier: "medium", tags: ["users"] });
}

// ── Engagement ─────────────────────────────────────────

export interface EngagementScoreRow {
  id: string;
  userId: string;
  weekStarting: string;
  interactionsCompleted: number;
  interactionsTarget: number;
  averageQualityScore: number;
  responseRate: number;
  streak: number;
  rank: number | null;
  createdAt: string;
}

// ── Feedback ───────────────────────────────────────────

export interface FeedbackEntryRow {
  id: string;
  conversationId: string;
  reviewerId: string;
  subjectId: string;
  interactionType: string;
  rawContent: string;
  aiSummary: string;
  sentiment: string;
  engagementScore: number;
  wordCount: number;
  hasSpecificExamples: boolean;
  /** From a conversation that ended early; excluded from quality averages. */
  isPartial?: boolean;
  createdAt: string;
  valueScores: Array<{
    id: string;
    feedbackEntryId: string;
    coreValueId: string;
    score: number;
    evidence: string;
  }>;
}

// ── Relationships ──────────────────────────────────────

export interface GraphNode {
  id: string;
  name: string;
  role: string;
  team: string | null;
  managerId: string | null;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  type: "reports_to" | "thread";
  label: string;
  tags: string[];
  strength: number;
  source: string;
}

export async function createRelationship(data: {
  fromUserId: string;
  toUserId: string;
  label?: string;
  tags?: string[];
  strength?: number;
  source?: string;
  notes?: string;
}) {
  return apiFetch("/api/v1/relationships", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateRelationship(
  id: string,
  data: {
    label?: string;
    tags?: string[];
    strength?: number;
    notes?: string;
    isActive?: boolean;
  },
) {
  return apiFetch(`/api/v1/relationships/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteRelationship(id: string) {
  return apiFetch<{ id: string; deleted: true }>(
    `/api/v1/relationships/${id}`,
    { method: "DELETE" },
  );
}

export async function updateManager(
  userId: string,
  managerId: string | null,
) {
  return apiFetch(`/api/v1/users/${userId}/manager`, {
    method: "PATCH",
    body: JSON.stringify({ managerId }),
  });
}

// ── Kudos ──────────────────────────────────────────────

export interface KudosRow {
  id: string;
  giverId: string;
  receiverId: string;
  giverName: string;
  receiverName: string;
  message: string;
  coreValueId: string | null;
  source: string;
  createdAt: string;
}

export async function createKudos(data: {
  receiverId: string;
  message: string;
  coreValueId?: string;
}) {
  return apiFetch<KudosRow>("/api/v1/kudos", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ── Manager ───────────────────────────────────────────

export interface ManagerQuestionnaireRow extends QuestionnaireRow {
  createdByUserId: string | null;
  teamScope: string | null;
}

export async function createManagerQuestionnaire(data: {
  name: string;
  category: string;
  source?: string;
  verbatim?: boolean;
  themes?: Array<{
    intent: string;
    dataGoal: string;
    examplePhrasings?: string[];
    coreValueId?: string;
  }>;
}) {
  return apiFetch<ManagerQuestionnaireRow>("/api/v1/manager/questionnaires", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function createManagerRelationship(data: {
  fromUserId: string;
  toUserId: string;
  label?: string;
  tags?: string[];
  strength?: number;
  source?: string;
}) {
  return apiFetch("/api/v1/manager/relationships", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ── Manager Notes ────────────────────────────────────

export interface ManagerNoteRow {
  id: string;
  managerId: string;
  subjectId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export async function createManagerNote(data: {
  subjectId: string;
  content: string;
}) {
  return apiFetch<ManagerNoteRow>("/api/v1/manager/notes", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateManagerNote(
  id: string,
  data: { content: string },
) {
  return apiFetch<ManagerNoteRow>(`/api/v1/manager/notes/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteManagerNote(id: string) {
  return apiFetch<{ id: string; deleted: true }>(
    `/api/v1/manager/notes/${id}`,
    { method: "DELETE" },
  );
}

// ── One-on-One Sessions ─────────────────────────────

export interface OneOnOneSession {
  id: string;
  managerId: string;
  employeeId: string;
  status: "scheduled" | "active" | "completed";
  scheduledAt: string;
  startedAt: string | null;
  endedAt: string | null;
  notes: string;
  summary: string;
  createdAt: string;
  updatedAt: string;
}

export interface OneOnOneActionItem {
  id: string;
  sessionId: string;
  text: string;
  assigneeId: string | null;
  dueDate: string | null;
  completed: boolean;
  completedAt: string | null;
  sortOrder: number;
  createdAt: string;
}

export interface OneOnOneAgendaItem {
  id: string;
  sessionId: string;
  text: string;
  source: "ai" | "manual";
  covered: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface OneOnOneSessionDetail extends OneOnOneSession {
  agendaItems: OneOnOneAgendaItem[];
  actionItems: OneOnOneActionItem[];
}

export async function getOneOnOneSessions(opts?: {
  employeeId?: string;
  status?: string;
}) {
  const params = new URLSearchParams();
  if (opts?.employeeId) params.set("employeeId", opts.employeeId);
  if (opts?.status) params.set("status", opts.status);
  const qs = params.toString() ? `?${params}` : "";
  return apiFetch<{ data: OneOnOneSession[] }>(
    `/api/v1/one-on-one-sessions${qs}`,
    { cacheTier: "short", tags: ["sessions"] },
  );
}

export async function getOneOnOneSession(id: string) {
  return apiFetch<OneOnOneSessionDetail>(
    `/api/v1/one-on-one-sessions/${id}`,
    { cacheTier: "short", tags: ["sessions"] },
  );
}

export async function createOneOnOneSession(data: {
  employeeId: string;
  scheduledAt: string;
}) {
  return apiFetch<OneOnOneSession>("/api/v1/one-on-one-sessions", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateOneOnOneSession(
  id: string,
  data: {
    status?: string;
    notes?: string;
    summary?: string;
    scheduledAt?: string;
  },
) {
  return apiFetch<OneOnOneSessionDetail>(
    `/api/v1/one-on-one-sessions/${id}`,
    { method: "PATCH", body: JSON.stringify(data) },
  );
}

export async function addActionItem(
  sessionId: string,
  data: { text: string; assigneeId?: string; dueDate?: string },
) {
  return apiFetch<OneOnOneActionItem>(
    `/api/v1/one-on-one-sessions/${sessionId}/action-items`,
    { method: "POST", body: JSON.stringify(data) },
  );
}

export async function updateActionItem(
  sessionId: string,
  itemId: string,
  data: { text?: string; completed?: boolean; assigneeId?: string | null; dueDate?: string | null },
) {
  return apiFetch<OneOnOneActionItem>(
    `/api/v1/one-on-one-sessions/${sessionId}/action-items/${itemId}`,
    { method: "PATCH", body: JSON.stringify(data) },
  );
}

export async function deleteActionItem(sessionId: string, itemId: string) {
  return apiFetch<{ success: boolean }>(
    `/api/v1/one-on-one-sessions/${sessionId}/action-items/${itemId}`,
    { method: "DELETE" },
  );
}

export async function addAgendaItem(
  sessionId: string,
  data: { text: string; source?: string },
) {
  return apiFetch<OneOnOneAgendaItem>(
    `/api/v1/one-on-one-sessions/${sessionId}/agenda`,
    { method: "POST", body: JSON.stringify(data) },
  );
}

export async function updateAgendaItem(
  sessionId: string,
  itemId: string,
  data: { covered?: boolean; text?: string },
) {
  return apiFetch<OneOnOneAgendaItem>(
    `/api/v1/one-on-one-sessions/${sessionId}/agenda/${itemId}`,
    { method: "PATCH", body: JSON.stringify(data) },
  );
}

export async function getWsToken(sessionId: string) {
  return apiFetch<{ token: string }>(
    `/api/v1/one-on-one-sessions/${sessionId}/ws-token`,
    { method: "POST" },
  );
}

export async function generateAgenda(sessionId: string) {
  return apiFetch<{ data: OneOnOneAgendaItem[] }>(
    `/api/v1/one-on-one-sessions/${sessionId}/generate-agenda`,
    { method: "POST" },
  );
}

// ── Notification Preferences ────────────────────────

export interface NotificationPreference {
  id: string | null;
  userId: string;
  type: "weekly_digest" | "flag_alert" | "nudge";
  enabled: boolean;
  channel: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export async function updateNotificationPreference(data: {
  type: string;
  enabled: boolean;
  channel?: string;
}) {
  return apiFetch<NotificationPreference>(
    "/api/v1/notifications/preferences",
    { method: "PATCH", body: JSON.stringify(data) },
  );
}

// ── Demo Conversations ──────────────────────────────

export interface DemoStartResponse {
  conversationId: string;
  message: string;
  phase: string;
  messageCount: number;
  maxMessages: number;
  interactionType: string;
}

export interface DemoReplyResponse {
  message: string;
  closed: boolean;
  phase: string;
  messageCount: number;
  maxMessages: number;
}

export async function startDemoConversation() {
  return apiFetch<DemoStartResponse>("/api/v1/demo/start", {
    method: "POST",
  });
}

export async function sendDemoReply(
  conversationId: string,
  message: string,
) {
  return apiFetch<DemoReplyResponse>(
    `/api/v1/demo/${conversationId}/reply`,
    { method: "POST", body: JSON.stringify({ message }) },
  );
}

// ── Users (onboarding) ──────────────────────────────

export async function completeOnboarding() {
  return apiFetch<{ success: boolean }>("/api/v1/users/me/onboarding", {
    method: "PATCH",
  });
}

// ── Self Reflections ────────────────────────────────

export interface SelfReflectionRow {
  id: string;
  userId: string;
  conversationId: string | null;
  weekStarting: string;
  status: "pending" | "in_progress" | "completed" | "skipped";
  mood: string | null;
  highlights: string | null;
  challenges: string | null;
  goalForNextWeek: string | null;
  engagementScore: number | null;
  promptTheme: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReflectionStatsRow {
  totalCompleted: number;
  avgEngagementScore: number | null;
  currentStreak: number;
  topMood: string | null;
}

// ── Campaigns ───────────────────────────────────────────

export type CampaignStatus =
  | "draft"
  | "scheduled"
  | "collecting"
  | "analyzing"
  | "complete";

export interface CampaignRow {
  id: string;
  name: string;
  description: string;
  questionnaireId: string | null;
  status: CampaignStatus;
  startDate: string | null;
  endDate: string | null;
  targetAudience: string | null;
  targetTeamId: string | null;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  questionnaire?: {
    id: string;
    name: string;
    themes: Array<{
      id: string;
      intent: string;
      dataGoal: string;
      examplePhrasings: string[];
      coreValueId: string | null;
      sortOrder: number;
    }>;
  } | null;
}

export async function getCampaign(id: string) {
  return apiFetch<CampaignRow>(`/api/v1/admin/campaigns/${id}`, { cacheTier: "medium", tags: ["campaigns"] });
}

export async function createCampaign(data: {
  name: string;
  description?: string;
  questionnaireId?: string;
  startDate?: string;
  endDate?: string;
  targetAudience?: string;
  targetTeamId?: string;
}) {
  return apiFetch<CampaignRow>("/api/v1/admin/campaigns", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateCampaign(
  id: string,
  data: Partial<{
    name: string;
    description: string;
    questionnaireId: string | null;
    startDate: string | null;
    endDate: string | null;
    targetAudience: string | null;
    targetTeamId: string | null;
  }>,
) {
  return apiFetch<CampaignRow>(`/api/v1/admin/campaigns/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteCampaign(id: string) {
  return apiFetch<{ id: string; deleted: boolean }>(
    `/api/v1/admin/campaigns/${id}`,
    { method: "DELETE" },
  );
}

export async function advanceCampaign(id: string) {
  return apiFetch<CampaignRow>(`/api/v1/admin/campaigns/${id}/advance`, {
    method: "POST",
  });
}

export async function sendCampaignChatMessage(
  id: string,
  message: string,
) {
  return apiFetch<{ reply: string; suggestions: string[] }>(
    `/api/v1/admin/campaigns/${id}/ai-chat`,
    { method: "POST", body: JSON.stringify({ message }) },
  );
}

// ── Integrations ────────────────────────────────────

export interface IntegrationRow {
  id: string;
  platform: string;
  name: string;
  status: string;
  hasConfig: boolean;
  workspace: string | null;
  connectedAt: string | null;
  connectedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function connectIntegration(
  id: string,
  data: { config?: Record<string, unknown>; workspace?: string },
) {
  return apiFetch<IntegrationRow>(`/api/v1/admin/integrations/${id}/connect`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function disconnectIntegration(id: string) {
  return apiFetch<IntegrationRow>(
    `/api/v1/admin/integrations/${id}/disconnect`,
    { method: "POST" },
  );
}

// ── Assessments & Profiling ────────────────────────────

export interface AssessmentFrameworkRow {
  framework: string;
  questionCount: number;
}

export interface AssessmentQuestionRow {
  id: string;
  framework: string;
  questionType: string;
  text: string;
  options: Array<{ key: string; text: string }>;
  sortOrder: number;
}

export interface AssessmentSessionRow {
  id: string;
  userId: string;
  framework: string;
  context: string;
  responses: Record<string, string>;
  startedAt: string;
  completedAt: string | null;
}

export interface ProfileSnapshotRow {
  id: string;
  userId: string;
  framework: string;
  source: string;
  sessionId: string | null;
  dimensions: Record<string, number>;
  signalCount: number;
  periodStart: string | null;
  periodEnd: string | null;
  createdAt: string;
}

export interface DevelopmentGoalRow {
  id: string;
  userId: string;
  framework: string;
  dimension: string;
  targetDirection: string;
  setById: string;
  baselineSnapshotId: string | null;
  status: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function getAssessmentFrameworks() {
  return apiFetch<{ data: AssessmentFrameworkRow[] }>(
    "/api/v1/assessments/frameworks",
    { cacheTier: "long", tags: ["assessments"] },
  );
}

export async function getAssessmentQuestions(framework: string) {
  return apiFetch<{ data: AssessmentQuestionRow[] }>(
    `/api/v1/assessments/frameworks/${framework}/questions`,
    { cacheTier: "long", tags: ["assessments"] },
  );
}

export async function startAssessmentSession(data: {
  framework: string;
  context?: string;
}) {
  return apiFetch<AssessmentSessionRow>("/api/v1/assessments/sessions", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function submitAssessmentSession(
  sessionId: string,
  responses: Record<string, string>,
) {
  return apiFetch<{
    session: AssessmentSessionRow;
    profile: ProfileSnapshotRow;
  }>(`/api/v1/assessments/sessions/${sessionId}`, {
    method: "PUT",
    body: JSON.stringify({ responses }),
  });
}

export async function getAssessmentSessions() {
  return apiFetch<{ data: AssessmentSessionRow[] }>(
    "/api/v1/assessments/sessions",
    { cacheTier: "short", tags: ["assessment-sessions"] },
  );
}

export async function getMyProfiles(framework?: string) {
  const qs = framework ? `?framework=${framework}` : "";
  return apiFetch<{ data: ProfileSnapshotRow[] }>(
    `/api/v1/profiles/me${qs}`,
    { cacheTier: "short", tags: ["profiles"] },
  );
}

export async function getMyTimeline(framework: string, source?: string) {
  const params = new URLSearchParams({ framework });
  if (source) params.set("source", source);
  return apiFetch<{ data: ProfileSnapshotRow[] }>(
    `/api/v1/profiles/me/timeline?${params}`,
    { cacheTier: "short", tags: ["profiles"] },
  );
}

export async function getMyGoals() {
  return apiFetch<{ data: DevelopmentGoalRow[] }>(
    "/api/v1/profiles/me/goals",
    { cacheTier: "short", tags: ["profile-goals"] },
  );
}

export async function getUserProfile(userId: string, framework?: string) {
  const qs = framework ? `?framework=${framework}` : "";
  return apiFetch<{
    profiles: ProfileSnapshotRow[];
    goals: DevelopmentGoalRow[];
  }>(`/api/v1/profiles/users/${userId}${qs}`, {
    cacheTier: "short",
    tags: ["profiles"],
  });
}

export async function getUserTimeline(userId: string, framework: string) {
  return apiFetch<{ data: ProfileSnapshotRow[] }>(
    `/api/v1/profiles/users/${userId}/timeline?framework=${framework}`,
    { cacheTier: "short", tags: ["profiles"] },
  );
}

export async function getUserDrift(userId: string, framework: string) {
  return apiFetch<{
    baseline: ProfileSnapshotRow;
    observed: ProfileSnapshotRow | null;
    drift: Record<string, number> | null;
    message?: string;
  }>(`/api/v1/profiles/users/${userId}/drift?framework=${framework}`, {
    cacheTier: "short",
    tags: ["profiles"],
  });
}

export async function getTeamProfiles(teamId: string, framework: string) {
  return apiFetch<{
    data: Array<{
      user: { id: string; name: string };
      profile: ProfileSnapshotRow | null;
    }>;
  }>(`/api/v1/profiles/team/${teamId}?framework=${framework}`, {
    cacheTier: "short",
    tags: ["profiles"],
  });
}

export async function createDevelopmentGoal(
  userId: string,
  data: {
    framework: string;
    dimension: string;
    targetDirection: string;
    baselineSnapshotId?: string;
    notes?: string;
  },
) {
  return apiFetch<DevelopmentGoalRow>(
    `/api/v1/profiles/users/${userId}/goals`,
    { method: "POST", body: JSON.stringify(data) },
  );
}

export async function updateDevelopmentGoal(
  goalId: string,
  data: { status?: string; notes?: string },
) {
  return apiFetch<DevelopmentGoalRow>(`/api/v1/profiles/goals/${goalId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

// ── Team Insights ──────────────────────────────────────

export interface MemberSummary {
  userId: string;
  name: string;
  feedbackCount: number;
  avgSentiment: number;
  sentimentTrend: "improving" | "stable" | "declining";
  topThemes: string[];
  languageQuality: number;
}

export interface TeamHealth {
  overallSentiment: number;
  participationRate: number;
  topValues: string[];
  themeFrequency: Record<string, number>;
  languagePatterns: {
    constructive: number;
    vague: number;
  };
}

export interface FeedbackDigestRow {
  id: string;
  teamId: string | null;
  managerId: string;
  monthStarting: string;
  data: {
    memberSummaries: MemberSummary[];
    teamHealth: TeamHealth;
    feedbackEntryIds: string[];
  };
  createdAt: string;
  updatedAt: string;
}

// ── Goals ──────────────────────────────────────────────

export interface GoalCycleRow {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  createdAt: string;
}

export interface GoalRow {
  id: string;
  level: "org" | "team" | "individual" | "personal";
  title: string;
  description: string;
  parentGoalId: string | null;
  cycleId: string | null;
  teamId: string | null;
  ownerId: string;
  createdById: string;
  status: "draft" | "on_track" | "at_risk" | "behind" | "achieved" | "archived";
  progressPercent: number;
  metricName: string | null;
  metricStartValue: number | null;
  metricTargetValue: number | null;
  metricCurrentValue: number | null;
  shareWithManager: boolean;
  targetDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GoalUpdateRow {
  id: string;
  goalId: string;
  authorId: string;
  progressPercent: number | null;
  metricCurrentValue: number | null;
  status: string | null;
  note: string;
  source: string;
  createdAt: string;
}

export async function createGoalCycle(data: {
  name: string;
  startDate: string;
  endDate: string;
}) {
  return apiFetch<GoalCycleRow>("/api/v1/goals/cycles", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateGoalCycle(
  id: string,
  data: Partial<{ name: string; startDate: string; endDate: string }>,
) {
  return apiFetch<GoalCycleRow>(`/api/v1/goals/cycles/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function createGoal(data: {
  level: GoalRow["level"];
  title: string;
  description?: string;
  parentGoalId?: string | null;
  cycleId?: string | null;
  teamId?: string | null;
  ownerId: string;
  status?: GoalRow["status"];
  progressPercent?: number;
  metricName?: string | null;
  metricStartValue?: number | null;
  metricTargetValue?: number | null;
  metricCurrentValue?: number | null;
  shareWithManager?: boolean;
  targetDate?: string | null;
}) {
  return apiFetch<GoalRow>("/api/v1/goals", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateGoal(
  id: string,
  data: Partial<{
    title: string;
    description: string;
    parentGoalId: string | null;
    status: GoalRow["status"];
    progressPercent: number;
    metricName: string | null;
    metricStartValue: number | null;
    metricTargetValue: number | null;
    metricCurrentValue: number | null;
    shareWithManager: boolean;
    targetDate: string | null;
  }>,
) {
  return apiFetch<GoalRow>(`/api/v1/goals/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteGoal(id: string) {
  return apiFetch<{ id: string; deleted: boolean }>(`/api/v1/goals/${id}`, {
    method: "DELETE",
  });
}

export async function createGoalCheckIn(
  goalId: string,
  data: {
    progressPercent?: number;
    metricCurrentValue?: number;
    status?: GoalRow["status"];
    note?: string;
  },
) {
  return apiFetch<{ update: GoalUpdateRow; goal: GoalRow }>(
    `/api/v1/goals/${goalId}/updates`,
    { method: "POST", body: JSON.stringify(data) },
  );
}

export interface GoalSuggestionRow {
  id: string;
  goalId: string;
  meetingId: string;
  suggestedProgressPercent: number | null;
  suggestedStatus: string | null;
  suggestedMetricCurrentValue: number | null;
  suggestedNote: string;
  evidenceQuote: string;
  status: "pending" | "applied" | "dismissed";
  createdAt: string;
}

export async function applyGoalSuggestion(
  id: string,
  edits: {
    progressPercent?: number;
    metricCurrentValue?: number;
    status?: GoalRow["status"];
    note?: string;
  } = {},
) {
  return apiFetch<{
    suggestion: GoalSuggestionRow;
    update: GoalUpdateRow;
    goal: GoalRow;
  }>(`/api/v1/goals/suggestions/${id}/apply`, {
    method: "POST",
    body: JSON.stringify(edits),
  });
}

export async function dismissGoalSuggestion(id: string) {
  return apiFetch<{ suggestion: GoalSuggestionRow }>(
    `/api/v1/goals/suggestions/${id}/dismiss`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

/** Manager review of a flag on one of their reports. */
export async function reviewFlaggedEscalation(
  id: string,
  action: "investigate" | "dismiss",
  note?: string,
) {
  return apiFetch<{ id: string; status: string }>(
    `/api/v1/escalations/${id}/review`,
    { method: "POST", body: JSON.stringify({ action, note }) },
  );
}

/** Admin escalation transition (status + optional resolution note). */
export async function updateEscalation(
  id: string,
  data: { status?: string; resolution?: string; severity?: string },
) {
  return apiFetch<{ id: string; status: string }>(`/api/v1/escalations/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

/** Nudge a report (by email) to take a profile assessment. */
export async function sendAssessmentInvite(userId: string) {
  return apiFetch<{ invited: boolean }>(
    `/api/v1/profiles/users/${userId}/assessment-invite`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

export async function getGoogleIntegrationStatus() {
  return apiFetch<{
    connected: boolean;
    expiresAt: string | null;
    hasDriveScope: boolean;
  }>("/api/v1/integrations/google/status");
}

// ── 1:1 ingestion (Meet notes and uploads) ─────────────

export type IngestionMode = "manual" | "semi_automatic" | "automatic";

export interface IngestionModeInfo {
  allowed: IngestionMode[];
  orgMaxMode: IngestionMode;
  orgDefault: IngestionMode;
  /** The caller's own choice; null = the org default. */
  choice: IngestionMode | null;
  effective: IngestionMode;
  automaticAvailable: boolean;
  driveConnected: boolean;
}

export async function getIngestionMode() {
  return apiFetch<IngestionModeInfo>("/api/v1/one-on-one-sessions/ingestion-mode");
}

export async function setIngestionMode(mode: IngestionMode | null) {
  return apiFetch<{ choice: IngestionMode | null }>("/api/v1/one-on-one-sessions/ingestion-mode", {
    method: "PUT",
    body: JSON.stringify({ mode }),
  });
}

export interface PendingImport {
  id: string;
  title: string;
  eventStart: string;
  detectedBy: string | null;
  subjectUserId: string | null;
  subjectName: string | null;
}

export async function getPendingImports() {
  return apiFetch<{ data: PendingImport[] }>("/api/v1/one-on-one-sessions/imports");
}

export async function decideImport(id: string, action: "approve" | "decline") {
  return apiFetch<{ id: string; status: string }>(`/api/v1/one-on-one-sessions/imports/${id}/${action}`, {
    method: "POST",
  });
}

export interface RecentImport {
  id: string;
  title: string;
  eventStart: string;
  source: string;
  status: string;
  withheldCount: number;
  organizerId: string;
  subjectUserId: string | null;
  subjectName: string | null;
}

export async function getRecentImports() {
  return apiFetch<{ data: RecentImport[] }>("/api/v1/one-on-one-sessions/imports/recent");
}

export interface UploadOutcome {
  meetingId: string;
  sessionId: string;
  tasks: number;
  /** Between-meeting goals created. */
  focusAreas: number;
  suggestions: number;
  /** Items held back as wellbeing, conduct or safety. */
  withheld: number;
}

export async function uploadOneOnOne(data: {
  counterpartId: string;
  fileName: string;
  contentBase64: string;
  meetingDate?: string;
}) {
  return apiFetch<UploadOutcome>("/api/v1/one-on-one-sessions/imports/upload", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export interface BetweenMeetingGoal {
  id: string;
  ownerId: string;
  counterpartId: string;
  text: string;
  status: "active" | "done" | "dropped";
  visibility: "private" | "shareable";
  shareReason: string | null;
  sourceMeetingId: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function getBetweenMeetingGoals(opts?: { withUserId?: string; status?: "active" | "done" | "dropped" }) {
  const params = new URLSearchParams();
  if (opts?.withUserId) params.set("withUserId", opts.withUserId);
  if (opts?.status) params.set("status", opts.status);
  const qs = params.toString() ? `?${params}` : "";
  return apiFetch<{ data: BetweenMeetingGoal[] }>(`/api/v1/one-on-one-sessions/between-meeting-goals${qs}`);
}

export async function updateBetweenMeetingGoal(
  id: string,
  data: { text?: string; status?: "active" | "done" | "dropped" },
) {
  return apiFetch<BetweenMeetingGoal>(`/api/v1/one-on-one-sessions/between-meeting-goals/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

// ── Break-glass access grants ─────────────────────────
// docs/design/privacy-and-agent-access.md: an admin records a reason and gets
// read-only content access to one person for a period. Every step is audited.

export type AccessGrantRow = {
  id: string;
  granteeId: string;
  subjectId: string;
  granteeName: string;
  subjectName: string;
  reason: string;
  periodStart: string;
  periodEnd: string;
  createdAt: string;
  expiresAt: string;
  holdReason: string | null;
  holdLiftedAt: string | null;
  revokedAt: string | null;
  status: "active" | "expired" | "revoked";
  onHold: boolean;
};

export type OpenGrant = {
  id: string;
  reason: string;
  periodStart: string;
  periodEnd: string;
  expiresAt: string;
  onHold: boolean;
};

export type GrantAboutMe = {
  id: string;
  granteeName: string;
  createdAt: string;
  periodStart: string;
  periodEnd: string;
  expiresAt: string;
  revokedAt: string | null;
  status: "active" | "expired" | "revoked";
};

export async function getAccessGrants() {
  return apiFetch<{ data: AccessGrantRow[] }>("/api/v1/access-grants");
}

export async function createAccessGrant(data: {
  subjectId: string;
  reason: string;
  periodStart: string;
  periodEnd: string;
  days: number;
  holdReason?: string;
}) {
  return apiFetch<{ data: AccessGrantRow }>("/api/v1/access-grants", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function revokeAccessGrant(id: string) {
  return apiFetch<{ data: AccessGrantRow }>(`/api/v1/access-grants/${id}/revoke`, { method: "POST" });
}

export async function liftAccessGrantHold(id: string) {
  return apiFetch<{ data: AccessGrantRow }>(`/api/v1/access-grants/${id}/lift-hold`, { method: "POST" });
}

/** Opens (and logs a view of) the caller's active grant for a person; null if none. */
export async function openAccessGrant(subjectId: string): Promise<OpenGrant | null> {
  try {
    const res = await apiFetch<{ data: OpenGrant }>(`/api/v1/access-grants/open/${subjectId}`, { method: "POST" });
    return res.data;
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 403)) return null;
    throw err;
  }
}

export async function getAccessGrantsAboutMe() {
  return apiFetch<{ data: GrantAboutMe[] }>("/api/v1/access-grants/about-me");
}

// ── Support signposting ───────────────────────────────
// docs/bot/concerns-playbook.md: who the bot points people to, and how often.

export type SupportSettings = {
  supportContact: string;
  supportDetails: string;
  supportOutside: string;
  /** Counts under minShownCount come back as null. */
  months: Array<{ month: string; wellbeing: number | null; safety: number | null; conduct: number | null }>;
  minShownCount: number;
};

export async function getSupportSettings() {
  return apiFetch<{ data: SupportSettings }>("/api/v1/support/settings");
}

export async function saveSupportSettings(data: { supportContact: string; supportDetails: string; supportOutside: string }) {
  return apiFetch<{ ok: true }>("/api/v1/support/settings", { method: "PUT", body: JSON.stringify(data) });
}
