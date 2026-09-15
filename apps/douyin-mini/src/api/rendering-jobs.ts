import { normalizeMaterialUuid } from './material-uuid';
import { ApiClient, ApiRequestError } from './request';
import type { RenderingSpace } from './rendering-styles';

export type RenderingMode = 'soft_furnishing' | 'renovation';
export type RenderingJobStatus = 'queued' | 'processing' | 'succeeded' | 'failed' | 'review_required';
export type RenderingJobRequest = {
  style_asset_id: string;
  room_file_id: string;
  floor_plan_file_id?: string;
  space: RenderingSpace;
  mode: RenderingMode;
  keep_notes?: string;
  idempotency_key: string;
};
export type RenderingJobCreated = { jobId: string; status: RenderingJobStatus };
export type RenderingJobProgress = RenderingJobCreated & {
  result: { url: string; expiresAt: string; sizeBytes: number } | null;
  failureReason?: 'content_rejected' | 'provider_rejected' | null;
};

export async function fetchRenderingPhoneState(client: ApiClient): Promise<{
  phoneVerified: boolean; remaining: number;
}> {
  const value = await client.request<unknown>({ method: 'GET', path: '/douyin-mini/renderings/quota' });
  if (!isRecord(value) || typeof value.phone_verified !== 'boolean'
    || typeof value.session_phone_verified !== 'boolean'
    || !Number.isSafeInteger(value.remaining) || (value.remaining as number) < 0) throw invalidResponse();
  return { phoneVerified: value.session_phone_verified, remaining: value.remaining as number };
}

export async function authorizeRenderingPhone(client: ApiClient, code: string): Promise<{
  accessToken: string; expiresIn: number;
}> {
  if (!code.trim() || code.length > 512) throw new ApiRequestError(0, 'INVALID_DOUYIN_PHONE_CODE', '手机号授权无效');
  const value = await client.request<unknown>({ method: 'POST',
    path: '/douyin-mini/renderings/authorize-phone', data: { douyin_phone_code: code } });
  return parseVerifiedSession(value);
}

export async function sendRenderingSmsCode(client: ApiClient, phone: string): Promise<number> {
  const value = await client.request<unknown>({ method: 'POST',
    path: '/douyin-mini/customer-auth/sms/send-code', data: { phone } });
  if (!isRecord(value) || value.success !== true || !Number.isInteger(value.cooldown_seconds)
    || (value.cooldown_seconds as number) < 1) throw invalidResponse();
  return value.cooldown_seconds as number;
}

export async function verifyRenderingSms(client: ApiClient, input: { phone: string; code: string }): Promise<{
  accessToken: string; expiresIn: number;
}> {
  const value = await client.request<unknown>({ method: 'POST',
    path: '/douyin-mini/renderings/verify-sms', data: input });
  return parseVerifiedSession(value);
}

function parseVerifiedSession(value: unknown): { accessToken: string; expiresIn: number } {
  if (!isRecord(value) || typeof value.access_token !== 'string' || value.access_token.length < 20
    || !Number.isInteger(value.expires_in) || (value.expires_in as number) < 1
    || (value.expires_in as number) > 86400) throw invalidResponse();
  return { accessToken: value.access_token, expiresIn: value.expires_in as number };
}

const STATUSES: RenderingJobStatus[] = ['queued', 'processing', 'succeeded', 'failed', 'review_required'];

export async function createRenderingJob(client: ApiClient, input: RenderingJobRequest): Promise<RenderingJobCreated> {
  if (!normalizeMaterialUuid(input.style_asset_id) || !normalizeMaterialUuid(input.room_file_id)
    || (input.floor_plan_file_id !== undefined && !normalizeMaterialUuid(input.floor_plan_file_id))
    || !normalizeMaterialUuid(input.idempotency_key)
    || !(['living_room', 'bedroom'] as unknown[]).includes(input.space)
    || !(['soft_furnishing', 'renovation'] as unknown[]).includes(input.mode)
    || (input.keep_notes !== undefined && (input.keep_notes.length > 300 || input.keep_notes.trim() !== input.keep_notes))) {
    throw new ApiRequestError(0, 'INVALID_RENDERING_JOB', '生成任务参数无效');
  }
  const value = await client.request<unknown>({ method: 'POST', path: '/douyin-mini/renderings/jobs', data: input });
  if (!isRecord(value) || !normalizeMaterialUuid(value.job_id)
    || !STATUSES.includes(value.status as RenderingJobStatus)) throw invalidResponse();
  return { jobId: value.job_id as string, status: value.status as RenderingJobStatus };
}

export async function fetchRenderingJobStatus(client: ApiClient, id: string): Promise<RenderingJobProgress> {
  const normalizedId = normalizeMaterialUuid(id);
  if (!normalizedId) throw new ApiRequestError(0, 'INVALID_RENDERING_JOB', '生成任务编号无效');
  const value = await client.request<unknown>({ method: 'GET', path: `/douyin-mini/renderings/jobs/${normalizedId}` });
  if (!isRecord(value) || value.job_id !== normalizedId
    || !STATUSES.includes(value.status as RenderingJobStatus)
    || !validTimestamp(value.created_at) || !validTimestamp(value.updated_at)
    || !(value.finished_at === null || validTimestamp(value.finished_at))
    || !(value.failure_reason === null || value.failure_reason === 'content_rejected'
      || value.failure_reason === 'provider_rejected')) throw invalidResponse();
  const status = value.status as RenderingJobStatus;
  if (status !== 'failed' && value.failure_reason !== null) throw invalidResponse();
  if (status !== 'succeeded') {
    if (value.result !== null) throw invalidResponse();
    return { jobId: normalizedId, status, result: null,
      failureReason: value.failure_reason as RenderingJobProgress['failureReason'] };
  }
  if (!isRecord(value.result) || value.result.mime_type !== 'image/webp'
    || !isPositiveInteger(value.result.size_bytes)
    || typeof value.result.download_url !== 'string'
    || !validPrivateResultUrl(value.result.download_url, normalizedId)
    || !validTimestamp(value.result.expires_at)
    || Date.parse(value.result.expires_at) <= Date.now()) throw invalidResponse();
  return { jobId: normalizedId, status, failureReason: null, result: {
    url: value.result.download_url,
    expiresAt: value.result.expires_at,
    sizeBytes: value.result.size_bytes,
  } };
}

function validPrivateResultUrl(value: string, jobId: string): boolean {
  try {
    const url = new URL(value);
    const parts = url.pathname.split('/');
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.hash
      && /^[a-z0-9][a-z0-9-]*-\d+\.cos\.[a-z]+(?:-[a-z0-9]+)+\.myqcloud\.com$/.test(url.hostname)
      && parts.length === 7 && parts[1] === 'private' && parts[2] === 'customer-rendering-results'
      && Boolean(normalizeMaterialUuid(parts[3])) && parts[4] === jobId
      && Boolean(normalizeMaterialUuid(parts[5])) && parts[6] === 'result.webp'
      && /^[a-f0-9]{40}$/.test(url.searchParams.get('q-signature') ?? '');
  } catch { return false; }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validTimestamp(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)
    && Number.isFinite(Date.parse(value));
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function invalidResponse(): ApiRequestError {
  return new ApiRequestError(502, 'INVALID_API_RESPONSE', '客户生图任务响应无效');
}
