import { CustomerRenderingInputReviewer, type CustomerInputReviewerPort } from '@/gateways/customer-rendering-input-review/client';
import { CustomerRenderingInputsRepository, type CustomerRenderingInputsRepositoryPort } from '@/repositories/customer-rendering-inputs';

type Repository = Pick<CustomerRenderingInputsRepositoryPort, 'listReviewDue' | 'claimReview' | 'markReviewed'>;
interface Dependencies { repository: Repository; reviewer: CustomerInputReviewerPort; now?: () => string }
interface Summary { scanned: number; claimed: number; approved: number; rejected: number; manual: number; failed: number }
const REVIEW_LEASE_MS = 5 * 60_000;

/** One bounded batch. Unknown provider outcomes never approve a private image. */
export async function reviewCustomerRenderingInputs(dependencies: Dependencies): Promise<Summary> {
  const now = dependencies.now ?? (() => new Date().toISOString());
  const rows = await dependencies.repository.listReviewDue(now(), 25);
  const summary: Summary = { scanned: rows.length, claimed: 0, approved: 0, rejected: 0, manual: 0, failed: 0 };
  for (const row of rows) {
    if (!row.review_due_at || !row.normalized_object_key) continue;
    if (row.review_attempts >= 3) {
      if (await dependencies.repository.markReviewed(row.tenant_id, row.id, row.review_due_at, 'manual')) summary.manual++;
      continue;
    }
    const claimedAt = now();
    const claimedDue = new Date(Date.parse(claimedAt) + REVIEW_LEASE_MS * (2 ** row.review_attempts)).toISOString();
    try {
      if (!await dependencies.repository.claimReview(row.tenant_id, row.id,
        row.review_due_at, claimedDue, row.review_attempts, claimedAt)) continue;
      summary.claimed++;
      const decision = await dependencies.reviewer.review(row.tenant_id, row.id, {
        bucket: row.bucket, region: row.region, object_key: row.normalized_object_key,
      });
      if (await dependencies.repository.markReviewed(row.tenant_id, row.id, claimedDue, decision)) summary[decision]++;
      else summary.failed++;
    } catch {
      // A transient failure retries after the claim lease; the third failure requires manual handling.
      if (row.review_attempts === 2
        && await dependencies.repository.markReviewed(row.tenant_id, row.id, claimedDue, 'manual')) summary.manual++;
      else summary.failed++;
    }
  }
  return summary;
}

async function main(): Promise<void> {
  let stopping = false;
  process.on('SIGINT', () => { stopping = true; });
  process.on('SIGTERM', () => { stopping = true; });
  const enabled = process.env.CUSTOMER_RENDERING_INPUT_REVIEW_ENABLED === 'true';
  if (!enabled) {
    process.stdout.write('customer rendering input review disabled\n');
  } else {
    const dependencies = { repository: new CustomerRenderingInputsRepository(), reviewer: new CustomerRenderingInputReviewer() };
    while (!stopping) {
      try {
        const summary = await reviewCustomerRenderingInputs(dependencies);
        process.stdout.write(`${JSON.stringify(summary)}\n`);
      } catch {
        process.stderr.write('customer rendering input review tick failed\n');
      }
      if (!stopping) await Bun.sleep(60_000);
    }
  }
}

if (import.meta.main) void main();
