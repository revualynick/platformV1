/**
 * Session-based demo detection.
 *
 * When DEMO_MODE=true, unauthenticated visitors get a synthetic session
 * with user.id === "demo-user" (see lib/auth.ts). Real logged-in users
 * always have a different user.id from the DB.
 */
import { auth } from "@/lib/auth";

export function isDemoSession(
  session: { user?: { id?: string } } | null,
): boolean {
  return session?.user?.id === "demo-user";
}

export async function requireLiveSession() {
  const session = await auth();
  if (!session) return { ok: false as const, error: "Not authenticated" };
  if (isDemoSession(session)) return { ok: false as const, error: "Mutations are disabled in demo mode" };
  return { ok: true as const, session };
}

export async function requireRole(...roles: string[]) {
  const result = await requireLiveSession();
  if (!result.ok) return result;
  const session = result.session as import("next-auth").Session & { role?: string };
  const userRole = session.role ?? "";
  // super_admin satisfies any role check
  if (userRole !== "super_admin" && !roles.includes(userRole)) {
    return { ok: false as const, error: "Insufficient permissions" };
  }
  return { ...result, role: userRole };
}
