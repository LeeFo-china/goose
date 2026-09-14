import { downloadArkRenderingResult, generateArkRendering,
  type ArkGatewayConfig, type ArkRenderingInput } from '@/gateways/ark-rendering';
import { getArkGatewayOutcome } from '@/gateways/ark-rendering/errors';
import { arkEndpoint, buildArkRenderingRequest } from '@/gateways/ark-rendering/requests';
import { CustomerRenderingInputStorage,
  type CustomerInputNormalizedReadPort } from '@/gateways/customer-rendering-input-storage/client';
import { CustomerRenderingResultStorage,
  type CustomerRenderingResultStoragePort } from '@/gateways/customer-rendering-result-storage/client';
import { customerRenderingStyleReferenceUrl } from '@/gateways/customer-rendering-style-reference/url';
import { loadRenderingStorageConfig } from '@/gateways/rendering-library-storage/client';
import { AppError } from '@/errors/app-error';
import { Errors } from '@/errors/error-factory';
import { CustomerRenderingJobWorkerRepository,
  type ClaimedCustomerRenderingJob, type CustomerRenderingJobWorkerRepositoryPort } from '@/repositories/customer-rendering-job-worker';
import { aiGateway } from '@/services/ai-gateway';
import type { AiGatewayResolvedImageConfig } from '@/services/ai-gateway-types';
import { normalizeRenderingSource } from '@/services/rendering-library-files/image';
import { systemSettingsService } from '@/services/system-settings';

const SCENE_CODE = 'decoration_raw_drawing';
const INTERVAL_MS = 60_000;
// The paid 2K pilot completed in about 94 seconds; give Ark the full supported route timeout.
const MIN_ARK_RENDERING_TIMEOUT_MS = 300_000;
const EXPLICIT_REJECTION_STATUSES = new Set([400, 401, 403, 404, 405, 413, 415, 422, 429]);

interface PreparedJob { config: ArkGatewayConfig; input: ArkRenderingInput; modelCode: string }
export interface CustomerRenderingJobWorkerDependencies {
  repository: CustomerRenderingJobWorkerRepositoryPort;
  prepare(claim: ClaimedCustomerRenderingJob): Promise<PreparedJob>;
  generate: typeof generateArkRendering;
  download: typeof downloadArkRenderingResult;
  normalize: typeof normalizeRenderingSource;
  storage: Pick<CustomerRenderingResultStoragePort, 'location' | 'put'>;
}
type JobOutcome = 'approved' | 'failed' | 'providerRejected' | 'reviewRequired' | 'lost';
interface TickSummary {
  reconciled: number; claimed: number; approved: number; failed: number;
  providerRejected: number; reviewRequired: number; lost: number;
}

export function isCustomerRenderingJobWorkerEnabled(env: Record<string, string | undefined>): boolean {
  return env.CUSTOMER_RENDERING_JOB_WORKER_ENABLED === 'true';
}

/** Construct one provider request from immutable claim facts, never client-supplied URLs. */
export async function prepareCustomerRenderingJob(claim: ClaimedCustomerRenderingJob, helpers: {
  resolveImageConfig(): Promise<AiGatewayResolvedImageConfig>;
  signRoom: CustomerInputNormalizedReadPort['signNormalizedRead'];
}): Promise<PreparedJob> {
  const resolved = await helpers.resolveImageConfig();
  const roomImageUrl = await helpers.signRoom(claim.tenant_id, claim.room.file_id, {
    bucket: claim.room.bucket, region: claim.room.region, object_key: claim.room.object_key,
  });
  const referenceImageUrl = customerRenderingStyleReferenceUrl(claim.tenant_id,
    claim.style_asset_id, claim.style_snapshot);
  const prompt = [
    '保留原房间结构、门窗位置、空间尺度和拍摄视角；参考第二张图的装修风格，不添加文字或品牌标识。',
    `空间：${claim.space}；模式：${claim.mode}；风格：${claim.style_snapshot.style}。`,
    `配色：${claim.style_snapshot.color_notes}；材料：${claim.style_snapshot.material_notes}。`,
    claim.keep_notes ? `客户保留要求：${claim.keep_notes}` : '',
  ].filter(Boolean).join('\n');
  return { config: { baseUrl: resolved.baseUrl, apiKey: resolved.apiKey,
    model: resolved.modelName, timeoutMs: resolved.timeoutMs },
  modelCode: resolved.modelCode,
  input: { roomImageUrl, referenceImageUrl, prompt, size: '2K' } };
}

