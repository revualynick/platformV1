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

async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  // Resolve auth session for tenant context
  const session = await auth();
  if (!session) {
    throw new Error("No auth session — cannot make API request");
  }

  const authHeaders: Record<string, string> = {
    "x-org-id": session.orgId,
    "x-user-id": session.user.id,
    "x-internal-secret": getInternalSecret(),
  };

  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders,
      ...init?.headers,
    },
    // Default to no-store for mutation-sensitive data; callers can override
    cache: init?.cache ?? "no-store",
  });

  if (!res.ok) {
    // Don't leak backend error details — log for debugging, expose only status
    const body = await res.text().catch(() => "");
    if (process.env.NODE_ENV === "development") {
      console.error(`API error ${res.status}: ${path} — ${body}`);
    }
    throw new Error(`API request failed: ${res.status} ${path}`);
  }

  return res.json() as Promise<T>;
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

export async function getUser(id: string) {
  return apiFetch<UserRow>(`/api/v1/users/${id}`);
}

export async function getCurrentUser() {
  return apiFetch<UserRow>("/api/v1/auth/me");
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

export async function getUsers(filters?: { teamId?: string; managerId?: string }) {
  const params = new URLSearchParams();
  if (filters?.teamId) params.set("teamId", filters.teamId);
  if (filters?.managerId) params.set("managerId", filters.managerId);
  const qs = params.toString() ? `?${params.toString()}` : "";
  return apiFetch<{ data: UserRow[] }>(`/api/v1/users${qs}`);
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

export async function getEngagementScores(userId: string) {
  return apiFetch<{ data: EngagementScoreRow[]; userId: string }>(
    `/api/v1/users/${userId}/engagement`,
  );
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
  createdAt: string;
  valueScores: Array<{
    id: string;
    feedbackEntryId: string;
    coreValueId: string;
    score: number;
    evidence: string;
  }>;
}

export async function getFeedback(userId: string) {
  return apiFetch<{ data: FeedbackEntryRow[]; userId: string }>(
    `/api/v1/users/${userId}/feedback`,
  );
}

export async function getFlaggedItems() {
  return apiFetch<{
    data: Array<{
      escalation: {
        id: string;
        feedbackEntryId: string;
        severity: string;
        reason: string;
        flaggedContent: string;
        resolvedAt: string | null;
        resolvedById: string | null;
        createdAt: string;
      };
      feedback: FeedbackEntryRow;
    }>;
  }>("/api/v1/feedback/flagged");
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

export async function getOrgGraph() {
  return apiFetch<{ nodes: GraphNode[]; edges: GraphEdge[] }>(
    "/api/v1/relationships",
  );
}

export async function getUserRelationships(userId: string) {
  return apiFetch<{ nodes: GraphNode[]; edges: GraphEdge[] }>(
    `/api/v1/users/${userId}/relationships`,
  );
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

// ── Conversations ──────────────────────────────────────

export async function getConversations(status?: string) {
  const params = status ? `?status=${status}` : "";
  return apiFetch<{ data: Array<Record<string, unknown>> }>(
    `/api/v1/conversations${params}`,
  );
}

export async function getConversation(id: string) {
  return apiFetch<Record<string, unknown>>(
    `/api/v1/conversations/${id}`,
  );
}

// ── Escalations ────────────────────────────────────────

export async function getEscalations() {
  return apiFetch<{ data: Array<Record<string, unknown>> }>(
    "/api/v1/escalations",
  );
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

export async function getKudos(userId: string) {
  return apiFetch<{ data: KudosRow[]; userId: string }>(
    `/api/v1/kudos?userId=${userId}`,
  );
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

export async function getManagerQuestionnaires() {
  return apiFetch<{ data: ManagerQuestionnaireRow[] }>(
    "/api/v1/manager/questionnaires",
  );
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

export async function getManagerOrgChart() {
  return apiFetch<{ nodes: GraphNode[]; edges: GraphEdge[] }>(
    "/api/v1/manager/org-chart",
  );
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

export async function getManagerNotes(subjectId: string) {
  return apiFetch<{ data: ManagerNoteRow[] }>(
    `/api/v1/manager/notes?subjectId=${subjectId}`,
  );
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
  );
}

export async function getOneOnOneSession(id: string) {
  return apiFetch<OneOnOneSessionDetail>(
    `/api/v1/one-on-one-sessions/${id}`,
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
  type: "weekly_digest" | "flag_alert" | "nudge" | "leaderboard_update";
  enabled: boolean;
  channel: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export async function getNotificationPreferences() {
  return apiFetch<{ data: NotificationPreference[] }>(
    "/api/v1/notifications/preferences",
  );
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
