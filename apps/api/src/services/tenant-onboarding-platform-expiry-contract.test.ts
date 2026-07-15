import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const serviceSource = readFileSync(
  join(import.meta.dir, "tenant-onboarding-review.ts"),
  "utf8",
);

describe("platform tenant onboarding expiry contract", () => {
  test("expires due assists before platform queue and detail reads", () => {
    expect(serviceSource).toMatch(
      /async list\([\s\S]*?this\.assertReviewPermission\(authContext\);\s+await this\.expireDuePartnerAssists\(\);\s+return this\.repository\.listApplications/,
    );
    expect(serviceSource).toMatch(
      /async get\([\s\S]*?this\.assertReviewPermission\(authContext\);\s+await this\.expireDuePartnerAssists\(\);\s+return this\.requireApplication\(applicationId\)/,
    );
    expect(serviceSource).toMatch(
      /expireDuePartnerAssists\(\)[\s\S]*?expireDuePartnerAssistTasks\(\{\s+cutoff: this\.clock\(\)\.toISOString\(\),\s+\}\)/,
    );
  });
});
