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

// Self-reflections
export const selfReflections = [
  {
    id: "sr1",
    week: "Feb 10, 2026",
    status: "complete" as const,
    promptTheme: "Celebrate wins and build confidence",
    highlights: "Led the API migration and prepared a rollback plan that saved us when we hit the rate-limit issue. Also onboarded two new team members to the codebase.",
    challenges: "Sprint planning ran long again — I need to timebox more aggressively. Also felt stretched thin between the migration and the onboarding docs.",
    goalForNextWeek: "Prep a tighter agenda before sprint planning. Delegate the remaining onboarding tasks to Marcus.",
    mood: "energized" as const,
    engagementScore: 88,
  },
  {
    id: "sr2",
    week: "Feb 3, 2026",
    status: "complete" as const,
    promptTheme: "Process challenges and blockers",
    highlights: "Shipped the caching layer ahead of schedule. Pair-programmed with Aisha on the invalidation strategy — she picked it up fast.",
    challenges: "Got pulled into two unrelated incidents mid-week that derailed my focus. Need to protect deep work time better.",
    goalForNextWeek: "Block out Wednesday and Thursday mornings as no-meeting time.",
    mood: "focused" as const,
    engagementScore: 85,
  },
  {
    id: "sr3",
    week: "Jan 27, 2026",
    status: "complete" as const,
    promptTheme: "Celebrate wins and build confidence",
    highlights: "Wrote the onboarding doc that multiple people said was one of the best they'd seen. Feels good to invest in team knowledge.",
    challenges: "Standup updates were vague — got feedback from Elena about it. She's right, I was context-switching too much to give clear updates.",
    goalForNextWeek: "Write one-line standup notes the night before.",
    mood: "reflective" as const,
    engagementScore: 82,
  },
  {
    id: "sr4",
    week: "Jan 20, 2026",
    status: "complete" as const,
    promptTheme: "Process challenges and blockers",
    highlights: "Fixed the auth race condition that had been haunting us for weeks. Clean solution, no hacks.",
    challenges: "Only completed 2 of 3 interactions this week — skipped Friday's because I was deep in the bug. Need to not let debugging eat my whole schedule.",
    goalForNextWeek: "Set a hard stop on debugging after 4 hours. Timebox.",
    mood: "tired" as const,
    engagementScore: 75,
  },
  {
    id: "sr5",
    week: "Jan 13, 2026",
    status: "complete" as const,
    promptTheme: "Celebrate wins and build confidence",
    highlights: "Successfully demoed the new dashboard to stakeholders. Got positive feedback from the VP of Product.",
    challenges: "Felt underprepared for the Q&A portion. Should have anticipated more questions about the data pipeline.",
    goalForNextWeek: "For the next demo, write a FAQ doc beforehand.",
    mood: "optimistic" as const,
    engagementScore: 78,
  },
  {
    id: "sr6",
    week: "Jan 6, 2026",
    status: "complete" as const,
    promptTheme: "Process challenges and blockers",
    highlights: "Started the quarter strong — clear goals, good kickoff. Team energy felt high.",
    challenges: "Adjusting to the new project structure. Not fully sure where some responsibilities land between our team and platform.",
    goalForNextWeek: "Set up a sync with the platform team lead to clarify ownership boundaries.",
    mood: "optimistic" as const,
    engagementScore: 72,
  },
];

// Org chart — people, roles, reporting lines, relationship threads
export type OrgRole = "vp" | "director" | "manager" | "lead" | "senior" | "mid" | "junior";

