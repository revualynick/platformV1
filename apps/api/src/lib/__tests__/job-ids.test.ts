import { describe, it, expect } from "vitest";
import { Job } from "bullmq";
import { buildJobId } from "../job-ids.js";

/**
 * Runs BullMQ's own custom-id validation (the check Queue.add / addBulk
 * perform before touching Redis), so these tests fail if a BullMQ upgrade
 * tightens the rules again.
 */
function bullmqAccepts(jobId: string): void {
  (Job.prototype as unknown as {
    validateOptions: (this: { opts: { jobId: string } }, data: object) => void;
  }).validateOptions.call({ opts: { jobId } }, {});
}

const uuid = "3f1c2a9e-8b7d-4c6e-9f0a-1b2c3d4e5f60";

describe("buildJobId", () => {
  it("produces ids BullMQ accepts for every enqueue site", () => {
    const ids = [
      buildJobId("initiate", uuid),
      buildJobId("weekly-digest", "acme", uuid, "2026-09-21"),
      buildJobId("team-insights", "acme", uuid, "2026-08-01"),
      buildJobId("nudge", "acme", uuid, "2026-09-21", "2026-09-23"),
    ];
    for (const id of ids) {
      expect(() => bullmqAccepts(id)).not.toThrow();
    }
  });

  it("strips colons from parts so arbitrary values stay valid", () => {
    const id = buildJobId("nudge", "org:with:colons", uuid);
    expect(id).not.toContain(":");
    expect(() => bullmqAccepts(id)).not.toThrow();
  });

  it("the old colon-joined format is rejected (regression guard)", () => {
    expect(() => bullmqAccepts(`initiate:${uuid}`)).toThrow(/cannot contain :/);
  });
});
