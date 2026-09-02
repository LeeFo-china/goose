import { beforeAll, describe, expect, mock, test } from 'bun:test';
import type {
  DouyinMaterialNoteRepositoryClaimResponse,
} from '@/schema/douyin-material-notes';
import type { DouyinMaterialNoteContentBlocks } from '@gooes/domain';
import type { JwtPayload } from '@/utils/jwt';

process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test-publish-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';

let ContextResolver: typeof import('./material-note-context').DouyinMaterialNoteContextResolver;
let MaterialNotesService: typeof import('./material-notes').DouyinMiniappMaterialNotesService;

beforeAll(async () => {
  ({ DouyinMaterialNoteContextResolver: ContextResolver } =
    await import('./material-note-context'));
  ({ DouyinMiniappMaterialNotesService: MaterialNotesService } =
    await import('./material-notes'));
});

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const INSTALLATION_ID = '22222222-2222-4222-8222-222222222222';
const NOTE_ID = '33333333-3333-4333-8333-333333333333';
const CLAIM_ID = '44444444-4444-4444-8444-444444444444';
const SUBJECT_HASH = 'a'.repeat(64);
const NOW = '2026-09-01T08:00:00.000Z';
const paragraphBlock = { type: 'paragraph' as const, text: '确认施工图纸。' };
const blocks: DouyinMaterialNoteContentBlocks = [paragraphBlock];

const user: JwtPayload = {
  sub: SUBJECT_HASH,
  token_type: 'douyin_miniapp',
  login_channel: 'douyin',
  tenant_id: TENANT_ID,
  douyin_installation_id: INSTALLATION_ID,
  douyin_app_id: 'tt-authorizer',
  subject_hash: SUBJECT_HASH,
};

const previewVersion = {
  title: '装修开工清单',
  summary: '开工前检查事项',
  category: '施工避坑',
  applicable_to: '准备开工的业主',
};
const publicRow = {
  id: NOTE_ID,
  published_at: NOW,
  published_version: previewVersion,
  claims: [{ id: CLAIM_ID }],
};
const ownedRow = {
  id: CLAIM_ID,
  claimed_at: NOW,
  note: { id: NOTE_ID, status: 'archived' as const },
  claimed_version: { ...previewVersion, version_no: 1 },
};
const ownedDetailRow = {
  ...ownedRow,
  claimed_version: { ...ownedRow.claimed_version, content_blocks: blocks },
};
const claimResult = {
  claim_id: CLAIM_ID,
  already_claimed: false,
  claimed_at: NOW,
  material: {
    id: NOTE_ID,
    version: 1,
    ...previewVersion,
    content_blocks: blocks,
  },
} satisfies DouyinMaterialNoteRepositoryClaimResponse;

type IdentityInput = {
  readonly tenantId: string;
  readonly installationId: string;
  readonly subjectHash: string;
};
type PublicListInput = IdentityInput & {
  readonly page: number;
  readonly pageSize: number;
  readonly keyword?: string;
};
type PublicDetailInput = IdentityInput & { readonly noteId: string };
type OwnedListInput = IdentityInput & { readonly page: number; readonly pageSize: number };
type OwnedDetailInput = IdentityInput & { readonly claimId: string };
type ClaimInput = IdentityInput & { readonly noteId: string };
type OwnedDetailRow = Omit<typeof ownedDetailRow, 'note'> & {
  readonly note: {
    readonly id: string;
    readonly status: 'draft' | 'published' | 'archived' | 'withdrawn';
  };
};

function installation(overrides: Record<string, unknown> = {}) {
  return {
    id: INSTALLATION_ID,
    tenant_id: TENANT_ID,
    authorizer_appid: 'tt-authorizer',
    authorization_status: 'active' as const,
    installation_kind: 'merchant' as const,
    template_version: '1.0.0',
    runtime_config: {
      brand: { logo_url: null, qualifications: [] },
      theme: { primary_color: '#C45A32', navigation_text_color: 'black' },
      features: {
        cases: true,
        sites: true,
        sms_lead: true,
        douyin_phone: false,
        phone_capture_mode: 'sms',
      },
      home_banners: [],
      trust_metrics: [],
      privacy_policy_version: '2026-07-19',
    },
    tenant: { id: TENANT_ID, status: 'active' as const },
    ...overrides,
  };
}

function resolverHarness(result: unknown = installation()) {
  const findActiveInstallation = mock(async () => result);
  const resolver = new ContextResolver({
    contextRepository: { findActiveInstallation } as never,
  });
  return { findActiveInstallation, resolver };
}