export const orgPeople = [
  { id: "p0", name: "Dana Whitfield", role: "vp" as OrgRole, title: "VP of Engineering", team: "Engineering", reportsTo: null, email: "dana.whitfield@acmecorp.com" },
  { id: "p1", name: "Alex Thompson", role: "director" as OrgRole, title: "Director of Engineering", team: "Engineering", reportsTo: "p0", email: "alex.thompson@acmecorp.com" },
  { id: "p2", name: "Jordan Wells", role: "manager" as OrgRole, title: "Engineering Manager", team: "Engineering", reportsTo: "p1", email: "jordan.wells@acmecorp.com" },
  { id: "p3", name: "Sarah Chen", role: "senior" as OrgRole, title: "Senior Software Engineer", team: "Core Platform", reportsTo: "p2", email: "sarah.chen@acmecorp.com" },
  { id: "p4", name: "Marcus Rivera", role: "senior" as OrgRole, title: "Senior Software Engineer", team: "Core Platform", reportsTo: "p2", email: "marcus.rivera@acmecorp.com" },
  { id: "p5", name: "Aisha Patel", role: "senior" as OrgRole, title: "Senior Security Engineer", team: "Core Platform", reportsTo: "p2", email: "aisha.patel@acmecorp.com" },
  { id: "p6", name: "James Okonkwo", role: "mid" as OrgRole, title: "Software Engineer", team: "Core Platform", reportsTo: "p2", email: "james.okonkwo@acmecorp.com" },
  { id: "p7", name: "Elena Volkov", role: "mid" as OrgRole, title: "Software Engineer", team: "Core Platform", reportsTo: "p2", email: "elena.volkov@acmecorp.com" },
  { id: "p8", name: "David Kim", role: "junior" as OrgRole, title: "Junior Engineer", team: "Core Platform", reportsTo: "p2", email: "david.kim@acmecorp.com" },
  { id: "p9", name: "Priya Sharma", role: "manager" as OrgRole, title: "Engineering Manager", team: "Data & ML", reportsTo: "p1", email: "priya.sharma@acmecorp.com" },
  { id: "p10", name: "Tom Nguyen", role: "senior" as OrgRole, title: "Senior ML Engineer", team: "Data & ML", reportsTo: "p9", email: "tom.nguyen@acmecorp.com" },
  { id: "p11", name: "Rachel Adams", role: "mid" as OrgRole, title: "Data Engineer", team: "Data & ML", reportsTo: "p9", email: "rachel.adams@acmecorp.com" },
  { id: "p12", name: "Leo Park", role: "lead" as OrgRole, title: "Tech Lead", team: "Infrastructure", reportsTo: "p1", email: "leo.park@acmecorp.com" },
  { id: "p13", name: "Nina Torres", role: "mid" as OrgRole, title: "DevOps Engineer", team: "Infrastructure", reportsTo: "p12", email: "nina.torres@acmecorp.com" },
];

// Relationship threads between people — tagged connections beyond reporting lines
export const orgThreads = [
  { id: "t1", from: "p3", to: "p4", tags: ["pair-programming", "code-review"], strength: 0.92, label: "Regular pair partners on core services" },
  { id: "t2", from: "p3", to: "p5", tags: ["code-review", "security"], strength: 0.78, label: "Security review pipeline" },
  { id: "t3", from: "p4", to: "p6", tags: ["mentorship"], strength: 0.85, label: "Marcus mentoring James on backend patterns" },
  { id: "t4", from: "p5", to: "p10", tags: ["cross-team", "security"], strength: 0.71, label: "ML model security audit collaboration" },
  { id: "t5", from: "p3", to: "p7", tags: ["pair-programming"], strength: 0.68, label: "Sprint pairing on API layer" },
  { id: "t6", from: "p12", to: "p3", tags: ["cross-team", "architecture"], strength: 0.74, label: "Platform architecture alignment" },
  { id: "t7", from: "p4", to: "p8", tags: ["mentorship", "onboarding"], strength: 0.80, label: "Marcus onboarding David to the codebase" },
  { id: "t8", from: "p9", to: "p2", tags: ["cross-team", "planning"], strength: 0.65, label: "Cross-team sprint coordination" },
  { id: "t9", from: "p7", to: "p11", tags: ["cross-team", "data"], strength: 0.55, label: "API ↔ data pipeline integration" },
  { id: "t10", from: "p13", to: "p12", tags: ["deployment", "infra"], strength: 0.90, label: "CI/CD pipeline ownership" },
];

export const threadTagColors: Record<string, { bg: string; text: string }> = {
  "pair-programming": { bg: "bg-forest/10", text: "text-forest" },
  "code-review": { bg: "bg-sky-50", text: "text-sky-600" },
  "mentorship": { bg: "bg-violet-100", text: "text-violet-600" },
  "cross-team": { bg: "bg-terracotta/10", text: "text-terracotta" },
  "security": { bg: "bg-danger/10", text: "text-danger" },
  "architecture": { bg: "bg-amber/10", text: "text-warning" },
  "onboarding": { bg: "bg-positive/10", text: "text-positive" },
  "planning": { bg: "bg-stone-100", text: "text-stone-500" },
  "data": { bg: "bg-sky-50", text: "text-sky-600" },
  "deployment": { bg: "bg-stone-100", text: "text-stone-600" },
  "infra": { bg: "bg-stone-100", text: "text-stone-600" },
};

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

