import { Resend } from "resend";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_ADDRESS = process.env.EMAIL_FROM ?? "Revualy <notifications@revualy.com>";

let resend: Resend | null = null;

function getResend(): Resend | null {
  if (!RESEND_API_KEY) return null;
  if (!resend) {
    resend = new Resend(RESEND_API_KEY);
  }
  return resend;
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  unsubscribeUrl?: string;
}

/**
 * Send an email via Resend. Logs to console when RESEND_API_KEY is not set.
 */
export async function sendEmail(opts: SendEmailOptions): Promise<void> {
  const client = getResend();

  if (!client) {
    // No Resend key — log at debug level without PII (recipient address / body).
    // Fastify logger is not available in this utility module; use process.stderr
    // at debug level so PII does not appear in production stdout logs.
    if ((process.env.LOG_LEVEL ?? "info") === "debug") {
      process.stderr.write(
        `[email-stub] Subject: ${opts.subject} (recipient and body omitted)\n`,
      );
    }
    return;
  }

  const headers: Record<string, string> = {};
  if (opts.unsubscribeUrl) {
    // RFC 8058 one-click unsubscribe
    headers["List-Unsubscribe"] = `<${opts.unsubscribeUrl}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }

  await client.emails.send({
    from: FROM_ADDRESS,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    headers,
  });
}
