import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

/**
 * Next.js middleware for auth protection + onboarding redirect.
 * - Authenticated users hitting /login → redirect to /home
 * - Unauthenticated users on protected routes → redirect to /login
 * - Authenticated users who haven't completed onboarding → redirect to /onboarding
 * - Public routes (/, /api/auth/*) pass through (not matched)
 */
export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;

  // Authenticated user on login page → redirect to home hub
  if (isLoggedIn && pathname === "/login") {
    return NextResponse.redirect(new URL("/home", req.url));
  }

  // Unauthenticated users on protected routes → redirect to login
  if (!isLoggedIn && pathname !== "/login") {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Onboarding redirect: if logged in and not already on onboarding
  if (isLoggedIn && !pathname.startsWith("/onboarding")) {
    const user = req.auth?.user as Record<string, unknown> | undefined;
    if (user && user.onboardingCompleted === false) {
      return NextResponse.redirect(new URL("/onboarding", req.url));
    }
  }

  // Role-based route protection
  if (isLoggedIn) {
    const session = req.auth as unknown as Record<string, unknown> | undefined;
    const role = (typeof session?.role === "string" ? session.role : "employee");

    // /team/* requires manager or admin
    if (pathname.startsWith("/team") && role === "employee") {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }

    // /settings/* (admin settings) requires admin
    if (pathname.startsWith("/settings") && role !== "admin") {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
  }

  return NextResponse.next();
});

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
