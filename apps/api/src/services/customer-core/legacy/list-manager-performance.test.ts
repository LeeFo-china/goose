import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

function readCustomerListSources() {
  return {
    manager: readFileSync(new URL("./list-manager.ts", import.meta.url), "utf8"),
    repository: readFileSync(
      new URL("../../../repositories/customer-core.ts", import.meta.url),
      "utf8",
    ),
  };
}

describe("Customer compact list performance contract", () => {
  test("loads latest summaries with the compact customer row query", () => {
    const { manager, repository } = readCustomerListSources();

    expect(repository).toContain(
      "latest_follow_ups:customer_follow_ups!customer_follow_ups_customer_id_fkey",
    );
    expect(repository).toContain("latest_projects:projects!projects_customer_id_fkey");
    expect(repository).toContain(
      "limit(1, { referencedTable: \"customer_follow_ups\" })",
    );
    expect(repository).toContain("limit(1, { referencedTable: \"projects\" })");

    expect(manager).toContain("this.buildEmbeddedFollowUpMap(pagedRows)");
    expect(manager).toContain("this.buildEmbeddedLatestProjectMap(pagedRows)");
    expect(manager).toContain("this.stripEmbeddedSummaryRows(pagedRows)");
    expect(manager).not.toContain("listLatestProjectsByCustomerIds({");
  });
});
