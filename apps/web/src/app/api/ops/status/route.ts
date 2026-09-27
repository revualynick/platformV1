import { NextResponse } from "next/server";
import { timingSafeEqual, createHash } from "node:crypto";

/**
 * GET /api/ops/status (C3 step 8): the tenant's ops checks for the fleet
 * script (pnpm tenant:fleet health). The API is on Railway's private
 * network, so this route is the way in: it checks the fleet-wide ops token
 * (OPS_TOKEN, a bearer token) and asks the API with the internal secret.
 * Counts only; nothing personal. 404 when OPS_TOKEN isn't set, so the
 * route doesn't exist on a tenant that hasn't opted in.
 */

export const dynamic = "force-dynamic";

function tokenOk(provided: string | null): boolean {
  const expected = process.env.OPS_TOKEN;
  if (!expected || !provided) return false;
  // Hash both sides so lengths match for the constant-time compare.
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  if (!process.env.OPS_TOKEN) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const auth = request.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  if (!tokenOk(token)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) return NextResponse.json({ error: "Not configured" }, { status: 500 });
  try {
    const res = await fetch(`${process.env.INTERNAL_API_URL ?? "http://localhost:3000"}/api/v1/ops/status`, {
      headers: { "x-internal-secret": secret },
      cache: "no-store",
    });
    const body = await res.json();
    return NextResponse.json(body, { status: res.status });
  } catch {
    // The API itself is unreachable: that is the worst status there is.
    return NextResponse.json(
      { status: "fail", checkedAt: new Date().toISOString(), checks: [{ name: "api_reachable", status: "fail", value: 0, detail: "The web app can't reach the API" }] },
      { status: 503 },
    );
  }
}