async function requireReview(dependencies: CustomerRenderingJobWorkerDependencies,
  claim: ClaimedCustomerRenderingJob, failureCode: string): Promise<JobOutcome> {
  const result = await dependencies.repository.markReviewRequired(claim.job_id, claim.attempt_id, failureCode);
  if (result === 'invalid_request') throw Errors.dbError('客户生图任务转人工审核失败');
  return result === 'review_required' ? 'reviewRequired' : 'lost';
}

async function finalize(dependencies: CustomerRenderingJobWorkerDependencies, claim: ClaimedCustomerRenderingJob,
  outcome: 'approved' | 'failed' | 'provider_rejected', failureCode: string | null): Promise<JobOutcome> {
  const result = await dependencies.repository.finalize(claim.job_id, claim.attempt_id, outcome, failureCode);
  if (result.decision === 'finalized') {
    return outcome === 'approved' ? 'approved' : outcome === 'failed' ? 'failed' : 'providerRejected';
  }
  if (result.decision === 'stale') return 'lost';
  return requireReview(dependencies, claim, 'WORKER_SETTLEMENT_INVALID');
}

function explicitProviderRejection(error: unknown): boolean {
  if (getArkGatewayOutcome(error) !== 'rejected' || !(error instanceof AppError)
    || !error.details || typeof error.details !== 'object') return false;
  if (contentPolicyRefusal(error)) return true;
  const status = 'upstreamStatus' in error.details ? error.details.upstreamStatus : undefined;
  return typeof status === 'number' && EXPLICIT_REJECTION_STATUSES.has(status);
}

function contentPolicyRefusal(error: AppError): boolean {
  const details = error.details;
  const code = details && typeof details === 'object' && 'upstreamCode' in details
    ? details.upstreamCode : undefined;
  return typeof code === 'string' && /^ContentPolicyViolation(?:\.|$)/.test(code);
}

async function processClaim(dependencies: CustomerRenderingJobWorkerDependencies,
  claim: ClaimedCustomerRenderingJob): Promise<JobOutcome> {
  let prepared: PreparedJob;
  let resultLocation: Awaited<ReturnType<CustomerRenderingResultStoragePort['location']>>;
  try {
    [prepared, resultLocation] = await Promise.all([
      dependencies.prepare(claim),
      dependencies.storage.location(claim.tenant_id, claim.job_id, claim.attempt_id),
    ]);
    arkEndpoint(prepared.config, '/images/generations');
    buildArkRenderingRequest(prepared.config, prepared.input);
    if (prepared.config.timeoutMs < MIN_ARK_RENDERING_TIMEOUT_MS) {
      throw Errors.business(503, '客户生图模型超时配置过短', 'RENDERING_MODEL_TIMEOUT_UNSAFE');
    }
    if (!prepared.modelCode.trim() || prepared.modelCode.length > 120) {
      throw Errors.badRequest('客户生图模型配置无效');
    }
  } catch (error) {
    const failureCode = error instanceof AppError && error.code === 'RENDERING_MODEL_TIMEOUT_UNSAFE'
      ? error.code : 'WORKER_PREFLIGHT_UNAVAILABLE';
    try { return await finalize(dependencies, claim, 'failed', failureCode); }
    catch { return requireReview(dependencies, claim, 'WORKER_PREFLIGHT_SETTLEMENT_UNAVAILABLE'); }
  }

  let submitted: Awaited<ReturnType<CustomerRenderingJobWorkerRepositoryPort['markSubmitted']>>;
  try { submitted = await dependencies.repository.markSubmitted(claim.job_id, claim.attempt_id, prepared.modelCode); }
  catch { return requireReview(dependencies, claim, 'WORKER_SUBMISSION_INTENT_UNAVAILABLE'); }
  if (submitted === 'stale') return 'lost';
  if (submitted !== 'submitted') return requireReview(dependencies, claim, 'WORKER_SUBMISSION_INTENT_INVALID');

  let provider: Awaited<ReturnType<typeof generateArkRendering>>;
  try { provider = await dependencies.generate(prepared.config, prepared.input); }
  catch (error) {
    if (explicitProviderRejection(error)) {
      try { return await finalize(dependencies, claim, 'provider_rejected',
        error instanceof AppError && contentPolicyRefusal(error) ? 'ARK_CONTENT_REJECTED' : 'ARK_UPSTREAM_REJECTED'); }
      catch { return requireReview(dependencies, claim, 'WORKER_SETTLEMENT_UNAVAILABLE'); }
    }
    return requireReview(dependencies, claim, 'ARK_SUBMISSION_UNKNOWN');
  }

  let stored: Awaited<ReturnType<CustomerRenderingResultStoragePort['put']>>;
  try {
    const downloaded = await dependencies.download(provider.imageUrl);
    const normalized = await dependencies.normalize(downloaded);
    stored = await dependencies.storage.put(claim.tenant_id, claim.job_id, claim.attempt_id,
      resultLocation, normalized.bytes);
  } catch { return requireReview(dependencies, claim, 'WORKER_RESULT_UNAVAILABLE'); }

  let resultRecorded: Awaited<ReturnType<CustomerRenderingJobWorkerRepositoryPort['recordResult']>>;
  try {
    resultRecorded = await dependencies.repository.recordResult(claim.job_id, claim.attempt_id, {
      location: stored.location, sizeBytes: stored.sizeBytes, sha256: stored.sha256,
      providerRequestId: provider.requestId ?? null,
    });
  } catch { return requireReview(dependencies, claim, 'WORKER_RESULT_RECORD_UNAVAILABLE'); }
  if (resultRecorded === 'stale') return 'lost';
  if (resultRecorded !== 'recorded') return requireReview(dependencies, claim, 'WORKER_RESULT_RECORD_INVALID');

  // Ark returned one image and the private result is durably recorded. The account's
  // standard Ark guardrail is the content gate; no separate COS CI verdict exists.
  try { return await finalize(dependencies, claim, 'approved', null); }
  catch { return requireReview(dependencies, claim, 'WORKER_SETTLEMENT_UNAVAILABLE'); }
}

