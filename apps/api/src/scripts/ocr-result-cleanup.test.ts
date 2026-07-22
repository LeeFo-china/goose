import { describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const cleanupModulePromise = import("./ocr-result-cleanup");

describe("OCR result cleanup", () => {
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
      candidate_count: 2,
      expired_count: 0,
      oldest_expires_at: "2026-07-20T00:00:00.000Z",
      batch_limit_reached: false,
    });
  });

  test("applies cleanup only with the explicit flag", async () => {
    const { runOcrResultCleanup } = await cleanupModulePromise;
    const expireResultsBefore = mock(async () => ({
      candidateCount: 500,
      expiredCount: 498,
      oldestExpiresAt: "2026-07-01T00:00:00.000Z",
    }));

    const result = await runOcrResultCleanup({
      argv: ["--apply"],
      now: new Date("2026-07-22T10:00:00.000Z"),
      repository: { expireResultsBefore },
      write: mock(() => undefined),
    });

    expect(expireResultsBefore).toHaveBeenCalledWith(expect.objectContaining({
      apply: true,
      limit: 500,
    }));
    expect(result).toMatchObject({
      mode: "apply",
      candidate_count: 500,
      expired_count: 498,
      batch_limit_reached: true,
    });
  });
});
