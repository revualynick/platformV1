/**
 * Server-side page data-loading errors were previously swallowed by
 * the mock-fallback pattern, making outages look like empty accounts.
 * Every catch in page loaders must call this so failures reach logs.
 */
export function logPageError(scope: string, err: unknown): void {
  console.error(`[page:${scope}]`, err instanceof Error ? err.message : err, err);
}
