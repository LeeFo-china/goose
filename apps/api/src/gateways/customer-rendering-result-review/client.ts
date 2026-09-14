import COS from 'cos-nodejs-sdk-v5';
import { z } from 'zod';
import { Errors } from '@/errors/error-factory';
import { loadRenderingStorageConfig, type RenderingStorageConfig,
  type RenderingStorageLocation } from '@/gateways/rendering-library-storage/client';
import { systemSettingsService } from '@/services/system-settings';

export type ResultReviewDecision = 'approved' | 'rejected' | 'manual';
export interface ResultReviewOutcome {
  decision: ResultReviewDecision;
  providerRequestId: string | null;
  rawResult: number | null;
}
export interface CustomerRenderingResultReviewerPort {
  review(tenantId: string, jobId: string, attemptId: string,
    location: RenderingStorageLocation): Promise<ResultReviewOutcome>;
}

type ReviewCos = { request(params: COS.RequestParams): Promise<COS.RequestResult> };
const Id = z.uuid();
const Bucket = z.string().max(63).regex(/^[a-z0-9][a-z0-9-]*-\d+$/);
const Region = z.string().max(63).regex(/^[a-z]+(?:-[a-z0-9]+)+$/);
const Config = z.object({ bucket: Bucket, region: Region,
  secretId: z.string().trim().min(1), secretKey: z.string().trim().min(1) });
const Location = z.strictObject({ bucket: Bucket, region: Region, object_key: z.string() });
const Success = z.object({ statusCode: z.literal(200) });
const RawVerdict = z.object({ RecognitionResult: z.object({ Result: z.unknown() }) });
const Verdict = z.object({ RecognitionResult: z.object({
  Result: z.union([z.literal(0), z.literal(1), z.literal(2),
    z.literal('0'), z.literal('1'), z.literal('2')]),
}) });

function unavailable(): never {
  throw Errors.business(503, '客户生图结果审核暂不可用', 'RENDERING_RESULT_REVIEW_UNAVAILABLE');
}

function providerRequestId(response: COS.RequestResult): string | null {
  const candidate: unknown = response.RequestId ?? response.headers?.['x-ci-request-id']
    ?? response.headers?.['x-cos-request-id'];
  return typeof candidate === 'string' && /^[A-Za-z0-9._~+=:/-]{1,256}$/.test(candidate)
    ? candidate : null;
}

function rawResult(response: unknown): number | null {
  const parsed = RawVerdict.safeParse(response);
  if (!parsed.success) return null;
  const value = parsed.data.RecognitionResult.Result;
  if (typeof value === 'number') return Number.isSafeInteger(value) ? value : null;
  if (typeof value === 'string' && /^(?:0|-?[1-9]\d*)$/.test(value)) {
    const numeric = Number(value);
    return Number.isSafeInteger(numeric) ? numeric : null;
  }
  return null;
}

export class CustomerRenderingResultReviewer implements CustomerRenderingResultReviewerPort {
  constructor(private readonly dependencies: {
    loadConfig?: () => Promise<RenderingStorageConfig>;
    createCos?: (options: COS.COSOptions) => ReviewCos;
  } = {}) {}

  async review(tenantId: string, jobId: string, attemptId: string,
    location: RenderingStorageLocation): Promise<ResultReviewOutcome> {
    const validIds = [tenantId, jobId, attemptId].every((id) => Id.safeParse(id).success);
    const expectedKey = `private/customer-rendering-results/${tenantId}/${jobId}/${attemptId}/result.webp`;
    if (!validIds || !Location.safeParse(location).success || location.object_key !== expectedKey) {
      throw Errors.badRequest('审核对象无效');
    }

    let config: RenderingStorageConfig;
    try {
      const loaded = await (this.dependencies.loadConfig ??
        (() => loadRenderingStorageConfig(systemSettingsService)))();
      const parsed = Config.safeParse(loaded);
      if (!parsed.success) return unavailable();
      config = loaded;
    } catch { return unavailable(); }

    let response: COS.RequestResult;
    try {
      const cos = (this.dependencies.createCos ?? ((options) => new COS(options)))({
        SecretId: config.secretId, SecretKey: config.secretKey,
        Protocol: 'https:', Timeout: 30_000, FollowRedirect: false,
      });
      response = await cos.request({ Bucket: location.bucket, Region: location.region,
        Method: 'GET', Key: location.object_key,
        Query: { 'ci-process': 'sensitive-content-recognition', 'large-image-detect': '1' },
      });
    } catch { return unavailable(); }

    if (!Success.safeParse(response).success) return unavailable();
    const parsed = Verdict.safeParse(response);
    const verdict = parsed.success ? Number(parsed.data.RecognitionResult.Result) : null;
    return { decision: verdict === 0 ? 'approved' : verdict === 1 ? 'rejected' : 'manual',
      providerRequestId: providerRequestId(response), rawResult: rawResult(response) };
  }
}
