import COS from 'cos-nodejs-sdk-v5';
import { z } from 'zod';
import { Errors } from '@/errors/error-factory';
import { loadRenderingStorageConfig, type RenderingStorageConfig, type RenderingStorageLocation } from '@/gateways/rendering-library-storage/client';
import { systemSettingsService } from '@/services/system-settings';

export type InputReviewDecision = 'approved' | 'rejected' | 'manual';
export interface CustomerInputReviewerPort {
  review(tenantId: string, fileId: string, location: RenderingStorageLocation): Promise<InputReviewDecision>;
}

const Success = z.object({ statusCode: z.literal(200) });
const Bucket = z.string().max(63).regex(/^[a-z0-9][a-z0-9-]*-\d+$/);
const Region = z.string().max(63).regex(/^[a-z]+(?:-[a-z0-9]+)+$/);
const Result = z.object({ RecognitionResult: z.object({
  Result: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal('0'), z.literal('1'), z.literal('2')]),
}) });
type ReviewCos = { request(params: COS.RequestParams): Promise<COS.RequestResult> };

export class CustomerRenderingInputReviewer implements CustomerInputReviewerPort {
  constructor(private readonly dependencies: {
    loadConfig?: () => Promise<RenderingStorageConfig>;
    createCos?: (options: COS.COSOptions) => ReviewCos;
  } = {}) {}

  async review(tenantId: string, fileId: string, location: RenderingStorageLocation): Promise<InputReviewDecision> {
    const expectedKey = `private/customer-rendering-inputs/${tenantId}/${fileId}/normalized.webp`;
    if (!z.uuid().safeParse(tenantId).success || !z.uuid().safeParse(fileId).success
      || !Bucket.safeParse(location.bucket).success || !Region.safeParse(location.region).success
      || location.object_key !== expectedKey) throw Errors.badRequest('审核对象无效');
    const config = await (this.dependencies.loadConfig ?? (() => loadRenderingStorageConfig(systemSettingsService)))();
    const cos = (this.dependencies.createCos ?? ((options) => new COS(options)))({
      SecretId: config.secretId, SecretKey: config.secretKey,
      Protocol: 'https:', Timeout: 30000, FollowRedirect: false,
    });
    let response: unknown;
    try {
      response = await cos.request({ Bucket: location.bucket, Region: location.region,
        Method: 'GET', Key: location.object_key,
        Query: { 'ci-process': 'sensitive-content-recognition', 'large-image-detect': '1' },
      });
    } catch {
      throw Errors.business(503, '输入审核服务暂不可用', 'RENDERING_INPUT_REVIEW_UNAVAILABLE');
    }
    if (!Success.safeParse(response).success) {
      throw Errors.business(502, '输入审核响应无效', 'RENDERING_INPUT_REVIEW_INVALID');
    }
    const parsed = Result.safeParse(response);
    // A successful but unknown CI verdict is final manual review, never another paid audit.
    if (!parsed.success) return 'manual';
    const result = Number(parsed.data.RecognitionResult.Result);
    return result === 0 ? 'approved' : result === 1 ? 'rejected' : 'manual';
  }
}
