import { ocrRecognitionRepository } from "@/repositories/ocr-recognitions";

type CleanupRepository = Pick<
  typeof ocrRecognitionRepository,
  "expireResultsBefore"
>;

type CleanupRunInput = {
  argv: string[];
  now?: Date;
  repository?: CleanupRepository;
  write?: (line: string) => void;
};

const BATCH_LIMIT = 500;
const MAX_APPLY_BATCHES = 20;

export async function runOcrResultCleanup(input: CleanupRunInput) {
  const apply = input.argv.includes("--apply");
  const now = input.now ?? new Date();
  const repository = input.repository ?? ocrRecognitionRepository;
  let candidateCount = 0;
  let expiredCount = 0;
  let oldestExpiresAt: string | null = null;
  let latestBatchCount = 0;
  let batchCount = 0;

  for (let batch = 0; batch < (apply ? MAX_APPLY_BATCHES : 1); batch += 1) {
    const result = await repository.expireResultsBefore({
      before: now.toISOString(),
      limit: BATCH_LIMIT,
      apply,
    });
    batchCount += 1;
    candidateCount += result.candidateCount;
    expiredCount += result.expiredCount;
    oldestExpiresAt ??= result.oldestExpiresAt;
    latestBatchCount = result.candidateCount;
    if (!apply || result.candidateCount < BATCH_LIMIT) break;
  }

  let batchLimitReached = latestBatchCount === BATCH_LIMIT;
  if (apply && batchCount === MAX_APPLY_BATCHES && batchLimitReached) {
    const backlogProbe = await repository.expireResultsBefore({
      before: now.toISOString(),
      limit: BATCH_LIMIT,
      apply: false,
    });
    batchLimitReached = backlogProbe.candidateCount > 0;
  }

  const output = {
    generated_at: new Date().toISOString(),
    mode: apply ? "apply" as const : "dry-run" as const,
    rule: "status IN (processing,succeeded) AND expires_at<=now",
    candidate_count: candidateCount,
    expired_count: expiredCount,
    oldest_expires_at: oldestExpiresAt,
    batch_limit: BATCH_LIMIT,
    batch_count: batchCount,
    max_apply_batches: MAX_APPLY_BATCHES,
    batch_limit_reached: batchLimitReached,
    ciphertext_clear_enabled: apply,
    redacted_audit_preserved: true,
  };
  (input.write ?? console.log)(JSON.stringify(output));
  return output;
}

async function main() {
  await runOcrResultCleanup({ argv: Bun.argv.slice(2) });
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "OCR识别结果清理失败");
    process.exit(1);
  });
}
