import "server-only";
import { cache } from "react";
import { auth } from "./auth";
import { getDb } from "./db";
import type { ViewerContext, Role } from "@revualy/db/context";
import { getUserWithManager } from "@revualy/db/queries";

/**
 * Build a ViewerContext for the current request.
 * Wrapped with React cache() — one DB hit per render.
 *
 * Returns null if no authenticated session exists (unless demo mode).
 */
export const getViewerContext = cache(
  async (): Promise<ViewerContext | null> => {
    const session = await auth();
    if (!session?.user?.id) return null;

    const isDemo = process.env.DEMO_MODE === "true" && session.user.id === "demo-user";

    if (isDemo) {
      return {
        db: getDb(),
        orgId: process.env.ORG_ID ?? "demo-org",
        userId: "demo-user",
        role: "admin" as Role,
        teamId: null,
        managerId: null,
        isDemo: true,
      };
    }

    const db = getDb();
    // Re-read role from DB for security (session cookie may be stale)
    const user = await getUserWithManager(db, session.user.id);

    if (!user) return null;

    return {
      db,
      orgId: session.orgId || process.env.ORG_ID || "",
      userId: user.id,
      role: (user.role as Role) ?? "employee",
      teamId: user.teamId,
      managerId: user.managerId,
      isDemo: false,
    };
  },
);
