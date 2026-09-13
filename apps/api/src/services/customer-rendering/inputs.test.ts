import { beforeAll, expect, mock, test } from 'bun:test';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { Errors } from '@/errors/error-factory';
import type { CustomerInputRow, CustomerRenderingInputsRepositoryPort } from '@/repositories/customer-rendering-inputs';
import type { CustomerInputStoragePort } from '@/gateways/customer-rendering-input-storage/client';
import type { JwtPayload } from '@/utils/jwt';

process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test-publish-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';
let Service: typeof import('./inputs').CustomerRenderingInputsService;
let Context: typeof import('./context').CustomerRenderingContextService;
let Digest: typeof import('./identity-digest').CustomerRenderingIdentityDigestService;
beforeAll(async () => {
  ({ CustomerRenderingInputsService: Service } = await import('./inputs'));
  ({ CustomerRenderingContextService: Context } = await import('./context'));
  ({ CustomerRenderingIdentityDigestService: Digest } = await import('./identity-digest'));
});
const tenantId = '11111111-1111-4111-8111-111111111111';
const id = '22222222-2222-4222-8222-222222222222';
const user = { token_type: 'visitor_session', visitor_id: 'visitor', openid: 'openid' } as JwtPayload;
const request = { purpose: 'room', mime_type: 'image/png', size_bytes: 123 } as const;
const rawKey = `private/customer-rendering-inputs/${tenantId}/${id}/raw`;
const location = { bucket: 'old-bucket-123', region: 'ap-guangzhou', object_key: rawKey };
function fixture() {
  const digestService = new Digest({ key: 'x'.repeat(32), keyVersion: 1 });
  const contextService = new Context({ contextRepository: {
    findLatestSelectedVisitorTenant: async () => tenantId,
    findActiveTenant: async () => ({ id: tenantId, status: 'active' }),
  } });
  let row: CustomerInputRow | null = {
    id, tenant_id: tenantId, channel: 'wechat', subject_key_version: 1,
    subject_digest: 'a'.repeat(64), application_id: null, installation_id: null,
    purpose: 'room', declared_mime_type: 'image/png', declared_size_bytes: 123,
    ...location, raw_object_key: rawKey, normalized_object_key: null,
    normalized_size_bytes: null, width: null, height: null, checksum: null,
    status: 'issued', expires_at: new Date(Date.now() + 600_000).toISOString(),
    processing_lease_expires_at: null, raw_cleanup_after: new Date(Date.now() + 86_400_000).toISOString(), raw_deleted_at: null,
  };
  const repository = {
    createIssued: mock(async (..._args: Parameters<CustomerRenderingInputsRepositoryPort['createIssued']>) => {}),
    countRecent: mock(async (..._args: Parameters<CustomerRenderingInputsRepositoryPort['countRecent']>) => 0),
    findOwned: mock(async (..._args: Parameters<CustomerRenderingInputsRepositoryPort['findOwned']>) => row),
    claimProcessing: mock(async (...[_owner, _id, lease]: Parameters<CustomerRenderingInputsRepositoryPort['claimProcessing']>) => {
      if (row) { row.status = 'processing'; row.processing_lease_expires_at = lease; } return true;
    }),
    markNormalized: mock(async (...[_owner, _id, result]: Parameters<CustomerRenderingInputsRepositoryPort['markNormalized']>) => {
      if (row) Object.assign(row, { status: 'pending_review', normalized_object_key: result.objectKey,
        normalized_size_bytes: result.sizeBytes, width: result.width, height: result.height, checksum: result.checksum });
      return true;
    }),
    markFailed: mock(async (..._args: Parameters<CustomerRenderingInputsRepositoryPort['markFailed']>) => { if (row) row.status = 'failed'; return true; }),
  } satisfies Pick<CustomerRenderingInputsRepositoryPort, 'createIssued' | 'countRecent' | 'findOwned' | 'claimProcessing' | 'markNormalized' | 'markFailed'>;
  const storage = {
    rawObjectKey: (_tenant: string, fileId: string) => `private/customer-rendering-inputs/${tenantId}/${fileId}/raw`,
    normalizedObjectKey: () => rawKey.replace('/raw', '/normalized.webp'),
    location: mock(async (_tenant: string, fileId: string) => ({ ...location, object_key: `private/customer-rendering-inputs/${tenantId}/${fileId}/raw` })),
    signPut: mock(async (...[_tenant, _id, _mime, _size, persisted]: Parameters<CustomerInputStoragePort['signPut']>) => ({
      location: persisted!, uploadUrl: 'https://example.com/signed', headers: {}, expiresAt: new Date(Date.now() + 600_000).toISOString(),
    })),
    readRaw: mock(async () => sharp({ create: { width: 16, height: 12, channels: 3, background: 'red' } }).png().toBuffer()),
    putNormalized: mock(async (..._args: Parameters<CustomerInputStoragePort['putNormalized']>) => {}),
    hasNormalized: mock(async () => false), removeRaw: mock(async () => {}),
  } satisfies CustomerInputStoragePort;
  const service = new Service({ contextService, digestService, repository, storage });
  return { service, repository, storage, contextService, digestService,
    get row() { return row!; }, hide: () => { row = null; } };
}

