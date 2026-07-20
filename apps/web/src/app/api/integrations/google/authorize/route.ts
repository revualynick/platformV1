import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isDemoSession } from "@/lib/session-utils";

const API_BASE = process.env.INTERNAL_API_URL ?? "http://localhost:3000";

/**
 * Browser-facing entry to the Google OAuth flow. The Fastify API
 * requires internal-secret headers a browser can't send, so this route
 * authenticates the session, asks the API for the Google consent URL,
 * and forwards the browser there.
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || isDemoSession(session)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const returnTo = request.nextUrl.searchParams.get("returnTo") ?? "/dashboard/settings";

  const apiRes = await fetch(
    `${API_BASE}/api/v1/integrations/google/authorize?returnTo=${encodeURIComponent(returnTo)}`,
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
  if (!location) {
    return NextResponse.redirect(
      new URL(`${returnTo}?error=oauth_unavailable`, request.url),
    );
  }
  return NextResponse.redirect(location);
}
