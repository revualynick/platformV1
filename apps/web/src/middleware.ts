import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

/**
 * Next.js middleware for auth protection + onboarding redirect.
 * - Authenticated users hitting /login → redirect to /home
 * - Authenticated users who haven't completed onboarding → redirect to /onboarding
 *   (except when they're already on /onboarding or public routes)
 * - Dashboard routes allow unauthenticated access (mock-data demo mode)
 * - Public routes (/, /home, /api/auth/*) pass through
 */
export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;

  // Authenticated user on login page → redirect to home hub
  if (isLoggedIn && pathname === "/login") {
    return NextResponse.redirect(new URL("/home", req.url));
  }

  // Onboarding redirect: if logged in and on a dashboard route, check onboarding
  if (
    isLoggedIn &&
    pathname.startsWith("/dashboard") &&
    !pathname.startsWith("/onboarding")
  ) {
    // Check onboarding status from session data
    // The session may include onboardingCompleted from the user record.
    // If it does and it's false, redirect to onboarding.
    const user = req.auth?.user as Record<string, unknown> | undefined;
    if (user && user.onboardingCompleted === false) {
      return NextResponse.redirect(new URL("/onboarding", req.url));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/login", "/dashboard/:path*"],
};