test('intent resolves trusted context and digest, persists location before signing', async () => {
  const f = fixture();
  f.storage.signPut.mockImplementation(async (_tenant, _id, _mime, _size, persisted) => {
    expect(f.repository.createIssued).toHaveBeenCalledTimes(1);
    expect(persisted).toEqual(f.repository.createIssued.mock.calls[0]?.[1] && {
      ...location, object_key: f.repository.createIssued.mock.calls[0]?.[1].rawObjectKey,
    });
    return { location: persisted!, uploadUrl: 'https://example.com/signed', headers: {}, expiresAt: new Date(Date.now() + 599_000).toISOString() };
  });
  const result = await f.service.createIntent(user, 'wechat', request);
  expect(result).toMatchObject({ method: 'PUT', upload_url: 'https://example.com/signed' });
  expect(f.repository.createIssued.mock.calls[0]?.[0]).toEqual({ tenantId, channel: 'wechat', applicationId: null, installationId: null,
    subjectKeyVersion: 1, subjectDigest: f.digestService.subject(await f.contextService.resolveWechat(user)).digest });
  expect(f.repository.countRecent).toHaveBeenCalledTimes(2);
  const midnight = f.repository.countRecent.mock.calls[1]?.[1];
  expect(new Date(midnight!).toLocaleTimeString('en-GB', { timeZone: 'Asia/Shanghai' })).toBe('00:00:00');
  expect(JSON.stringify(result)).not.toContain('subject');
});

test('WeChat customer resolves the same owner as visitor; other subject cannot complete', async () => {
  const f = fixture();
  const customer = { token_type: 'auth', login_channel: 'wechat', tenant_id: tenantId, openid: 'openid' } as JwtPayload;
  await f.service.createIntent(user, 'wechat', request);
  await f.service.createIntent(customer, 'wechat', request);
  const owner = f.repository.createIssued.mock.calls[0]![0];
  expect(f.repository.createIssued.mock.calls[1]![0]).toEqual(owner);
  f.repository.findOwned.mockImplementation(async (candidate) => candidate.subjectDigest === owner.subjectDigest ? f.row : null);
  await expect(f.service.complete({ ...user, openid: 'different' }, 'wechat', id)).rejects.toMatchObject({ statusCode: 404 });
  expect(f.storage.readRaw).not.toHaveBeenCalled();
});

test('Douyin miniapp and customer use installation-bound HMAC identity', async () => {
  const f = fixture();
  const contextService = new Context({ installationRepository: { findActiveInstallation: async () => ({
    id, tenant_id: tenantId, authorizer_appid: 'tt-app', authorization_status: 'active',
    installation_kind: 'merchant', template_version: '1.0', deployment_key: null,
    runtime_config: { brand: { logo_url: null, qualifications: [] },
      theme: { primary_color: '#1677FF', navigation_text_color: 'white' },
      features: { cases: true, sites: true, sms_lead: true, douyin_phone: false, phone_capture_mode: 'sms' },
      home_banners: [], trust_metrics: [], privacy_policy_version: 'v1', contact_sla_text: '一个工作日内联系' },
    tenant: { id: tenantId, status: 'active' },
  }) } });
  const service = new Service({ contextService, digestService: f.digestService, repository: f.repository, storage: f.storage });
  const mini: JwtPayload = { token_type: 'douyin_miniapp', sub: 'a'.repeat(64), subject_hash: 'a'.repeat(64),
    tenant_id: tenantId, douyin_installation_id: id, douyin_app_id: 'tt-app' };
  await service.createIntent(mini, 'douyin', request);
  await service.createIntent({ ...mini, token_type: 'auth', login_channel: 'douyin', sub: 'auth-user' }, 'douyin', request);
  expect(f.repository.createIssued.mock.calls[0]![0]).toEqual(f.repository.createIssued.mock.calls[1]![0]);
  expect(f.repository.createIssued.mock.calls[0]![0]).toEqual({ tenantId, channel: 'douyin',
    applicationId: 'tt-app', installationId: id, subjectKeyVersion: 1,
    subjectDigest: f.digestService.subject(await contextService.resolveDouyin(mini)).digest });
});

