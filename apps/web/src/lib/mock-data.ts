// Mock data for dashboard prototyping
// Replace with real API calls when backend is wired up

export const currentUser = {
  id: "u1",
  name: "Sarah Chen",
  email: "sarah.chen@acmecorp.com",
  role: "employee" as const,
  teamId: "t1",
  avatar: null,
  timezone: "America/New_York",
  streak: 7,
  onboardingCompleted: true,
};

export const teamMembers = [
  {
    id: "u1",
    name: "Sarah Chen",
    role: "employee",
    engagementScore: 87,
    interactionsThisWeek: 3,
    target: 3,
    streak: 7,
    trend: "up" as const,
    avatar: null,
  },
  {
    id: "u2",
    name: "Marcus Rivera",
    role: "employee",
    engagementScore: 72,
    interactionsThisWeek: 2,
    target: 3,
    streak: 4,
    trend: "stable" as const,
    avatar: null,
  },
  {
    id: "u3",
    name: "Aisha Patel",
    role: "employee",
    engagementScore: 94,
    interactionsThisWeek: 3,
    target: 3,
    streak: 12,
    trend: "up" as const,
    avatar: null,
  },
  {
    id: "u4",
    name: "James Okonkwo",
    role: "employee",
    engagementScore: 58,
    interactionsThisWeek: 1,
    target: 3,
    streak: 0,
    trend: "down" as const,
    avatar: null,
  },
  {
    id: "u5",
    name: "Elena Volkov",
    role: "employee",
    engagementScore: 81,
    interactionsThisWeek: 2,
    target: 3,
    streak: 3,
    trend: "up" as const,
    avatar: null,
  },
  {
    id: "u6",
    name: "David Kim",
    role: "employee",
    engagementScore: 45,
    interactionsThisWeek: 0,
    target: 3,
    streak: 0,
    trend: "down" as const,
    avatar: null,
  },
];

export const recentFeedback = [
  {
    id: "f1",
    fromName: "Marcus Rivera",
    date: "Feb 13, 2026",
    summary:
      "Your presentation at the Q4 review was incredibly well-structured. The way you connected the data points to our OKRs made it easy for everyone to follow the narrative.",
    sentiment: "positive" as const,
    engagementScore: 91,
    values: ["Communication", "Excellence"],
  },
  {
    id: "f2",
    fromName: "Aisha Patel",
    date: "Feb 10, 2026",
    summary:
      "Really appreciated you staying late to help debug the auth issue. Your patience in walking through the code made all the difference.",
    sentiment: "positive" as const,
    engagementScore: 85,
    values: ["Teamwork", "Ownership"],
  },
  {
    id: "f3",
    fromName: "Elena Volkov",
    date: "Feb 7, 2026",
    summary:
      "The sprint planning could use more structure — we ran over time and some stories were unclear. Maybe prep a tighter agenda next time?",
    sentiment: "neutral" as const,
    engagementScore: 78,
    values: ["Communication"],
  },
];

export const engagementHistory = [
  { week: "Jan 6", score: 72, interactions: 2 },
  { week: "Jan 13", score: 78, interactions: 3 },
  { week: "Jan 20", score: 75, interactions: 2 },
  { week: "Jan 27", score: 82, interactions: 3 },
  { week: "Feb 3", score: 85, interactions: 3 },
  { week: "Feb 10", score: 87, interactions: 3 },
];

export const valuesScores = [
  { value: "Communication", score: 88 },
  { value: "Teamwork", score: 82 },
  { value: "Innovation", score: 71 },
  { value: "Ownership", score: 90 },
  { value: "Excellence", score: 76 },
];

export const leaderboard = [
  { rank: 1, name: "Aisha Patel", score: 94, streak: 12 },
  { rank: 2, name: "Sarah Chen", score: 87, streak: 7 },
  { rank: 3, name: "Elena Volkov", score: 81, streak: 3 },
  { rank: 4, name: "Marcus Rivera", score: 72, streak: 4 },
  { rank: 5, name: "James Okonkwo", score: 58, streak: 0 },
  { rank: 6, name: "David Kim", score: 45, streak: 0 },
];

export const flaggedItems = [
  {
    id: "e1",
    severity: "coaching" as const,
    fromName: "Anonymous",
    subjectName: "David Kim",
    reason: "Language flagged: potentially dismissive tone toward junior team members",
    excerpt: "\"...I don't understand why this keeps coming up, it's not that hard...\"",
    date: "Feb 12, 2026",
  },
  {
    id: "e2",
    severity: "warning" as const,
    fromName: "Anonymous",
    subjectName: "James Okonkwo",
    reason: "Pattern detected: 3rd consecutive low-engagement response",
    excerpt: "Responses averaging 12 words with no specific examples provided.",
    date: "Feb 11, 2026",
  },
];

export const teamEngagementTrend = [
  { week: "Jan 6", avg: 68, high: 85, low: 52 },
  { week: "Jan 13", avg: 71, high: 88, low: 55 },
  { week: "Jan 20", avg: 69, high: 86, low: 48 },
  { week: "Jan 27", avg: 74, high: 90, low: 54 },
  { week: "Feb 3", avg: 76, high: 92, low: 50 },
  { week: "Feb 10", avg: 73, high: 94, low: 45 },
];

export const coreValues = [
  { id: "v1", name: "Communication", description: "Clear, honest, and empathetic exchange of ideas", active: true },
  { id: "v2", name: "Teamwork", description: "Collaborative spirit and mutual support", active: true },
  { id: "v3", name: "Innovation", description: "Creative problem-solving and continuous improvement", active: true },
  { id: "v4", name: "Ownership", description: "Accountability and follow-through on commitments", active: true },
  { id: "v5", name: "Excellence", description: "High standards and attention to detail", active: true },
];

export const integrations = [
  { id: "i1", platform: "slack", name: "Slack", status: "connected" as const, workspace: "Acme Corp" },
  { id: "i2", platform: "google_chat", name: "Google Chat", status: "disconnected" as const, workspace: null },
  { id: "i3", platform: "teams", name: "Microsoft Teams", status: "disconnected" as const, workspace: null },
  { id: "i4", platform: "google_calendar", name: "Google Calendar", status: "connected" as const, workspace: "sarah.chen@acmecorp.com" },
];

export const escalations = [
  {
    id: "esc1",
    severity: "warning" as const,
    subjectName: "David Kim",
    reason: "Repeated dismissive language pattern across 3 feedback interactions",
    status: "open" as const,
    createdAt: "Feb 12, 2026",
    feedbackCount: 3,
  },
  {
    id: "esc2",
    severity: "coaching" as const,
    subjectName: "James Okonkwo",
    reason: "Sustained low engagement — 4 consecutive weeks below threshold",
    status: "open" as const,
    createdAt: "Feb 10, 2026",
    feedbackCount: 8,
  },
  {
    id: "esc3",
    severity: "critical" as const,
    subjectName: "Anonymous Report",
    reason: "Potential harassment language detected in peer feedback",
    status: "resolved" as const,
    createdAt: "Jan 28, 2026",
    feedbackCount: 1,
  },
];

export const upcomingInteraction = {
  type: "peer_review" as const,
  subjectName: "Marcus Rivera",
  scheduledFor: "Tomorrow, 10:00 AM",
  platform: "slack" as const,
  topic: "Sprint collaboration and code review quality",
};
