import { google } from "googleapis";

function createClient(accessToken: string) {
  const client = new google.auth.OAuth2();
  client.setCredentials({ access_token: accessToken });
  return client;
}

export interface TranscriptLookupEvent {
  externalEventId: string;
  title: string;
  eventStart: Date;
}

/**
 * Pick the transcript Doc from a calendar event's attachments.
 * Exported for tests. Meet attaches recordings, transcripts, and notes;
 * the transcript is a Google Doc, usually titled "... — Transcript".
 */
export function pickTranscriptAttachment(
  attachments: Array<{ fileId: string; title: string; mimeType: string }>,
): string | null {
  const docs = attachments.filter(
    (a) => a.mimeType === "application/vnd.google-apps.document",
  );
  if (docs.length === 0) return null;
  const titled = docs.find((a) => /transcript/i.test(a.title));
  return (titled ?? docs[0]).fileId;
}

/**
 * Locate the Meet transcript Doc for a check-in event: first via the
 * event's Drive attachments, then by searching Drive for transcript
 * Docs modified after the meeting started. Returns null when the
 * transcript hasn't been generated (yet) — Meet can take hours.
 */
export async function findTranscriptDoc(
  accessToken: string,
  event: TranscriptLookupEvent,
): Promise<string | null> {
  const auth = createClient(accessToken);

  // 1. Event attachments (most reliable when present)
  const calendar = google.calendar({ version: "v3", auth });
  try {
    const { data } = await calendar.events.get({
      calendarId: "primary",
      eventId: event.externalEventId,
      fields: "attachments",
    });
    const attachments = (data.attachments ?? [])
      .filter((a) => a.fileId)
      .map((a) => ({
        fileId: a.fileId!,
        title: a.title ?? "",
        mimeType: a.mimeType ?? "",
      }));
    const fromAttachment = pickTranscriptAttachment(attachments);
    if (fromAttachment) return fromAttachment;
  } catch {
    // Event may have been deleted — fall through to Drive search
  }

  // 2. Drive search fallback: transcript Docs modified after the event
  //    started, matched against the event title. Heuristic — breaks if
  //    the event was renamed after the meeting.
  const drive = google.drive({ version: "v3", auth });
  const modifiedAfter = event.eventStart.toISOString();
  const { data } = await drive.files.list({
    q: `name contains 'Transcript' and mimeType = 'application/vnd.google-apps.document' and modifiedTime > '${modifiedAfter}'`,
    fields: "files(id, name)",
    pageSize: 25,
  });

  const files = data.files ?? [];
  // Meet names transcripts "<event title> ... — Transcript"
  const titlePrefix = event.title.slice(0, 30).toLowerCase();
  const match = files.find((f) =>
    (f.name ?? "").toLowerCase().includes(titlePrefix),
  );
  return match?.id ?? null;
}

/** Export a Google Doc as plain text. Works under drive.readonly. */
export async function exportDocText(
  accessToken: string,
  fileId: string,
): Promise<string> {
  const auth = createClient(accessToken);
  const drive = google.drive({ version: "v3", auth });
  const { data } = await drive.files.export(
    { fileId, mimeType: "text/plain" },
    { responseType: "text" },
  );
  return typeof data === "string" ? data : String(data);
}
