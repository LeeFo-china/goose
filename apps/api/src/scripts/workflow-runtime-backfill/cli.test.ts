import { describe, expect, test } from "bun:test";
import { parseBackfillArgs } from "./cli";

describe("parseBackfillArgs", () => {
  test("parses optional subject type filter", () => {
    expect(parseBackfillArgs([
      "--tenant-id",
      "tenant-1",
      "--dry-run",
      "--subject-type",
      "customer",
    ])).toMatchObject({
      tenantId: "tenant-1",
      apply: false,
      subjectType: "customer",
    });
  });

  test("rejects unsupported subject type filter", () => {
    expect(() =>
      parseBackfillArgs([
        "--tenant-id",
        "tenant-1",
        "--dry-run",
        "--subject-type",
        "unknown",
      ])
    ).toThrow("无效的 subject type");
  });
});
