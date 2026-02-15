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

// Extended feedback history (for /dashboard/feedback)
export const allFeedback = [
  ...recentFeedback,
  {
    id: "f4",
    fromName: "James Okonkwo",
    date: "Feb 3, 2026",
    summary:
      "Good job on the API migration. The rollback plan you prepared saved us when we hit the rate limit issue. Solid engineering.",
    sentiment: "positive" as const,
    engagementScore: 82,
    values: ["Ownership", "Excellence"],
  },
  {
    id: "f5",
    fromName: "David Kim",
    date: "Jan 29, 2026",
    summary:
      "Fine work on the dashboard. It looks alright.",
    sentiment: "neutral" as const,
    engagementScore: 34,
    values: [],
  },
  {
    id: "f6",
    fromName: "Marcus Rivera",
    date: "Jan 24, 2026",
    summary:
      "The onboarding doc you wrote for the new hires was genuinely one of the best I've seen. Clear structure, real examples, and the troubleshooting section alone probably saved hours of confusion.",
    sentiment: "positive" as const,
    engagementScore: 95,
    values: ["Communication", "Teamwork", "Excellence"],
  },
  {
    id: "f7",
    fromName: "Aisha Patel",
    date: "Jan 20, 2026",
    summary:
      "Pairing session on the caching layer was productive. I appreciated you taking time to explain the invalidation strategy — I feel way more confident touching that code now.",
    sentiment: "positive" as const,
    engagementScore: 88,
    values: ["Teamwork", "Communication"],
  },
  {
    id: "f8",
    fromName: "Elena Volkov",
    date: "Jan 15, 2026",
    summary:
      "The standup updates have been a bit vague lately — hard to tell what's blocked vs. in progress. Maybe adding one line of context would help the team plan better.",
    sentiment: "neutral" as const,
    engagementScore: 72,
    values: ["Communication"],
  },
];

// Weekly engagement breakdown (for /dashboard/engagement)
export const weeklyEngagementDetail = [
  {
    week: "Feb 10",
    score: 87,
    interactions: 3,
    avgWordCount: 68,
    responseTime: "4m",
    specificExamples: 2,
    status: "complete" as const,
  },
  {
    week: "Feb 3",
    score: 85,
    interactions: 3,
    avgWordCount: 55,
    responseTime: "6m",
    specificExamples: 2,
    status: "complete" as const,
  },
  {
    week: "Jan 27",
    score: 82,
    interactions: 3,
    avgWordCount: 62,
    responseTime: "3m",
    specificExamples: 3,
    status: "complete" as const,
  },
  {
    week: "Jan 20",
    score: 75,
    interactions: 2,
    avgWordCount: 41,
    responseTime: "12m",
    specificExamples: 1,
    status: "partial" as const,
  },
  {
    week: "Jan 13",
    score: 78,
    interactions: 3,
    avgWordCount: 48,
    responseTime: "8m",
    specificExamples: 1,
    status: "complete" as const,
  },
  {
    week: "Jan 6",
    score: 72,
    interactions: 2,
    avgWordCount: 35,
    responseTime: "15m",
    specificExamples: 0,
    status: "partial" as const,
  },
];

// Kudos data
export const kudosReceived = [
  { id: "k1", from: "Marcus Rivera", message: "Absolute legend for staying on that P0 until 2am. You saved the launch.", value: "Ownership", date: "Feb 12, 2026" },
  { id: "k2", from: "Aisha Patel", message: "Your code reviews are always so thoughtful — I learn something every time.", value: "Excellence", date: "Feb 8, 2026" },
  { id: "k3", from: "Elena Volkov", message: "Thanks for jumping in to help with the demo prep, even though it wasn't your project.", value: "Teamwork", date: "Feb 1, 2026" },
  { id: "k4", from: "James Okonkwo", message: "The architecture doc was super clear. Made my life so much easier ramping up.", value: "Communication", date: "Jan 25, 2026" },
];

export const kudosGiven = [
  { id: "k5", to: "Aisha Patel", message: "Incredible attention to detail on the security audit. Found things nobody else caught.", value: "Excellence", date: "Feb 11, 2026" },
  { id: "k6", to: "Marcus Rivera", message: "Great mentoring of the new intern — really patient and thorough.", value: "Teamwork", date: "Feb 5, 2026" },
];

// Team feedback (for manager /team/feedback)
export const teamFeedbackAll = [
  { id: "tf1", reviewer: "Sarah Chen", subject: "Marcus Rivera", date: "Feb 13, 2026", summary: "Strong sprint execution. Consistently delivers on commitments and communicates blockers early.", sentiment: "positive" as const, score: 91, interactionType: "peer_review" },
  { id: "tf2", reviewer: "Aisha Patel", subject: "Sarah Chen", date: "Feb 10, 2026", summary: "Really appreciated the patience debugging the auth issue together. Great pair programming partner.", sentiment: "positive" as const, score: 85, interactionType: "peer_review" },
  { id: "tf3", reviewer: "Elena Volkov", subject: "Sarah Chen", date: "Feb 7, 2026", summary: "Sprint planning sessions could use more structure — we ran over time.", sentiment: "neutral" as const, score: 78, interactionType: "peer_review" },
  { id: "tf4", reviewer: "Marcus Rivera", subject: "Aisha Patel", date: "Feb 6, 2026", summary: "Aisha's security review was incredibly thorough. She found edge cases nobody else thought of.", sentiment: "positive" as const, score: 93, interactionType: "peer_review" },
  { id: "tf5", reviewer: "David Kim", subject: "James Okonkwo", date: "Feb 5, 2026", summary: "OK I guess.", sentiment: "neutral" as const, score: 18, interactionType: "peer_review" },
  { id: "tf6", reviewer: "James Okonkwo", subject: "Elena Volkov", date: "Feb 4, 2026", summary: "Elena's documentation for the new API was thorough and well-organized. The examples section is particularly helpful for onboarding.", sentiment: "positive" as const, score: 80, interactionType: "peer_review" },
  { id: "tf7", reviewer: "Sarah Chen", subject: "David Kim", date: "Feb 3, 2026", summary: "Would be helpful to see more proactive communication when tasks are blocked. A quick message goes a long way.", sentiment: "neutral" as const, score: 65, interactionType: "peer_review" },
  { id: "tf8", reviewer: "Aisha Patel", subject: "Marcus Rivera", date: "Feb 1, 2026", summary: "Marcus has been a fantastic mentor for the new intern. Patient, clear, and always available.", sentiment: "positive" as const, score: 89, interactionType: "peer_review" },
];

