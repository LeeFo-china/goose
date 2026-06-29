import { describe, expect, test } from "bun:test";
import {
  buildFinanceLedgerPageHref,
  buildFinanceLedgerSearchParams,
} from "./finance-ledger-query-utils";

describe("finance ledger query helpers", () => {
  test("builds ledger backend query params with entry type and project filters", () => {
    const params = buildFinanceLedgerSearchParams({
      page: 2,
      pageSize: 20,
      project_id: "project-1",
      direction: "in",
      entry_type: "project_payment",
      cost_category_id: "category-1",
      unallocated_only: "true",
    });

    expect(params.toString()).toBe(
      "page=2&pageSize=20&project_id=project-1&direction=in&entry_type=project_payment&cost_category_id=category-1&unallocated_only=true",
    );
  });

  test("preserves entry type filter when building pagination links", () => {
    const href = buildFinanceLedgerPageHref(3, {
      project_id: "project-1",
      direction: "in",
      entry_type: "project_payment",
      cost_category_id: "category-1",
      unallocated_only: "true",
    });

    expect(href).toBe(
      "/finance/ledger?page=3&project_id=project-1&direction=in&entry_type=project_payment&cost_category_id=category-1&unallocated_only=true",
    );
  });
});
