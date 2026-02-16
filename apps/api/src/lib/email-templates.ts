const BRAND = {
  forest: "#2D5A3D",
  terracotta: "#C4775A",
  cream: "#FAF8F5",
  stone: "#57534E",
  light: "#F5F5F4",
};

const APP_URL = process.env.APP_URL ?? "http://localhost:3001";

function layout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title></head>
<body style="margin:0;padding:0;background:${BRAND.cream};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.cream};padding:32px 16px;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #E7E5E4;">
<!-- Header -->
<tr><td style="background:${BRAND.forest};padding:24px 32px;">
<span style="color:#ffffff;font-size:18px;font-weight:600;letter-spacing:-0.3px;">Revualy</span>
</td></tr>
<!-- Body -->
<tr><td style="padding:32px;">
${body}
</td></tr>
<!-- Footer -->
<tr><td style="padding:16px 32px;border-top:1px solid ${BRAND.light};text-align:center;">
<span style="color:#A8A29E;font-size:12px;">Sent by Revualy &middot; <a href="${APP_URL}/settings/notifications" style="color:${BRAND.terracotta};text-decoration:none;">Notification preferences</a></span>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

// ── Weekly Digest ─────────────────────────────────────

export interface WeeklyDigestData {
  userName: string;
  weekLabel: string;
  feedbackReceived: number;
  feedbackGiven: number;
  engagementScore: number;
  kudosReceived: number;
  topValue: string | null;
  streak: number;
}

export function weeklyDigestTemplate(data: WeeklyDigestData): string {
  const scoreColor = data.engagementScore >= 75 ? BRAND.forest : data.engagementScore >= 50 ? BRAND.terracotta : "#DC2626";

  return layout(`Your weekly digest — ${data.weekLabel}`, `
<p style="color:${BRAND.stone};font-size:15px;margin:0 0 24px;">Hi ${data.userName},</p>
<p style="color:${BRAND.stone};font-size:15px;margin:0 0 24px;">Here's your peer review summary for <strong>${data.weekLabel}</strong>.</p>

<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
<tr>
<td style="padding:16px;background:${BRAND.light};border-radius:12px;text-align:center;width:33%;">
<div style="font-size:24px;font-weight:700;color:${scoreColor};">${data.engagementScore}</div>
<div style="font-size:12px;color:#A8A29E;margin-top:4px;">Engagement</div>
</td>
<td width="8"></td>
<td style="padding:16px;background:${BRAND.light};border-radius:12px;text-align:center;width:33%;">
<div style="font-size:24px;font-weight:700;color:${BRAND.forest};">${data.feedbackReceived}</div>
<div style="font-size:12px;color:#A8A29E;margin-top:4px;">Received</div>
</td>
<td width="8"></td>
<td style="padding:16px;background:${BRAND.light};border-radius:12px;text-align:center;width:33%;">
<div style="font-size:24px;font-weight:700;color:${BRAND.terracotta};">${data.feedbackGiven}</div>
<div style="font-size:12px;color:#A8A29E;margin-top:4px;">Given</div>
</td>
</tr>
</table>

${data.kudosReceived > 0 ? `<p style="color:${BRAND.stone};font-size:14px;margin:0 0 8px;">You received <strong>${data.kudosReceived} kudos</strong> this week${data.topValue ? ` — most recognized for <strong>${data.topValue}</strong>` : ""}.</p>` : ""}
${data.streak > 0 ? `<p style="color:${BRAND.stone};font-size:14px;margin:0 0 16px;">Current streak: <strong>${data.streak} weeks</strong> of consistent engagement.</p>` : ""}

<table cellpadding="0" cellspacing="0" style="margin-top:16px;">
<tr><td style="background:${BRAND.forest};border-radius:10px;padding:12px 24px;">
<a href="${APP_URL}/dashboard" style="color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;">View your dashboard</a>
</td></tr>
</table>
`);
}

// ── Flag Alert (Manager) ──────────────────────────────

export interface FlagAlertData {
  managerName: string;
  subjectName: string;
  severity: string;
  reason: string;
  flaggedContent: string;
  escalationId: string;
}

export function flagAlertTemplate(data: FlagAlertData): string {
  const severityColor = data.severity === "critical" ? "#DC2626" : data.severity === "warning" ? BRAND.terracotta : "#D97706";
  const severityLabel = data.severity.charAt(0).toUpperCase() + data.severity.slice(1);

  return layout(`Flag alert: ${data.subjectName}`, `
<p style="color:${BRAND.stone};font-size:15px;margin:0 0 16px;">Hi ${data.managerName},</p>
<p style="color:${BRAND.stone};font-size:15px;margin:0 0 24px;">Revualy has detected a potential concern in a recent feedback interaction.</p>

<div style="background:${BRAND.light};border-left:4px solid ${severityColor};border-radius:0 12px 12px 0;padding:16px 20px;margin-bottom:24px;">
<div style="font-size:12px;font-weight:700;color:${severityColor};text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">${severityLabel}</div>
<p style="color:${BRAND.stone};font-size:14px;margin:0 0 8px;"><strong>Subject:</strong> ${data.subjectName}</p>
<p style="color:${BRAND.stone};font-size:14px;margin:0 0 8px;"><strong>Reason:</strong> ${data.reason}</p>
${data.flaggedContent ? `<p style="color:#78716C;font-size:13px;font-style:italic;margin:8px 0 0;border-top:1px solid #E7E5E4;padding-top:8px;">"${data.flaggedContent}"</p>` : ""}
</div>

<table cellpadding="0" cellspacing="0">
<tr><td style="background:${BRAND.forest};border-radius:10px;padding:12px 24px;">
<a href="${APP_URL}/team/flagged" style="color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;">Review in dashboard</a>
</td></tr>
</table>
`);
}

// ── Nudge ─────────────────────────────────────────────

export interface NudgeData {
  userName: string;
  interactionsPending: number;
  targetThisWeek: number;
  dayOfWeek: string;
}

export function nudgeTemplate(data: NudgeData): string {
  return layout("Friendly reminder: peer reviews this week", `
<p style="color:${BRAND.stone};font-size:15px;margin:0 0 16px;">Hi ${data.userName},</p>
<p style="color:${BRAND.stone};font-size:15px;margin:0 0 24px;">You have <strong>${data.interactionsPending} peer review${data.interactionsPending !== 1 ? "s" : ""}</strong> remaining this week (target: ${data.targetThisWeek}). It's ${data.dayOfWeek} — a great time to catch up!</p>

<p style="color:#78716C;font-size:14px;margin:0 0 24px;">Quick, thoughtful feedback makes a real difference for your teammates. Even a few sentences help.</p>

<table cellpadding="0" cellspacing="0">
<tr><td style="background:${BRAND.forest};border-radius:10px;padding:12px 24px;">
<a href="${APP_URL}/dashboard" style="color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;">Open Revualy</a>
</td></tr>
</table>
`);
}
