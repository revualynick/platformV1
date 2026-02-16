import { google } from "googleapis";

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

/**
 * Generate the Google OAuth2 authorization URL for calendar access.
 */
export function getAuthUrl(state: string): string {
  const client = createOAuth2Client();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/calendar.readonly"],
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

  return {
    accessToken: credentials.access_token!,
    expiresAt: new Date(credentials.expiry_date ?? Date.now() + 3600 * 1000),
  };
}

export interface CalendarEvent {
  externalEventId: string;
  title: string;
  attendees: string[];
  startAt: Date;
  endAt: Date;
}

/**
 * Fetch calendar events for the next 7 days using an access token.
 */
export async function fetchCalendarEvents(
  accessToken: string,
): Promise<CalendarEvent[]> {
  const client = createOAuth2Client();
  client.setCredentials({ access_token: accessToken });

  const calendar = google.calendar({ version: "v3", auth: client });

  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const response = await calendar.events.list({
    calendarId: "primary",
    timeMin: now.toISOString(),
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
      startAt: new Date(e.start!.dateTime!),
      endAt: new Date(e.end!.dateTime!),
    }));
}
