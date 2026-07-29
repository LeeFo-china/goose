import { describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const cleanupModulePromise = import("./ocr-result-cleanup");

describe("OCR result cleanup", () => {
  test("expires processing, succeeded and failed rows without clearing audit fields", async () => {
    const source = await Bun.file(new URL(
      "../repositories/ocr-recognitions.ts",
      import.meta.url,
    )).text();
    const visitorLifecycleFilters = source.match(
      /\.in\("status", \["processing", "succeeded", "failed"\]\)/g,
    ) ?? [];
    const update = source.match(
      /\.update\(\{\s*status: "expired",\s*result_ciphertext: null,\s*\}\)/,
    );

    expect(visitorLifecycleFilters).toHaveLength(2);
    expect(update?.[0]).not.toContain("result_summary");
    expect(update?.[0]).not.toContain("provider_request_id");
    expect(update?.[0]).not.toContain("billable_units");
  });

  test("defaults to a bounded dry-run", async () => {
    const { runOcrResultCleanup } = await cleanupModulePromise;
    const expireResultsBefore = mock(async () => ({
      candidateCount: 2,
      expiredCount: 0,
      oldestExpiresAt: "2026-07-20T00:00:00.000Z",
    }));
    const write = mock(() => undefined);

    const result = await runOcrResultCleanup({
      argv: [],
      now: new Date("2026-07-22T10:00:00.000Z"),
      repository: { expireResultsBefore },
      write,
    });

    expect(expireResultsBefore).toHaveBeenCalledWith({
      before: "2026-07-22T10:00:00.000Z",
      limit: 500,
      apply: false,
    });
    expect(result).toMatchObject({
      mode: "dry-run",
      rule: "status IN (processing,succeeded,failed) AND expires_at<=now",
      candidate_count: 2,
      expired_count: 0,
      oldest_expires_at: "2026-07-20T00:00:00.000Z",
      batch_limit_reached: false,
    });
  });

  test("drains multiple bounded batches during one explicit apply run", async () => {
    const { runOcrResultCleanup } = await cleanupModulePromise;
    let callCount = 0;
    const expireResultsBefore = mock(async () => {
      callCount += 1;
      return callCount === 1
        ? {
          candidateCount: 500,
          expiredCount: 500,
          oldestExpiresAt: "2026-07-01T00:00:00.000Z",
        }
        : {
          candidateCount: 4,
          expiredCount: 4,
          oldestExpiresAt: "2026-07-02T00:00:00.000Z",
        };
    });

    const result = await runOcrResultCleanup({
      argv: ["--apply"],
      now: new Date("2026-07-22T10:00:00.000Z"),
      repository: { expireResultsBefore },
      write: mock(() => undefined),
    });

    expect(expireResultsBefore).toHaveBeenCalledTimes(2);
    expect(expireResultsBefore).toHaveBeenCalledWith(expect.objectContaining({
      apply: true,
      limit: 500,
    }));
    expect(result).toMatchObject({
      mode: "apply",
      candidate_count: 504,
      expired_count: 504,
      batch_count: 2,
      batch_limit_reached: false,
    });
  });

  test("caps one apply run and reports an unresolved backlog", async () => {
    const { runOcrResultCleanup } = await cleanupModulePromise;
    const expireResultsBefore = mock(async () => ({
      candidateCount: 500,
      expiredCount: 500,
      oldestExpiresAt: "2026-07-01T00:00:00.000Z",
    }));

    const result = await runOcrResultCleanup({
      argv: ["--apply"],
      now: new Date("2026-07-22T10:00:00.000Z"),
      repository: { expireResultsBefore },
      write: mock(() => undefined),
    });

    expect(expireResultsBefore).toHaveBeenCalledTimes(21);
    expect(result).toMatchObject({
      candidate_count: 10_000,
      expired_count: 10_000,
      batch_count: 20,
      batch_limit_reached: true,
    });
  });

  test("does not report backlog when the twentieth apply batch drains it", async () => {
    const { runOcrResultCleanup } = await cleanupModulePromise;
    let callCount = 0;
    const expireResultsBefore = mock(async (input: { apply: boolean }) => {
      callCount += 1;
      if (input.apply) {
        return {
          candidateCount: 500,
          expiredCount: 500,
          oldestExpiresAt: "2026-07-01T00:00:00.000Z",
        };
      }
      return {
        candidateCount: 0,
        expiredCount: 0,
        oldestExpiresAt: null,
      };
    });

    const result = await runOcrResultCleanup({
      argv: ["--apply"],
      now: new Date("2026-07-22T10:00:00.000Z"),
      repository: { expireResultsBefore },
      write: mock(() => undefined),
    });

    expect(expireResultsBefore).toHaveBeenCalledTimes(21);
    expect(result).toMatchObject({
      candidate_count: 10_000,
      expired_count: 10_000,
      batch_count: 20,
      batch_limit_reached: false,
    });
  });
});
