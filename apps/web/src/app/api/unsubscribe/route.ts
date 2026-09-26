import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { notificationPreferences, users } from "@revualy/db";
import { verifyUnsubscribeToken } from "@revualy/shared/server";
import { getDb } from "@/lib/db";

/**
 * Public one-click unsubscribe (RFC 8058). Not behind the auth middleware:
 * the signed token is the credential, and it can only turn one
 * notification type off for one user.
 *
 * POST is the one-click path mail clients use. GET shows a confirmation
 * button instead of unsubscribing, because link scanners prefetch GETs.
 */

const LABELS: Record<string, string> = {
  weekly_digest: "the weekly digest",
  flag_alert: "flag alerts",
  nudge: "reminders",
  assessment_invite: "assessment invites",
};

function page(title: string, body: string, status = 200): NextResponse {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#FAF7F2;color:#44403C;margin:0;padding:48px 16px;">
<main style="max-width:480px;margin:0 auto;background:#fff;border:1px solid #E7E5E4;border-radius:16px;padding:32px;">${body}</main></body></html>`;
  return new NextResponse(html, { status, headers: { "content-type": "text/html; charset=utf-8" } });
}

function invalid(): NextResponse {
  return page("Link not valid", `<h1 style="font-size:20px;margin:0 0 12px;">This link isn't valid</h1><p>You can change which emails you get in your Revualy settings.</p>`, 400);
}

async function unsubscribe(token: string | null) {
  const secret = process.env.INTERNAL_API_SECRET ?? "";
  const parsed = token ? verifyUnsubscribeToken(secret, token) : null;
  if (!parsed || !(parsed.type in LABELS)) return null;

  const db = getDb();
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, parsed.userId));
  if (!user) return null;

  const [existing] = await db
    .select({ id: notificationPreferences.id })
    .from(notificationPreferences)
    .where(and(eq(notificationPreferences.userId, parsed.userId), eq(notificationPreferences.type, parsed.type)));
  if (existing) {
    await db
      .update(notificationPreferences)
      .set({ enabled: false, updatedAt: new Date() })
      .where(eq(notificationPreferences.id, existing.id));
  } else {
    await db.insert(notificationPreferences).values({ userId: parsed.userId, type: parsed.type, enabled: false });
  }
  return parsed;
}

export async function POST(request: NextRequest) {
  const done = await unsubscribe(request.nextUrl.searchParams.get("token"));
  if (!done) return invalid();
  // Mail clients only need a 2xx; a person who pressed the button sees this.
  return page("Unsubscribed", `<h1 style="font-size:20px;margin:0 0 12px;">You're unsubscribed</h1><p>You won't get ${LABELS[done.type]} by email any more. You can turn it back on in your Revualy settings.</p>`);
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const parsed = token ? verifyUnsubscribeToken(process.env.INTERNAL_API_SECRET ?? "", token) : null;
  if (!parsed || !(parsed.type in LABELS)) return invalid();
  const action = `/api/unsubscribe?token=${encodeURIComponent(token!)}`;
  return page(
    "Unsubscribe",
    `<h1 style="font-size:20px;margin:0 0 12px;">Stop ${LABELS[parsed.type]}?</h1>
<form method="post" action="${action}"><button type="submit" style="background:#2D4A3E;color:#fff;border:0;border-radius:10px;padding:12px 24px;font-size:14px;font-weight:600;cursor:pointer;">Unsubscribe</button></form>`,
  );
}