test('recovery HEAD miss attempts immutable PUT; conflicts stay processing', async () => {
  const f = fixture(); f.row.status = 'processing'; f.row.expires_at = new Date(0).toISOString();
  f.row.processing_lease_expires_at = new Date(0).toISOString();
  f.storage.putNormalized.mockRejectedValue(Errors.business(502, '未知', 'RENDERING_INPUT_STORAGE_NORMALIZED_UNKNOWN'));
  await expect(f.service.complete(user, 'wechat', id)).rejects.toMatchObject({ statusCode: 502 });
  expect(f.storage.hasNormalized).toHaveBeenCalledTimes(1);
  expect(f.repository.markNormalized).not.toHaveBeenCalled(); expect(f.repository.markFailed).not.toHaveBeenCalled();
  expect(f.row.status).toBe('processing');
});

test('raw deleted prevents reclamation; invalid image cannot fail a stolen lease', async () => {
  const f = fixture(); f.row.raw_deleted_at = new Date().toISOString();
  await expect(f.service.complete(user, 'wechat', id)).rejects.toMatchObject({ statusCode: 409 });
  expect(f.repository.claimProcessing).not.toHaveBeenCalled();
  f.row.raw_deleted_at = null; f.storage.readRaw.mockResolvedValue(Buffer.from('bad'));
  f.repository.markFailed.mockResolvedValue(false);
  await expect(f.service.complete(user, 'wechat', id)).rejects.toMatchObject({ code: 'RENDERING_UPLOAD_PROCESSING' });
});

test('rejects forged DTO, invalid session and unselected tenant', async () => {
  const f = fixture();
  await expect(f.service.createIntent(user, 'wechat', { ...request, tenant_id: tenantId } as never)).rejects.toMatchObject({ statusCode: 400 });
  await expect(f.service.createIntent(undefined, 'wechat', request)).rejects.toMatchObject({ statusCode: 401 });
  const service = new Service({ contextService: new Context({ contextRepository: {
    findLatestSelectedVisitorTenant: async () => null, findActiveTenant: async () => null,
  } }), digestService: f.digestService, repository: f.repository, storage: f.storage });
  await expect(service.createIntent(user, 'wechat', request)).rejects.toMatchObject({ statusCode: 409, code: 'RENDERING_TENANT_CONTEXT_REQUIRED' });
  expect(f.repository.createIssued).not.toHaveBeenCalled();
});

test.each([3, 10])('rejects existing frequency count %d before signing', async (count) => {
  const f = fixture();
  f.repository.countRecent.mockImplementationOnce(async () => count === 3 ? 3 : 0).mockImplementationOnce(async () => count);
  await expect(f.service.createIntent(user, 'wechat', request)).rejects.toMatchObject({ statusCode: 429, code: 'RENDERING_UPLOAD_RATE_LIMITED' });
  expect(f.storage.signPut).not.toHaveBeenCalled();
});

test('signing failure closes only issued intent', async () => {
  const f = fixture(); f.storage.signPut.mockRejectedValue(Errors.business(502, '失败', 'RENDERING_INPUT_STORAGE_FAILED'));
  await expect(f.service.createIntent(user, 'wechat', request)).rejects.toMatchObject({ statusCode: 502 });
  expect(f.repository.markFailed.mock.calls[0]?.[2]).toBeNull();
});

test('invalid signed expiry closes issued intent with wrapped storage failure', async () => {
  const f = fixture();
  f.storage.signPut.mockImplementation(async (_tenant, _id, _mime, _size, persisted) => ({
    location: persisted!, uploadUrl: 'https://example.com/signed', headers: {}, expiresAt: 'invalid',
  }));
  await expect(f.service.createIntent(user, 'wechat', request)).rejects.toMatchObject({ statusCode: 502 });
  expect(f.repository.markFailed).toHaveBeenCalledTimes(1);
});