// Questionnaires — collections of question themes (directions, not rigid scripts)
// AI rewords themes into natural conversation based on context, relationship, and prior interactions
// verbatim: false (default) = AI adapts phrasing naturally
// verbatim: true = AI uses exact wording from first examplePhrasing (for compliance/HR consistency)
export const questionnaires = [
  {
    id: "qn1",
    name: "Sprint Peer Review",
    category: "peer_review" as const,
    source: "built_in" as const,
    active: true,
    verbatim: false,
    description: "End-of-sprint peer evaluation focused on collaboration and delivery quality",
    themes: [
      {
        id: "th1",
        intent: "Identify specific contributions and strengths",
        dataGoal: "Capture concrete positive behaviors tied to recent work",
        examplePhrasings: [
          "What stood out to you about how they handled the sprint?",
          "Can you think of a moment where they really came through?",
          "What did they do particularly well this time around?",
        ],
        coreValue: null,
      },
      {
        id: "th2",
        intent: "Surface collaboration quality",
        dataGoal: "Assess how well the person works with others and supports teammates",
        examplePhrasings: [
          "How was it working with them on shared tasks?",
          "Did they make your work easier or harder? How so?",
          "Can you share an example of how they supported the team?",
        ],
        coreValue: "Teamwork",
      },
      {
        id: "th3",
        intent: "Identify growth areas constructively",
        dataGoal: "Get actionable improvement suggestions without negativity",
        examplePhrasings: [
          "If you could suggest one thing for them to try differently, what would it be?",
          "What's one area where a small change could make a big difference?",
          "Where do you see the most room for growth?",
        ],
        coreValue: null,
      },
      {
        id: "th4",
        intent: "Evaluate communication effectiveness",
        dataGoal: "Understand how well they keep others informed and unblock themselves",
        examplePhrasings: [
          "How clear were they about where things stood with their work?",
          "Did you always know what they were working on?",
          "How effectively did they flag blockers or ask for help?",
        ],
        coreValue: "Communication",
      },
    ],
    timesUsed: 47,
    lastUsed: "Feb 13, 2026",
  },
  {
    id: "qn2",
    name: "Weekly Self-Reflection",
    category: "self_reflection" as const,
    source: "built_in" as const,
    active: true,
    verbatim: false,
    description: "Personal reflection on accomplishments, challenges, and growth",
    themes: [
      {
        id: "th5",
        intent: "Celebrate wins and build confidence",
        dataGoal: "Track what the person values about their own contributions",
        examplePhrasings: [
          "What felt like your biggest win this week?",
          "What are you most proud of from the last few days?",
          "What would you tell a friend you accomplished this week?",
        ],
        coreValue: null,
      },
      {
        id: "th6",
        intent: "Process challenges and blockers",
        dataGoal: "Identify recurring obstacles and coping strategies",
        examplePhrasings: [
          "What was the trickiest part of your week?",
          "Where did you feel stuck, and what helped you move forward?",
          "Was there a moment where things felt hard? What happened?",
        ],
        coreValue: null,
      },
    ],
    timesUsed: 32,
    lastUsed: "Feb 14, 2026",
  },
  {
    id: "qn3",
    name: "Manager Effectiveness",
    category: "three_sixty" as const,
    source: "custom" as const,
    active: true,
    verbatim: true,
    description: "Upward feedback on manager support, clarity, and team development — verbatim mode for consistent HR benchmarking",
    themes: [
      {
        id: "th7",
        intent: "Assess management support quality",
        dataGoal: "Understand whether reports feel supported and unblocked",
        examplePhrasings: [
          "How supported did you feel by your manager this week?",
          "Was there a time you needed help — did you get it?",
          "How well does your manager remove obstacles for you?",
        ],
        coreValue: null,
      },
      {
        id: "th8",
        intent: "Evaluate clarity of direction",
        dataGoal: "Check if priorities and expectations are communicated clearly",
        examplePhrasings: [
          "Are you clear on what's expected of you right now?",
          "Do you feel like you understand the team's priorities?",
          "How well does your manager set direction?",
        ],
        coreValue: "Communication",
      },
    ],
    timesUsed: 14,
    lastUsed: "Feb 7, 2026",
  },
  {
    id: "qn4",
    name: "Team Pulse",
    category: "pulse_check" as const,
    source: "imported" as const,
    active: true,
    verbatim: false,
    description: "Quick sentiment check imported from company wellness survey template",
    themes: [
      {
        id: "th9",
        intent: "Gauge team morale",
        dataGoal: "Track sentiment trends over time to catch culture issues early",
        examplePhrasings: [
          "How's the vibe on your team lately?",
          "If you described the team energy in one word, what would it be?",
          "What's the overall mood right now?",
        ],
        coreValue: null,
      },
    ],
    timesUsed: 22,
    lastUsed: "Feb 12, 2026",
  },
  {
    id: "qn5",
    name: "Ownership Deep-Dive",
    category: "peer_review" as const,
    source: "custom" as const,
    active: false,
    verbatim: false,
    description: "Focused exploration of accountability and follow-through behaviors",
    themes: [
      {
        id: "th10",
        intent: "Probe initiative and accountability",
        dataGoal: "Identify self-starting behavior and commitment to follow-through",
        examplePhrasings: [
          "Can you think of a time they took the lead without being asked?",
          "How do they handle things when plans change or something breaks?",
          "Describe a moment where they really owned a challenge.",
        ],
        coreValue: "Ownership",
      },
    ],
    timesUsed: 5,
    lastUsed: "Jan 15, 2026",
  },
];

