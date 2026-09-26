import { google } from "googleapis";
import { eq, and } from "drizzle-orm";
import type { TenantDb } from "@revualy/db";
import { calendarTokens } from "@revualy/db";
import { decrypt, encrypt } from "@revualy/shared/server";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? "";
const GOOGLE_REDIRECT_URI =
  process.env.GOOGLE_CALENDAR_REDIRECT_URI ?? "http://localhost:3000/api/v1/integrations/google/callback";

function createOAuth2Client() {
  return new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI,
  );
}

export const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";

/**
 * Generate the Google OAuth2 authorization URL for calendar + Drive
 * access. Drive (readonly) is needed to read Meet transcript Docs for
 * goal check-in processing. Users who connected before the Drive scope
 * was added must reconnect to grant it.
 */
export function getAuthUrl(state: string): string {
  const client = createOAuth2Client();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: true,
    scope: [
      "https://www.googleapis.com/auth/calendar.readonly",
      GOOGLE_DRIVE_SCOPE,
    ],
    state,
  });
}

/**
 * Exchange an authorization code for tokens.
 */
export async function exchangeCode(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scopes: string;
}> {
  const client = createOAuth2Client();
  const { tokens } = await client.getToken(code);

  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error("Missing tokens from Google OAuth exchange");
  }

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: new Date(tokens.expiry_date ?? Date.now() + 3600 * 1000),
    scopes: tokens.scope ?? "",
  };
}

/**
 * Refresh an expired access token using the refresh token.
 */
export async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  expiresAt: Date;
}> {
  const client = createOAuth2Client();
  client.setCredentials({ refresh_token: refreshToken });

  const { credentials } = await client.refreshAccessToken();

  if (!credentials.access_token) {
    throw Object.assign(
      new Error("Google token refresh returned no access_token"),
      { code: "GOOGLE_REFRESH_MISSING_TOKEN" },
    );
  }

  return {
    accessToken: credentials.access_token,
    expiresAt: new Date(credentials.expiry_date ?? Date.now() + 3600 * 1000),
  };
}

/**
 * Get a fresh (decrypted, refreshed-if-expired) access token for a
 * user's stored Google credentials. Shared by calendar sync and the
 * check-in transcript pipeline. Returns null if not connected.
 */
export async function getFreshGoogleAccessToken(
  db: TenantDb,
  userId: string,
): Promise<{ accessToken: string; scopes: string } | null> {
  const [token] = await db
    .select()
    .from(calendarTokens)
    .where(
      and(
        eq(calendarTokens.userId, userId),
        eq(calendarTokens.provider, "google"),
      ),
    );
  if (!token) return null;


  let accessToken = decrypt(token.accessToken);
  if (token.expiresAt <= new Date()) {
    const refreshed = await refreshAccessToken(decrypt(token.refreshToken));
    accessToken = refreshed.accessToken;

    await db
      .update(calendarTokens)
      .set({
        accessToken: encrypt(refreshed.accessToken),
        expiresAt: refreshed.expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(calendarTokens.id, token.id));
  }

  return { accessToken, scopes: token.scopes };
}

export interface CalendarEvent {
  externalEventId: string;
  title: string;
  attendees: string[];
  /** Attendees who declined. */
  declined?: string[];
  /** Google visibility: default | public | private | confidential. */
  visibility?: string;
  startAt: Date;
  endAt: Date;
}

export interface CheckInEvent extends CalendarEvent {
  organizerEmail: string | null;
  attachments: Array<{ fileId: string; title: string; mimeType: string }>;
}

/**
 * Fetch past events (last `lookbackDays`). With a marker, only events
 * whose title matches it (Google's `q` filter is fuzzy, so callers must
 * re-check the title); with null, every timed event, so two-person 1:1s
 * without the marker can be spotted. Same calendar.readonly scope.
 */
export async function fetchPastCheckInEvents(
  accessToken: string,
  marker: string | null,
  lookbackDays = 14,
): Promise<CheckInEvent[]> {
  const client = createOAuth2Client();
  client.setCredentials({ access_token: accessToken });

  const calendar = google.calendar({ version: "v3", auth: client });

  const now = new Date();
  const lookback = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);

  const response = await calendar.events.list({
    calendarId: "primary",
    ...(marker ? { q: marker } : {}),
    timeMin: lookback.toISOString(),
    timeMax: now.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: marker ? 100 : 250,
  });

  const items = response.data.items ?? [];

  return items
    .filter((e) => e.start?.dateTime && e.end?.dateTime)
    .map((e) => ({
      externalEventId: e.id!,
      title: e.summary ?? "(No title)",
      // Meeting rooms are not people.
      attendees: (e.attendees ?? [])
        .filter((a) => !a.resource)
        .map((a) => a.email)
        .filter((email): email is string => !!email),
      declined: (e.attendees ?? [])
        .filter((a) => a.responseStatus === "declined" && a.email)
        .map((a) => a.email!),
      visibility: e.visibility ?? "default",
      startAt: new Date(e.start!.dateTime!),
      endAt: new Date(e.end!.dateTime!),
      organizerEmail: e.organizer?.email ?? null,
      attachments: (e.attachments ?? [])
        .filter((a) => a.fileId)
        .map((a) => ({
          fileId: a.fileId!,
          title: a.title ?? "",
          mimeType: a.mimeType ?? "",
        })),
    }));
}

/**
 * Fetch calendar events from the past week to the week ahead. The past
 * week is re-read so late declines are kept current: check-ins ask about
 * recent meetings, never ones the person declined.
 */
export async function fetchCalendarEvents(
  accessToken: string,
  lookbackDays = 7,
): Promise<CalendarEvent[]> {
  const client = createOAuth2Client();
  client.setCredentials({ access_token: accessToken });

  const calendar = google.calendar({ version: "v3", auth: client });

  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const lookback = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);

  const response = await calendar.events.list({
    calendarId: "primary",
    timeMin: lookback.toISOString(),
    timeMax: weekFromNow.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 250,
  });

  const items = response.data.items ?? [];

  return items
    .filter((e) => e.start?.dateTime && e.end?.dateTime) // Skip all-day events
    .map((e) => ({
      externalEventId: e.id!,
      title: e.summary ?? "(No title)",
      attendees: (e.attendees ?? [])
        .map((a) => a.email)
        .filter((email): email is string => !!email),
      declined: (e.attendees ?? [])
        .filter((a) => a.responseStatus === "declined" && a.email)
        .map((a) => a.email!),
      visibility: e.visibility ?? "default",
      startAt: new Date(e.start!.dateTime!),
      endAt: new Date(e.end!.dateTime!),
    }));
}