// Leaderboard history (for /team/leaderboard)
export const leaderboardHistory = [
  { week: "Feb 10", data: [
    { rank: 1, name: "Aisha Patel", score: 94 },
    { rank: 2, name: "Sarah Chen", score: 87 },
    { rank: 3, name: "Elena Volkov", score: 81 },
  ]},
  { week: "Feb 3", data: [
    { rank: 1, name: "Aisha Patel", score: 92 },
    { rank: 2, name: "Sarah Chen", score: 85 },
    { rank: 3, name: "Marcus Rivera", score: 79 },
  ]},
  { week: "Jan 27", data: [
    { rank: 1, name: "Sarah Chen", score: 82 },
    { rank: 2, name: "Aisha Patel", score: 80 },
    { rank: 3, name: "Elena Volkov", score: 77 },
  ]},
];

// Question bank (for /settings/questions)
export const questionBank = [
  { id: "q1", text: "What did this person do well in the last sprint?", category: "peer_review", coreValue: null, isSystem: true, active: true },
  { id: "q2", text: "Can you share a specific example of how they demonstrated teamwork?", category: "peer_review", coreValue: "Teamwork", isSystem: true, active: true },
  { id: "q3", text: "What's one thing they could improve on?", category: "peer_review", coreValue: null, isSystem: true, active: true },
  { id: "q4", text: "How effectively did they communicate blockers and progress?", category: "peer_review", coreValue: "Communication", isSystem: true, active: true },
  { id: "q5", text: "Describe a moment where they took ownership of a challenge.", category: "peer_review", coreValue: "Ownership", isSystem: false, active: true },
  { id: "q6", text: "What accomplishment are you most proud of this week?", category: "self_reflection", coreValue: null, isSystem: true, active: true },
  { id: "q7", text: "Where did you feel stuck, and how did you work through it?", category: "self_reflection", coreValue: null, isSystem: true, active: true },
  { id: "q8", text: "How would you rate your manager's support this week?", category: "three_sixty", coreValue: null, isSystem: true, active: true },
  { id: "q9", text: "What's the overall mood of your team right now?", category: "pulse_check", coreValue: null, isSystem: true, active: true },
  { id: "q10", text: "How has this person demonstrated innovation in their recent work?", category: "peer_review", coreValue: "Innovation", isSystem: false, active: false },
];

// Escalation audit trail (for /settings/escalations)
export const escalationDetails = [
  {
    ...escalations[0],
    auditTrail: [
      { action: "Auto-flagged by AI", by: "System", date: "Feb 12, 2026 2:14 PM", notes: "Dismissive language pattern detected (confidence: 0.87)" },
      { action: "Assigned to HR review", by: "System", date: "Feb 12, 2026 2:15 PM", notes: null },
    ],
    relatedFeedback: [
      { id: "rf1", date: "Feb 12", excerpt: "\"...it's not that hard, you should know this by now...\"", score: 28 },
      { id: "rf2", date: "Feb 5", excerpt: "\"...I already explained this, I don't have time to go over it again...\"", score: 31 },
      { id: "rf3", date: "Jan 29", excerpt: "\"...just read the docs, that's what they're there for...\"", score: 35 },
    ],
  },
  {
    ...escalations[1],
    auditTrail: [
      { action: "Low engagement pattern detected", by: "System", date: "Feb 10, 2026 9:00 AM", notes: "4 consecutive weeks below 40 engagement score" },
      { action: "Manager notified", by: "System", date: "Feb 10, 2026 9:01 AM", notes: "Coaching opportunity flagged to Alex Thompson" },
    ],
    relatedFeedback: [
      { id: "rf4", date: "Feb 5", excerpt: "\"OK I guess.\"", score: 18 },
      { id: "rf5", date: "Jan 29", excerpt: "\"Yeah it was fine.\"", score: 22 },
      { id: "rf6", date: "Jan 22", excerpt: "\"Sure.\"", score: 12 },
    ],
  },
  {
    ...escalations[2],
    auditTrail: [
      { action: "Auto-flagged by AI", by: "System", date: "Jan 28, 2026 11:22 AM", notes: "Potential harassment language (confidence: 0.93)" },
      { action: "Escalated to HR", by: "System", date: "Jan 28, 2026 11:23 AM", notes: "Critical severity — immediate review required" },
      { action: "Investigation opened", by: "Jordan Wells", date: "Jan 28, 2026 1:45 PM", notes: "Reviewing full conversation context" },
      { action: "Resolved — false positive", by: "Jordan Wells", date: "Jan 30, 2026 10:00 AM", notes: "Language was sarcastic but within context of mutual banter. No action required. Adjusted detection threshold." },
    ],
    relatedFeedback: [
      { id: "rf7", date: "Jan 28", excerpt: "[Redacted — resolved as false positive]", score: 0 },
    ],
  },
];