// AI-discovered question themes from comms analysis
export const aiDiscoveredThemes = [
  {
    id: "ai1",
    intent: "Cross-team handoff friction",
    discoveredFrom: "Recurring mentions in #engineering and #product about unclear ownership during project transitions",
    confidence: 0.89,
    suggestedFor: "peer_review" as const,
    examplePhrasings: [
      "How smooth was the handoff between teams on this project?",
      "Were there moments where it wasn't clear who owned what?",
    ],
    discoveredAt: "Feb 11, 2026",
    status: "suggested" as const,
    relatedCommsCount: 14,
  },
  {
    id: "ai2",
    intent: "Meeting overload impact on deep work",
    discoveredFrom: "Calendar analysis shows 60%+ of eng team has >4hrs daily meetings; correlated Slack messages about focus time",
    confidence: 0.82,
    suggestedFor: "pulse_check" as const,
    examplePhrasings: [
      "Are you getting enough uninterrupted time to focus?",
      "How do meetings affect your ability to do your best work?",
    ],
    discoveredAt: "Feb 9, 2026",
    status: "accepted" as const,
    relatedCommsCount: 23,
  },
  {
    id: "ai3",
    intent: "Recognition gap for backend contributors",
    discoveredFrom: "Feedback data shows 70% fewer kudos for infrastructure work vs. user-facing features",
    confidence: 0.74,
    suggestedFor: "peer_review" as const,
    examplePhrasings: [
      "Has anyone behind the scenes made your work possible lately?",
      "What invisible work has helped the team that deserves recognition?",
    ],
    discoveredAt: "Feb 6, 2026",
    status: "suggested" as const,
    relatedCommsCount: 8,
  },
  {
    id: "ai4",
    intent: "Onboarding support quality",
    discoveredFrom: "New hire mentions in #general about feeling lost; correlates with low first-month engagement scores",
    confidence: 0.91,
    suggestedFor: "three_sixty" as const,
    examplePhrasings: [
      "How well supported did you feel in your first few weeks?",
      "Was there something that would have made ramping up easier?",
    ],
    discoveredAt: "Jan 30, 2026",
    status: "dismissed" as const,
    relatedCommsCount: 6,
  },
];

