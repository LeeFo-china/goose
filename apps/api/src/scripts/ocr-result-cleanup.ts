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

export async function runOcrResultCleanup(input: CleanupRunInput) {
  const apply = input.argv.includes("--apply");
  const now = input.now ?? new Date();
  const result = await (input.repository ?? ocrRecognitionRepository)
    .expireResultsBefore({
      before: now.toISOString(),
      limit: BATCH_LIMIT,
      apply,
    });
  const output = {
    generated_at: new Date().toISOString(),
    mode: apply ? "apply" as const : "dry-run" as const,
    rule: "status=succeeded AND expires_at<=now",
    candidate_count: result.candidateCount,
    expired_count: result.expiredCount,
    oldest_expires_at: result.oldestExpiresAt,
    batch_limit: BATCH_LIMIT,
    batch_limit_reached: result.candidateCount === BATCH_LIMIT,
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
