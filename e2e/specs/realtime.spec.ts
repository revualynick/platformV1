import { test, expect } from "@playwright/test";
import { loginAsEmail, USERS } from "../helpers/auth";
import { API_URL, WS_URL, INTERNAL_SECRET, psql as runSql, userId } from "../helpers/env";
import WebSocket from "ws";

/**
 * Phase 7 — realtime 1:1 session sync. The heavy lifting is verified at the
 * protocol level with raw WS clients (reliable; avoids two-browser-context +
 * hydration flake): manager edits notes → employee receives content_sync.
 * A lighter Playwright check confirms the employee SessionViewer renders.
 *
 * Manager = jordan.wells, employee = sarah.chen (sarah reports to jordan).
 */

const JORDAN = userId(USERS.manager);
const SARAH = userId(USERS.employee);
const API = API_URL;
const SECRET = INTERNAL_SECRET;
const psql = runSql;

async function mintToken(sessionId: string, userId: string): Promise<string> {
  const res = await fetch(`${API}/api/v1/one-on-one-sessions/${sessionId}/ws-token`, {
    method: "POST",
    headers: { "x-internal-secret": SECRET, "x-user-id": userId, "content-type": "application/json" },
    body: "{}", // Fastify rejects an empty body when content-type is JSON
  });
  if (!res.ok) throw new Error(`ws-token ${res.status}`);
  const body = await res.json();
  return body.token ?? body.wsToken ?? body.data?.token;
}

function connect(sessionId: string, token: string): Promise<{ ws: WebSocket; messages: any[] }> {
  const messages: any[] = [];
  const ws = new WebSocket(`${WS_URL}/ws/one-on-one/${sessionId}`, ["revualy-ws", token]);
  ws.on("message", (d) => {
    try { messages.push(JSON.parse(d.toString())); } catch { /* ignore */ }
  });
  return new Promise((resolve, reject) => {
    ws.on("open", () => resolve({ ws, messages }));
    ws.on("error", reject);
    setTimeout(() => reject(new Error("ws open timeout")), 8000);
  });
}

let sessionId: string;

test.beforeAll(() => {
  // Seed a fresh active session for the jordan↔sarah pair. psql prints the
  // returned id AND an "INSERT 0 1" status line — extract just the UUID.
  const out = psql(
    `INSERT INTO one_on_one_sessions (id, manager_id, employee_id, status, scheduled_at, started_at, notes, summary, created_at, updated_at) VALUES (gen_random_uuid(), '${JORDAN}', '${SARAH}', 'active', now(), now(), '', '', now(), now()) RETURNING id`,
  );
  sessionId = (out.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/) ?? [])[0] ?? "";
  expect(sessionId, "seeded session id").toMatch(/[0-9a-f-]{36}/);
});

test.afterAll(() => {
  if (sessionId) psql(`DELETE FROM one_on_one_sessions WHERE id='${sessionId}'`);
});

test("realtime: manager note edit propagates to employee (content_sync)", async () => {
  const mgrToken = await mintToken(sessionId, JORDAN);
  const empToken = await mintToken(sessionId, SARAH);
  expect(mgrToken, "manager ws token").toBeTruthy();
  expect(empToken, "employee ws token").toBeTruthy();

  const mgr = await connect(sessionId, mgrToken);
  const emp = await connect(sessionId, empToken);

  // Both sides should observe presence once both are connected.
  await new Promise((r) => setTimeout(r, 500));

  // Manager edits notes → employee must receive content_sync with the text.
  const text = `realtime-note-${Date.now()}`;
  mgr.ws.send(JSON.stringify({ type: "content_update", content: text }));

  await expect
    .poll(() => emp.messages.find((m) => m.type === "content_sync" && m.content === text) ? "got" : "waiting", {
      timeout: 8000,
    })
    .toBe("got");

  // Presence was exchanged.
  const sawPresence = [...mgr.messages, ...emp.messages].some((m) => m.type === "presence");
  expect(sawPresence, "presence message exchanged").toBe(true);

  mgr.ws.close();
  emp.ws.close();
});

test("realtime: employee cannot edit notes (server rejects)", async () => {
  const empToken = await mintToken(sessionId, SARAH);
  const emp = await connect(sessionId, empToken);
  // Settle: the server attaches its `message` listener only after an async session
  // lookup, so a message sent in the same tick as `open` is dropped by the Node
  // stream before the listener exists. Real clients never send that fast; wait a
  // beat so the rejection path is actually exercised.
  await new Promise((r) => setTimeout(r, 500));
  emp.ws.send(JSON.stringify({ type: "content_update", content: "hacker" }));
  await expect
    .poll(() => emp.messages.find((m) => m.type === "error" && /only the manager/i.test(m.message || "")) ? "err" : "wait", {
      timeout: 6000,
    })
    .toBe("err");
  emp.ws.close();
});

test("realtime: employee SessionViewer page renders for an active session", async ({ page }) => {
  await loginAsEmail(page, USERS.employee, `/dashboard/one-on-ones/${sessionId}`);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(800);
  const body = await page.locator("body").innerText();
  expect(body, "session viewer renders").toMatch(/1:1|session|notes|agenda/i);
  expect(body).not.toMatch(/Application error|Unhandled Runtime|could not be found/i);
});
