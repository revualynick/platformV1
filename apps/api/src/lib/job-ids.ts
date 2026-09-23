/**
 * Build a BullMQ custom job id from its parts.
 *
 * BullMQ 5 rejects custom ids containing ":" unless they split into exactly
 * three segments ("Custom Id cannot contain :"), because ":" is its own Redis
 * key separator. Joining with "_" and stripping ":" from every part keeps ids
 * valid whatever values (org ids, dates, uuids) are passed in.
 */
export function buildJobId(...parts: string[]): string {
  return parts.map((p) => p.replaceAll(":", "_")).join("_");
}