function serviceHarness() {
  const resolve = mock(async () => ({
    tenantId: TENANT_ID,
    installationId: INSTALLATION_ID,
    appId: 'tt-authorizer',
    subjectHash: SUBJECT_HASH,
  }));
  const listPublic = mock(async (_input: PublicListInput) =>
    ({ rows: [publicRow], total: 1 }));
  const findPublicPreview = mock(async (
    _input: PublicDetailInput,
  ): Promise<typeof publicRow | null> => publicRow);
  const listOwned = mock(async (_input: OwnedListInput) =>
    ({ rows: [ownedRow], total: 1 }));
  const findOwnedAccess = mock(async (
    _input: OwnedDetailInput,
  ): Promise<{ id: string; note: OwnedDetailRow['note'] } | null> => ({
    id: CLAIM_ID,
    note: ownedDetailRow.note,
  }));
  const findOwnedDetail = mock(async (
    _input: OwnedDetailInput,
  ): Promise<OwnedDetailRow | null> => ownedDetailRow);
  const claim = mock(async (_input: ClaimInput): Promise<DouyinMaterialNoteRepositoryClaimResponse> =>
    claimResult);
  const findMaterialImageAssets = mock(async () => []);
  const remove = mock(async (_input: OwnedDetailInput) => ({ removed: true as const }));
  const clear = mock(async (_input: IdentityInput) => ({ removed_count: 1 }));
  const service = new MaterialNotesService({
    contextResolver: { resolve },
    repository: {
      listPublic,
      findPublicPreview,
      listOwned,
      findOwnedAccess,
      findOwnedDetail,
      findMaterialImageAssets,
      claim,
      remove,
      clear,
    } as never,
  });
  return {
    claim,
    clear,
    findMaterialImageAssets,
    findOwnedDetail,
    findOwnedAccess,
    findPublicPreview,
    listOwned,
    listPublic,
    remove,
    resolve,
    service,
  };
}

describe('DouyinMaterialNoteContextResolver', () => {
  test('rejects wrong token types and absent or unbound subject hashes', async () => {
    const { findActiveInstallation, resolver } = resolverHarness();
    const invalidUsers: Array<JwtPayload | undefined> = [
      undefined,
      { ...user, token_type: 'auth' },
      { ...user, subject_hash: undefined },
      { ...user, subject_hash: 'not-a-subject-hash' },
      { ...user, sub: 'b'.repeat(64) },
    ];

    for (const invalidUser of invalidUsers) {
      await expect(resolver.resolve(invalidUser)).rejects.toMatchObject({
        statusCode: 401,
        code: 'UNAUTHORIZED',
      });
    }
    expect(findActiveInstallation).not.toHaveBeenCalled();
  });

  test('derives the installation query only from the authenticated session', async () => {
    const { findActiveInstallation, resolver } = resolverHarness();
    await expect(resolver.resolve(user)).resolves.toEqual({
      tenantId: TENANT_ID,
      installationId: INSTALLATION_ID,
      appId: 'tt-authorizer',
      subjectHash: SUBJECT_HASH,
    });
    expect(findActiveInstallation).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      installationId: INSTALLATION_ID,
      appId: 'tt-authorizer',
    });
  });

  test('rejects inactive installations, AppID mismatches and inactive tenants', async () => {
    const cases = [
      [null, 409, 'DOUYIN_INSTALLATION_DISABLED'],
      [installation({ authorization_status: 'revoked' }), 409,
        'DOUYIN_INSTALLATION_DISABLED'],
      [installation({ authorizer_appid: 'tt-other' }), 409,
        'DOUYIN_INSTALLATION_DISABLED'],
      [installation({ tenant: { id: TENANT_ID, status: 'suspended' } }), 403,
        'TENANT_NOT_AVAILABLE'],
    ] as const;

    for (const [result, statusCode, code] of cases) {
      await expect(resolverHarness(result).resolver.resolve(user)).rejects.toMatchObject({
        statusCode,
        code,
      });
    }
  });
});

