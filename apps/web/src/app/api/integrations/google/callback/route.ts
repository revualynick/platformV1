import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isDemoSession } from "@/lib/session-utils";

const API_BASE = process.env.INTERNAL_API_URL ?? "http://localhost:3000";

/**
 * Google's OAuth redirect target (set GOOGLE_CALENDAR_REDIRECT_URI to
 * this route). The browser lands here with its session cookies; we
 * forward code+state to the Fastify API with the internal headers it
 * requires, then send the browser wherever the API's redirect points.
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || isDemoSession(session)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const code = request.nextUrl.searchParams.get("code") ?? "";
  const state = request.nextUrl.searchParams.get("state") ?? "";

  const apiRes = await fetch(
    `${API_BASE}/api/v1/integrations/google/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`,
    {
      headers: {
        "x-org-id": process.env.ORG_ID ?? "",
        "x-user-id": session.user.id,
        "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "",
      },
      redirect: "manual",
    },
  );

  const location = apiRes.headers.get("location");
  return NextResponse.redirect(
    location ?? new URL("/dashboard/settings?error=oauth_failed", request.url),
  );
}
