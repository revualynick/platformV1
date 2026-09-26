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

const GOOGLE_DOC_MIME = "application/vnd.google-apps.document";

/**
 * Title patterns for the Docs Meet attaches to a Calendar event. Gemini
 * "Take notes for me" titles are unconfirmed ("<event> - <date> - Notes by
 * Gemini" is the likely shape), so match defensively and adjust here.
 * Notes are checked first: a title matching both is treated as notes.
 */
export const MEET_DOC_PATTERNS: { notes: RegExp[]; transcript: RegExp[] } = {
  notes: [/notes by gemini/i, /gemini notes/i, /notes from gemini/i, /meeting notes/i],
  transcript: [/transcript/i],
};

export interface MeetingDocs {
  /** Gemini notes: the source of tasks and goals. */
  notesDocId: string | null;
  /** Meet transcript: the source of verbatim evidence quotes. */
  transcriptDocId: string | null;
}

/**
 * Sort an event's attachments into the Gemini notes Doc and the Meet
 * transcript Doc. Only Google Docs count, and an unrecognised Doc (an
 * agenda, say) is ignored rather than guessed at.
 */
export function matchMeetAttachments(
  attachments: Array<{ fileId: string; title: string; mimeType: string }>,
  patterns = MEET_DOC_PATTERNS,
): MeetingDocs {
  let notesDocId: string | null = null;
  let transcriptDocId: string | null = null;
  for (const a of attachments) {
    if (a.mimeType !== GOOGLE_DOC_MIME) continue;
    if (!notesDocId && patterns.notes.some((p) => p.test(a.title))) notesDocId = a.fileId;
    else if (!transcriptDocId && patterns.transcript.some((p) => p.test(a.title))) transcriptDocId = a.fileId;
  }
  return { notesDocId, transcriptDocId };
}

/**
 * Locate the Gemini notes and Meet transcript Docs for a 1:1: first via
 * the event's attachments, then by searching Drive for Docs modified
 * after the meeting started whose name starts like the event title.
 * Both may be missing for hours after the call. Same scope as before
 * (drive.readonly); no new Google permissions.
 */
export async function findMeetingDocs(
  accessToken: string,
  event: TranscriptLookupEvent,
): Promise<MeetingDocs> {
  const auth = createClient(accessToken);
  let found: MeetingDocs = { notesDocId: null, transcriptDocId: null };

  const calendar = google.calendar({ version: "v3", auth });
  try {
    const { data } = await calendar.events.get({
      calendarId: "primary",
      eventId: event.externalEventId,
      fields: "attachments",
    });
    found = matchMeetAttachments(
      (data.attachments ?? [])
        .filter((a) => a.fileId)
        .map((a) => ({ fileId: a.fileId!, title: a.title ?? "", mimeType: a.mimeType ?? "" })),
    );
    if (found.notesDocId && found.transcriptDocId) return found;
  } catch {
    // Event may have been deleted: fall through to Drive search
  }

  const drive = google.drive({ version: "v3", auth });
  const { data } = await drive.files.list({
    q: `(name contains 'Transcript' or name contains 'Gemini' or name contains 'Notes') and mimeType = '${GOOGLE_DOC_MIME}' and modifiedTime > '${event.eventStart.toISOString()}'`,
    fields: "files(id, name)",
    pageSize: 25,
  });
  const titlePrefix = event.title.slice(0, 30).toLowerCase();
  const fromDrive = matchMeetAttachments(
    (data.files ?? [])
      .filter((f) => f.id && (f.name ?? "").toLowerCase().includes(titlePrefix))
      .map((f) => ({ fileId: f.id!, title: f.name ?? "", mimeType: GOOGLE_DOC_MIME })),
  );
  return {
    notesDocId: found.notesDocId ?? fromDrive.notesDocId,
    transcriptDocId: found.transcriptDocId ?? fromDrive.transcriptDocId,
  };
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
