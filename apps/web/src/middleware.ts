import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Next.js middleware for auth redirects.
 *
 * With database-backed sessions, the session token cookie is a random string
 * validated server-side. Middleware (Edge runtime) can't do DB lookups, so
 * we only check cookie presence here. Full session validation + role/onboarding
 * checks happen in server component layouts via auth().
 */
export function middleware(request: NextRequest) {
  const sessionToken =
    request.cookies.get("authjs.session-token")?.value ||
    request.cookies.get("__Secure-authjs.session-token")?.value;

  const { pathname } = request.nextUrl;
  const isLoggedIn = !!sessionToken;
  const isDemoMode = process.env.DEMO_MODE === "true";

  // Demo mode: allow unauthenticated access to all routes
  if (isDemoMode && !isLoggedIn && pathname !== "/login") {
    return NextResponse.next();
  }

  // Authenticated user on login page → redirect to home hub
  if (isLoggedIn && pathname === "/login") {
    return NextResponse.redirect(new URL("/home", request.url));
  }

  // Unauthenticated users on protected routes → redirect to login
  if (!isLoggedIn && pathname !== "/login") {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/login",
    "/home",
    "/dashboard/:path*",
    "/team/:path*",
    "/settings/:path*",
    "/onboarding/:path*",
  ],
};