test('complete normalizes real bytes using persisted location and fenced update, replay same file ID', async () => {
  const f = fixture();
  const result = await f.service.complete(user, 'wechat', id);
  expect(result).toMatchObject({ file_id: id, status: 'pending_review', mime_type: 'image/webp', width: 16, height: 12 });
  expect(f.storage.readRaw).toHaveBeenCalledWith(expect.anything(), id, location, 123, 'image/png');
  const bytes = f.storage.putNormalized.mock.calls[0]?.[3];
  expect((await sharp(bytes).metadata()).format).toBe('webp');
  expect(f.row.checksum).toBe(createHash('sha256').update(bytes!).digest('hex'));
  expect(f.repository.markNormalized.mock.calls[0]?.[3]).toBe(f.repository.claimProcessing.mock.calls[0]?.[2]);
  expect(await f.service.complete(user, 'wechat', id)).toEqual(result);
  expect(f.storage.readRaw).toHaveBeenCalledTimes(1);
  expect(f.storage.removeRaw).not.toHaveBeenCalled();
});

test.each(['missing', 'expired', 'active', 'failed', 'deleted', 'approved', 'bad-id'] as const)('complete rejects %s before object reads', async (state) => {
  const f = fixture();
  if (state === 'missing') f.hide();
  if (state === 'expired') f.row.expires_at = new Date(0).toISOString();
  if (state === 'active') { f.row.status = 'processing'; f.row.processing_lease_expires_at = new Date(Date.now() + 60_000).toISOString(); }
  if (state === 'failed' || state === 'deleted' || state === 'approved') f.row.status = state;
  await expect(f.service.complete(user, 'wechat', state === 'bad-id' ? 'bad' : id)).rejects.toMatchObject({
    statusCode: state === 'missing' ? 404 : state === 'bad-id' ? 400 : 409,
  });
  expect(f.storage.readRaw).not.toHaveBeenCalled();
});

test('lost claim does not read, lost final lease never returns success', async () => {
  const f = fixture(); f.repository.claimProcessing.mockResolvedValue(false);
  await expect(f.service.complete(user, 'wechat', id)).rejects.toMatchObject({ code: 'RENDERING_UPLOAD_PROCESSING' });
  expect(f.storage.readRaw).not.toHaveBeenCalled();
  f.repository.claimProcessing.mockResolvedValue(true); f.repository.markNormalized.mockResolvedValue(false);
  await expect(f.service.complete(user, 'wechat', id)).rejects.toMatchObject({ code: 'RENDERING_UPLOAD_PROCESSING' });
});

test('deterministic bad image fails leased row; transient storage errors preserve processing', async () => {
  const f = fixture(); f.storage.readRaw.mockResolvedValue(Buffer.from('not an image'));
  await expect(f.service.complete(user, 'wechat', id)).rejects.toMatchObject({ statusCode: 422, code: 'RENDERING_IMAGE_REJECTED' });
  expect(f.repository.markFailed.mock.calls[0]?.[2]).toBe(f.repository.claimProcessing.mock.calls[0]?.[2]);
  const retry = fixture(); retry.storage.readRaw.mockRejectedValue(Errors.business(502, '失败', 'RENDERING_INPUT_STORAGE_FAILED'));
  await expect(retry.service.complete(user, 'wechat', id)).rejects.toMatchObject({ statusCode: 502 });
  expect(retry.repository.markFailed).not.toHaveBeenCalled();
  expect(retry.row.status).toBe('processing');
});

test('unknown normalized PUT recovers after intent expiry through digest HEAD without rewriting', async () => {
  const f = fixture(); f.storage.putNormalized.mockRejectedValue(Errors.business(502, '未知', 'RENDERING_INPUT_STORAGE_NORMALIZED_UNKNOWN'));
  await expect(f.service.complete(user, 'wechat', id)).rejects.toMatchObject({ statusCode: 502 });
  expect(f.repository.markFailed).not.toHaveBeenCalled();
  f.row.expires_at = new Date(0).toISOString(); f.row.processing_lease_expires_at = new Date(0).toISOString();
  f.storage.hasNormalized.mockResolvedValue(true);
  await expect(f.service.complete(user, 'wechat', id)).resolves.toMatchObject({ file_id: id, status: 'pending_review' });
  expect(f.storage.hasNormalized).toHaveBeenCalledTimes(1);
  expect(f.storage.putNormalized).toHaveBeenCalledTimes(1);
});