/** One bounded claim per tick. A submitted attempt is never automatically claimed again. */
export async function runCustomerRenderingJobTick(dependencies: CustomerRenderingJobWorkerDependencies,
  enabled: boolean): Promise<TickSummary | { disabled: true }> {
  if (!enabled) return { disabled: true };
  const summary: TickSummary = { reconciled: await dependencies.repository.reconcileExpired(),
    claimed: 0, approved: 0, failed: 0, providerRejected: 0, reviewRequired: 0, lost: 0 };
  const claim = await dependencies.repository.claim();
  if (claim.decision === 'empty') return summary;
  if (claim.decision !== 'claimed') throw Errors.dbError('客户生图任务领取响应无效');
  summary.claimed = 1;
  summary[await processClaim(dependencies, claim)]++;
  return summary;
}

function createDependencies(): CustomerRenderingJobWorkerDependencies {
  const loadConfig = () => loadRenderingStorageConfig(systemSettingsService);
  const inputStorage = new CustomerRenderingInputStorage({ loadConfig });
  return { repository: new CustomerRenderingJobWorkerRepository(),
    prepare: (claim) => prepareCustomerRenderingJob(claim, {
      resolveImageConfig: () => aiGateway.resolveImageConfig({ sceneCode: SCENE_CODE }),
      signRoom: inputStorage.signNormalizedRead.bind(inputStorage),
    }),
    generate: generateArkRendering, download: downloadArkRenderingResult,
    normalize: normalizeRenderingSource,
    storage: new CustomerRenderingResultStorage({ loadConfig }),
  };
}

async function main(): Promise<void> {
  let stopping = false;
  process.on('SIGINT', () => { stopping = true; });
  process.on('SIGTERM', () => { stopping = true; });
  const enabled = isCustomerRenderingJobWorkerEnabled(process.env);
  if (!enabled) {
    process.stdout.write('customer rendering job worker disabled\n');
    return;
  }
  const dependencies = createDependencies();
  while (!stopping) {
    try { process.stdout.write(`${JSON.stringify(await runCustomerRenderingJobTick(dependencies, true))}\n`); }
    catch { process.stderr.write('customer rendering job worker tick failed\n'); }
    if (!stopping) await Bun.sleep(INTERVAL_MS);
  }
}

if (import.meta.main) void main();
