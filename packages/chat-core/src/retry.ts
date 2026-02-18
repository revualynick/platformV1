/** Errors that should not be retried (non-transient). */
function isNonTransient(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    // Auth errors, validation errors, and not-found should not be retried
    if (msg.includes("unauthorized") || msg.includes("forbidden") || msg.includes("invalid")) return true;
    if (msg.includes("not found") || msg.includes("bad request")) return true;
  }
  // HTTP status codes in the 4xx range are non-transient
  const status = (err as { status?: number; statusCode?: number })?.status ??
    (err as { status?: number; statusCode?: number })?.statusCode;
  if (status && status >= 400 && status < 500) return true;
  return false;
}

/**
 * Retry helper with exponential backoff + jitter for transient failures.
 * Non-transient errors (4xx, auth, validation) are thrown immediately.
 */
export async function retryAsync<T>(
  fn: () => Promise<T>,
  opts?: { attempts?: number; delayMs?: number },
): Promise<T> {
  const attempts = opts?.attempts ?? 3;
  const baseDelay = opts?.delayMs ?? 500;

  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      // Don't retry non-transient errors
      if (isNonTransient(err)) throw err;
      if (i < attempts - 1) {
        // Exponential backoff with jitter to avoid thundering herd
        const delay = baseDelay * Math.pow(2, i) * (0.5 + Math.random() * 0.5);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}