describe('DouyinMiniappMaterialNotesService discovery', () => {
  test('maps a bounded public page without exposing body or identity fields', async () => {
    const { listPublic, service } = serviceHarness();
    const result = await service.listPublic(user, {
      page: 1,
      pageSize: 20,
      keyword: '开工',
    });

    expect(listPublic).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      installationId: INSTALLATION_ID,
      subjectHash: SUBJECT_HASH,
      page: 1,
      pageSize: 20,
      keyword: '开工',
    });
    expect(result).toEqual({
      list: [{
        id: NOTE_ID,
        ...previewVersion,
        published_at: NOW,
        claimed: true,
      }],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    });
    expect(JSON.stringify(result)).not.toMatch(
      /content_blocks|tenantId|tenant_id|installation|subject_hash/,
    );
  });

  test('returns preview-only detail and scopes claimed state to the session', async () => {
    const { findPublicPreview, service } = serviceHarness();
    const result = await service.getPublicPreview(user, NOTE_ID);

    expect(findPublicPreview).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      installationId: INSTALLATION_ID,
      subjectHash: SUBJECT_HASH,
      noteId: NOTE_ID,
    });
    expect(result).toEqual({
      id: NOTE_ID,
      ...previewVersion,
      published_at: NOW,
      claimed: true,
    });
    expect(result).not.toHaveProperty('content_blocks');
  });

  test('returns a private 404 for missing or foreign public notes', async () => {
    const harness = serviceHarness();
    harness.findPublicPreview.mockImplementationOnce(async () => null);
    await expect(harness.service.getPublicPreview(user, NOTE_ID)).rejects.toMatchObject({
      statusCode: 404,
      code: 'MATERIAL_NOTE_NOT_FOUND',
    });
  });
});

describe('DouyinMiniappMaterialNotesService claims', () => {
  test('uses the atomic gateway for first, repeated, concurrent-replay and revival results', async () => {
    const harness = serviceHarness();
    harness.claim
      .mockImplementationOnce(async () => claimResult)
      .mockImplementationOnce(async () => ({ ...claimResult, already_claimed: true }))
      .mockImplementationOnce(async () => ({ ...claimResult, already_claimed: true }))
      .mockImplementationOnce(async () => ({
        ...claimResult,
        already_claimed: false,
        claimed_at: '2026-09-01T09:00:00.000Z',
        material: { ...claimResult.material, version: 2 },
      }));

    const results = await Promise.all([
      harness.service.claim(user, NOTE_ID),
      harness.service.claim(user, NOTE_ID),
      harness.service.claim(user, NOTE_ID),
      harness.service.claim(user, NOTE_ID),
    ]);
    expect(results.map((result) => result.already_claimed))
      .toEqual([false, true, true, false]);
    expect(results[3]?.material.version).toBe(2);
    expect(harness.claim).toHaveBeenCalledTimes(4);
    for (const call of harness.claim.mock.calls) {
      expect(call[0]).toEqual({
        tenantId: TENANT_ID,
        installationId: INSTALLATION_ID,
        subjectHash: SUBJECT_HASH,
        noteId: NOTE_ID,
      });
    }
  });

  test('keeps claim isolated from lead, SMS, appointment and analytics services', async () => {
    const harness = serviceHarness();
    await harness.service.claim(user, NOTE_ID);

    expect(harness.claim).toHaveBeenCalledTimes(1);
    const source = await Bun.file(new URL('./material-notes.ts', import.meta.url)).text();
    expect(source).not.toMatch(
      /douyin-miniapp-marketing|sms-verification|marketing-lead|measurement-appointment/,
    );
    expect(source).not.toMatch(/insertEvents|sendCode|submitMeasurementAppointment/);
  });

});