// 1:1 Sessions (for /dashboard/one-on-ones and /team/members/[userId]/one-on-one)
export const oneOnOneSessions = [
  {
    id: "s1",
    managerId: "p2",
    employeeId: "p3",
    status: "completed" as const,
    scheduledAt: "2026-01-27T10:00:00Z",
    startedAt: "2026-01-27T10:02:00Z",
    endedAt: "2026-01-27T10:32:00Z",
    notes: "Discussed API migration progress. Sarah raised concern about being stretched thin between migration and onboarding docs. Agreed to push onboarding deadline to Feb 7. Rollback strategy needs documentation — Sarah will draft the runbook.",
    summary: "Migration check-in. Shifted onboarding deadline. Runbook action item assigned.",
    createdAt: "2026-01-25T09:00:00Z",
    updatedAt: "2026-01-27T10:32:00Z",
    agendaItems: [
      { id: "ag1", sessionId: "s1", text: "Follow up: API migration status", source: "ai" as const, covered: true, sortOrder: 0, createdAt: "2026-01-27T10:02:00Z" },
      { id: "ag2", sessionId: "s1", text: "Discuss rollback strategy", source: "manual" as const, covered: true, sortOrder: 1, createdAt: "2026-01-27T10:02:00Z" },
      { id: "ag3", sessionId: "s1", text: "Onboarding docs timeline", source: "manual" as const, covered: true, sortOrder: 2, createdAt: "2026-01-27T10:05:00Z" },
    ],
    actionItems: [
      { id: "ai1", sessionId: "s1", text: "Draft rollback runbook for API migration", assigneeId: "p3", dueDate: "2026-02-03", completed: true, completedAt: "2026-02-02T16:00:00Z", sortOrder: 0, createdAt: "2026-01-27T10:15:00Z" },
      { id: "ai2", sessionId: "s1", text: "Push onboarding docs deadline to Feb 7", assigneeId: "p2", dueDate: "2026-01-28", completed: true, completedAt: "2026-01-28T09:00:00Z", sortOrder: 1, createdAt: "2026-01-27T10:20:00Z" },
    ],
  },
  {
    id: "s2",
    managerId: "p2",
    employeeId: "p3",
    status: "completed" as const,
    scheduledAt: "2026-02-10T10:00:00Z",
    startedAt: "2026-02-10T10:01:00Z",
    endedAt: "2026-02-10T10:35:00Z",
    notes: "Sarah brought up interest in the tech lead track. Discussed strengths (cross-team communication, technical depth) and growth areas (delegation, stepping back from IC habits). Agreed to put together a development plan. Acknowledged the VP's positive mention of Q4 review presentation. Also followed up on open kudos from Aisha about code reviews.",
    summary: "Tech lead development track. VP kudos on Q4 presentation. Development plan action item.",
    createdAt: "2026-02-08T14:00:00Z",
    updatedAt: "2026-02-10T10:35:00Z",
    agendaItems: [
      { id: "ag4", sessionId: "s2", text: "Follow up: Rollback runbook for API migration", source: "ai" as const, covered: true, sortOrder: 0, createdAt: "2026-02-10T10:01:00Z" },
      { id: "ag5", sessionId: "s2", text: "Acknowledge kudos: \"Your code reviews are always so thoughtful\" from Aisha Patel", source: "ai" as const, covered: true, sortOrder: 1, createdAt: "2026-02-10T10:01:00Z" },
      { id: "ag6", sessionId: "s2", text: "Tech lead track discussion", source: "manual" as const, covered: true, sortOrder: 2, createdAt: "2026-02-10T10:03:00Z" },
    ],
    actionItems: [
      { id: "ai3", sessionId: "s2", text: "Draft tech lead development plan together", assigneeId: "p2", dueDate: "2026-02-24", completed: false, completedAt: null, sortOrder: 0, createdAt: "2026-02-10T10:25:00Z" },
      { id: "ai4", sessionId: "s2", text: "Identify 2 delegation opportunities this sprint", assigneeId: "p3", dueDate: "2026-02-17", completed: false, completedAt: null, sortOrder: 1, createdAt: "2026-02-10T10:28:00Z" },
    ],
  },
  {
    id: "s3",
    managerId: "p2",
    employeeId: "p3",
    status: "scheduled" as const,
    scheduledAt: "2026-02-17T10:00:00Z",
    startedAt: null,
    endedAt: null,
    notes: "",
    summary: "",
    createdAt: "2026-02-14T11:00:00Z",
    updatedAt: "2026-02-14T11:00:00Z",
    agendaItems: [],
    actionItems: [],
  },
];

// Notification preferences (for /dashboard/settings)
export const notificationPreferences = [
  { id: "np1", userId: "u1", type: "weekly_digest" as const, enabled: true, channel: "email" as const, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
  { id: "np2", userId: "u1", type: "flag_alert" as const, enabled: true, channel: "email" as const, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
  { id: "np3", userId: "u1", type: "nudge" as const, enabled: false, channel: "email" as const, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
  { id: "np4", userId: "u1", type: "leaderboard_update" as const, enabled: true, channel: "email" as const, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
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
