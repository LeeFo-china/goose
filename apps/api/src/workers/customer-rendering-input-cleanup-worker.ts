import { CustomerRenderingInputStorage, type CustomerInputStoragePort } from '@/gateways/customer-rendering-input-storage/client';
import { loadRenderingStorageConfig } from '@/gateways/rendering-library-storage/client';
import { CustomerRenderingInputsRepository, type CustomerRenderingInputsRepositoryPort } from '@/repositories/customer-rendering-inputs';
import { systemSettingsService } from '@/services/system-settings';

interface Dependencies {
  repository: Pick<CustomerRenderingInputsRepositoryPort, 'listRawCleanupDue' | 'claimRawCleanup' | 'markRawDeleted'>;
  storage: Pick<CustomerInputStoragePort, 'removeRaw'>;
  now?: () => string;
}
interface CleanupSummary { scanned: number; claimed: number; deleted: number; failed: number; lost: number }
const BATCH_SIZE = 100;
const CLEANUP_LEASE_MS = 5 * 60_000;

/** One indexed, bounded batch. Never drain the ledger in an unbounded loop. */
export async function cleanupCustomerRenderingInputs(dependencies: Dependencies, apply = true): Promise<CleanupSummary> {
  const { repository, storage } = dependencies;
  const now = dependencies.now ?? (() => new Date().toISOString());
  const rows = await repository.listRawCleanupDue(now(), BATCH_SIZE);
  const summary: CleanupSummary = { scanned: rows.length, claimed: 0, deleted: 0, failed: 0, lost: 0 };
  if (!apply) return summary;
  for (const row of rows) {
    try {
      const claimedAt = now();
      const claimedDue = new Date(Date.parse(claimedAt) + CLEANUP_LEASE_MS).toISOString();
      // Repository atomically fences due + status, closes expired uploads and protects live processing.
      if (!await repository.claimRawCleanup({ tenantId: row.tenant_id, id: row.id,
        previousDue: row.raw_cleanup_after, nextDue: claimedDue, status: row.status, now: claimedAt })) continue;
      summary.claimed++;
      await storage.removeRaw(row.tenant_id, row.id, {
        bucket: row.bucket, region: row.region, object_key: row.raw_object_key,
      });
      if (await repository.markRawDeleted(row.tenant_id, row.id, claimedDue, now())) summary.deleted++;
      else summary.lost++;
    } catch {
      // Keep raw_deleted_at null for a later retry. Never log upstream errors or private row data.
      summary.failed++;
    }
  }
  return summary;
}

function createDependencies(): Dependencies {
  return { repository: new CustomerRenderingInputsRepository(),
    storage: new CustomerRenderingInputStorage({ loadConfig: () => loadRenderingStorageConfig(systemSettingsService) }) };
}

/** Separate child failure boundary; returned metadata contains counters only. */
export async function runCustomerRenderingInputCleanupTick(
  options: { enabled: boolean; apply: boolean },
  create: () => Dependencies = createDependencies,
): Promise<CleanupSummary | { failed: number } | null> {
  if (!options.enabled) return null;
  try { return await cleanupCustomerRenderingInputs(create(), options.apply); }
  catch { return { failed: 1 }; }
}
