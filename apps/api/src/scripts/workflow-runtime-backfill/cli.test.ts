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

  test("parses and canonicalizes a customer audit cutoff", () => {
    expect(parseBackfillArgs([
      "--tenant-id",
      "3eebca47-961f-4899-b976-a3d3208d326b",
      "--subject-type",
      "customer",
      "--dry-run",
      "--created-before",
      "2026-10-01T02:03:04.000Z",
    ])).toMatchObject({
      apply: false,
      subjectType: "customer",
      createdBefore: "2026-10-01T02:03:04.000Z",
    });
  });

  test("rejects an invalid customer audit cutoff", () => {
    expect(() =>
      parseBackfillArgs([
        "--tenant-id",
        "tenant-1",
        "--subject-type",
        "customer",
        "--dry-run",
        "--created-before",
        "not-a-date",
      ])
    ).toThrow("无效的 created-before");
  });

  test("rejects a cutoff for non-customer subjects", () => {
    expect(() =>
      parseBackfillArgs([
        "--tenant-id",
        "tenant-1",
        "--subject-type",
        "project",
        "--dry-run",
        "--created-before",
        "2026-10-01T02:03:04.000Z",
      ])
    ).toThrow("created-before 仅支持 customer");
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
