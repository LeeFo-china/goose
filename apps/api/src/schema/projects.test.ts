import { describe, expect, test } from "bun:test";
import { ProjectListQuerySchema } from "./projects";

const CUSTOMER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("ProjectListQuerySchema customer filter", () => {
  test("preserves a valid customer_id", () => {
    expect(ProjectListQuerySchema.parse({ customer_id: CUSTOMER_ID }))
      .toMatchObject({
        customer_id: CUSTOMER_ID,
        page: 1,
        pageSize: 20,
      });
  });

  test("rejects an invalid customer_id", () => {
    expect(
      ProjectListQuerySchema.safeParse({ customer_id: "customer-a" }).success,
    ).toBe(false);
  });
});