describe('DouyinMiniappMaterialNotesService owned materials', () => {
  test('maps owned pages and archived locked-version bodies without identity fields', async () => {
    const { findOwnedAccess, findOwnedDetail, listOwned, service } = serviceHarness();
    const page = await service.listOwned(user, { page: 1, pageSize: 20 });
    const detail = await service.getOwnedDetail(user, CLAIM_ID);

    expect(listOwned).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      installationId: INSTALLATION_ID,
      subjectHash: SUBJECT_HASH,
      page: 1,
      pageSize: 20,
    });
    expect(findOwnedDetail).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      installationId: INSTALLATION_ID,
      subjectHash: SUBJECT_HASH,
      claimId: CLAIM_ID,
    });
    expect(findOwnedAccess).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      installationId: INSTALLATION_ID,
      subjectHash: SUBJECT_HASH,
      claimId: CLAIM_ID,
    });
    const expectedSummary = {
      claim_id: CLAIM_ID,
      id: NOTE_ID,
      version: 1,
      ...previewVersion,
      claimed_at: NOW,
    };
    expect(page.list[0]).toEqual(expectedSummary);
    expect(detail).toEqual({ ...expectedSummary, content_blocks: [paragraphBlock] });
    expect(JSON.stringify({ page, detail })).not.toMatch(
      /tenantId|tenant_id|installation|subject_hash|status/,
    );
  });

  test('returns 410 without body for withdrawn claims and 404 for absent claims', async () => {
    const withdrawn = serviceHarness();
    withdrawn.findOwnedAccess.mockImplementationOnce(async () => ({
      id: CLAIM_ID,
      note: { id: NOTE_ID, status: 'withdrawn' as const },
    }));
    let caught: unknown;
    try {
      await withdrawn.service.getOwnedDetail(user, CLAIM_ID);
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({
      statusCode: 410,
      code: 'MATERIAL_NOTE_WITHDRAWN',
    });
    expect(JSON.stringify(caught)).not.toContain('content_blocks');
    expect(withdrawn.findOwnedDetail).not.toHaveBeenCalled();

    const absent = serviceHarness();
    absent.findOwnedAccess.mockImplementationOnce(async () => null);
    await expect(absent.service.getOwnedDetail(user, CLAIM_ID)).rejects.toMatchObject({
      statusCode: 404,
      code: 'MATERIAL_NOTE_CLAIM_NOT_FOUND',
    });
    expect(absent.findOwnedDetail).not.toHaveBeenCalled();
  });

  test('rechecks body-free status when the eligible body disappears in a race', async () => {
    const withdrawnRace = serviceHarness();
    withdrawnRace.findOwnedAccess
      .mockImplementationOnce(async () => ({
        id: CLAIM_ID,
        note: { id: NOTE_ID, status: 'published' as const },
      }))
      .mockImplementationOnce(async () => ({
        id: CLAIM_ID,
        note: { id: NOTE_ID, status: 'withdrawn' as const },
      }));
    withdrawnRace.findOwnedDetail.mockImplementationOnce(async () => null);
    await expect(withdrawnRace.service.getOwnedDetail(user, CLAIM_ID))
      .rejects.toMatchObject({ statusCode: 410, code: 'MATERIAL_NOTE_WITHDRAWN' });
    expect(withdrawnRace.findOwnedAccess).toHaveBeenCalledTimes(2);
    expect(withdrawnRace.findOwnedDetail).toHaveBeenCalledTimes(1);

    const removedRace = serviceHarness();
    removedRace.findOwnedAccess
      .mockImplementationOnce(async () => ({
        id: CLAIM_ID,
        note: { id: NOTE_ID, status: 'archived' as const },
      }))
      .mockImplementationOnce(async () => null);
    removedRace.findOwnedDetail.mockImplementationOnce(async () => null);
    await expect(removedRace.service.getOwnedDetail(user, CLAIM_ID))
      .rejects.toMatchObject({ statusCode: 404, code: 'MATERIAL_NOTE_CLAIM_NOT_FOUND' });
  });

  test('rejects malformed body-free access state without reading content', async () => {
    const malformed = serviceHarness();
    malformed.findOwnedAccess.mockImplementationOnce(async () => ({
      id: CLAIM_ID,
      note: { id: NOTE_ID, status: 'unexpected' },
    } as never));
    await expect(malformed.service.getOwnedDetail(user, CLAIM_ID))
      .rejects.toMatchObject({ statusCode: 500, code: 'MATERIAL_NOTE_RESPONSE_INVALID' });
    expect(malformed.findOwnedDetail).not.toHaveBeenCalled();
  });

  test('keeps remove and clear idempotent and fully session scoped', async () => {
    const harness = serviceHarness();
    harness.clear
      .mockImplementationOnce(async () => ({ removed_count: 2 }))
      .mockImplementationOnce(async () => ({ removed_count: 0 }));

    await expect(harness.service.remove(user, CLAIM_ID))
      .resolves.toEqual({ removed: true });
    await expect(harness.service.remove(user, CLAIM_ID))
      .resolves.toEqual({ removed: true });
    await expect(harness.service.clear(user)).resolves.toEqual({ removed_count: 2 });
    await expect(harness.service.clear(user)).resolves.toEqual({ removed_count: 0 });

    expect(harness.remove).toHaveBeenCalledTimes(2);
    expect(harness.remove.mock.calls.every(([input]) =>
      input.tenantId === TENANT_ID
      && input.installationId === INSTALLATION_ID
      && input.subjectHash === SUBJECT_HASH
      && input.claimId === CLAIM_ID)).toBe(true);
    expect(harness.clear.mock.calls.every(([input]) =>
      input.tenantId === TENANT_ID
      && input.installationId === INSTALLATION_ID
      && input.subjectHash === SUBJECT_HASH)).toBe(true);
  });
});
