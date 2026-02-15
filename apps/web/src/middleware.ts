import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

/**
 * Next.js middleware for auth protection.
 * - Authenticated users hitting /login → redirect to /home
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

  return NextResponse.next();
});

export const config = {
  matcher: ["/login"],
};
