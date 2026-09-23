import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

/**
 * Page-level role guards.
 *
 * Layouts are not guaranteed to re-run for every page request (client
 * navigation can render a page segment without its parent layout), so a
 * role check that lives only in a layout does not protect pages that read
 * the database directly. Call the matching guard at the top of every page
 * under (admin) or (manager). auth() is wrapped in React cache(), so this
 * adds no extra DB work to a render that already resolved the session.
 *
 * Rules mirror the layouts: DEMO_MODE lets visitors through with the
 * synthetic demo session; otherwise no session goes to /login and an
 * insufficient role goes to /dashboard.
 */

export async function requireAdminPage() {
  const session = await auth();
  if (!session) {
    if (process.env.DEMO_MODE === "true") return session;
    redirect("/login");
  }
  if (!["admin", "super_admin"].includes(session.role ?? "")) {
    redirect("/dashboard");
  }
  return session;
}

export async function requireManagerPage() {
  const session = await auth();
  if (!session) {
    if (process.env.DEMO_MODE === "true") return session;
    redirect("/login");
  }
  if (!["manager", "admin", "super_admin"].includes(session.role ?? "")) {
    redirect("/dashboard");
  }
  return session;
}
