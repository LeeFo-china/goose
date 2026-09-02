import { beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { DouyinMaterialNoteContentBlocks } from '@gooes/domain';
import type {
  DouyinMaterialNoteRepositoryClaimResponse,
  DouyinMaterialNoteRepositoryImageAssetRow,
} from '@/schema/douyin-material-notes';

process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test-publish-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';

let MaterialNotesService: typeof import('./material-notes').DouyinMiniappMaterialNotesService;
const resolveStoredFileUrl = mock((value: string | null | undefined) =>
  value ? `https://signed.goodcms.cn/${encodeURIComponent(value)}` : null);

mock.module('@/services/files/file-url-resolver', () => ({
  resolveStoredFileUrl,
}));

beforeAll(async () => {
  ({ DouyinMiniappMaterialNotesService: MaterialNotesService } =
    await import('./material-notes'));
});

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const INSTALLATION_ID = '22222222-2222-4222-8222-222222222222';
const NOTE_ID = '33333333-3333-4333-8333-333333333333';
const CLAIM_ID = '44444444-4444-4444-8444-444444444444';
const IMAGE_FILE_ID = '55555555-5555-4555-8555-555555555555';
const SUBJECT_HASH = 'a'.repeat(64);
const NOW = '2026-09-01T08:00:00.000Z';
const paragraphBlock = { type: 'paragraph' as const, text: '确认施工图纸。' };
const draftImageBlock = {
  type: 'image' as const,
  fileId: IMAGE_FILE_ID,
  alt: '开工材料清单图片',
  caption: '保存到手机后按房间核对。',
};
const rawPublicImageSrc = 'https://cdn.goodcms.cn/material-notes/checklist.webp';
const publicImageBlock = {
  type: 'image' as const,
  asset: {
    fileId: IMAGE_FILE_ID,
    src: `https://signed.goodcms.cn/${encodeURIComponent(rawPublicImageSrc)}`,
    alt: draftImageBlock.alt,
    width: 1200,
    height: 800,
  },
  caption: draftImageBlock.caption,
};
const imageAsset = {
  id: IMAGE_FILE_ID,
  tenant_id: TENANT_ID,
  public_url: rawPublicImageSrc,
  object_key: 'tenants/11111111-1111-4111-8111-111111111111/picture-library/unassigned/checklist.webp',
  width: publicImageBlock.asset.width,
  height: publicImageBlock.asset.height,
  mime_type: 'image/webp',
  status: 'active',
  visibility: 'public',
} satisfies DouyinMaterialNoteRepositoryImageAssetRow;
const previewVersion = {
  title: '装修开工清单',
  summary: '开工前检查事项',
  category: '施工避坑',
  applicable_to: '准备开工的业主',
};
const claimResult = {
  claim_id: CLAIM_ID,
  already_claimed: false,
  claimed_at: NOW,
  material: {
    id: NOTE_ID,
    version: 1,
    ...previewVersion,
    content_blocks: [paragraphBlock, draftImageBlock, draftImageBlock],
  },
} satisfies DouyinMaterialNoteRepositoryClaimResponse;
const ownedDetailRow = {
  id: CLAIM_ID,
  claimed_at: NOW,
  note: { id: NOTE_ID, status: 'published' as const },
  claimed_version: {
    ...previewVersion,
    version_no: 1,
    content_blocks: [paragraphBlock, draftImageBlock] satisfies DouyinMaterialNoteContentBlocks,
  },
};

function harness(options: {
  readonly claimResult?: DouyinMaterialNoteRepositoryClaimResponse;
  readonly assets?: DouyinMaterialNoteRepositoryImageAssetRow[];
} = {}) {
  const resolve = mock(async () => ({
    tenantId: TENANT_ID,
    installationId: INSTALLATION_ID,
    appId: 'tt-authorizer',
    subjectHash: SUBJECT_HASH,
  }));
  const claim = mock(async () => options.claimResult ?? claimResult);
  const findMaterialImageAssets = mock(async () => options.assets ?? [imageAsset]);
  const findOwnedAccess = mock(async () => ({
    id: CLAIM_ID,
    note: ownedDetailRow.note,
  }));
  const findOwnedDetail = mock(async () => ownedDetailRow);
  const service = new MaterialNotesService({
    contextResolver: { resolve },
    repository: {
      claim,
      findMaterialImageAssets,
      findOwnedAccess,
      findOwnedDetail,
    } as never,
  });
  return { service, claim, findMaterialImageAssets, findOwnedAccess, findOwnedDetail };
}

describe('DouyinMiniappMaterialNotesService image blocks', () => {
  beforeEach(() => {
    resolveStoredFileUrl.mockClear();
  });

  test('resolves claimed image blocks to tenant-scoped public assets once per file id', async () => {
    const context = harness();
    await expect(context.service.claim(undefined, NOTE_ID)).resolves.toEqual({
      ...claimResult,
      material: {
        ...claimResult.material,
        content_blocks: [paragraphBlock, publicImageBlock, publicImageBlock],
      },
    });
    expect(context.findMaterialImageAssets).toHaveBeenCalledTimes(1);
    expect(context.findMaterialImageAssets).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      fileIds: [IMAGE_FILE_ID],
    });
  });

  test('resolves miniapp image URLs through storage access policy before returning body', async () => {
    const publicUrl = 'https://raw-cos.goodcms.cn/material-notes/checklist.webp';
    const context = harness({
      assets: [{ ...imageAsset, public_url: publicUrl }],
    });

    await expect(context.service.getOwnedDetail(undefined, CLAIM_ID)).resolves.toMatchObject({
      content_blocks: [{
        type: 'paragraph',
      }, {
        type: 'image',
        asset: {
          src: `https://signed.goodcms.cn/${encodeURIComponent(publicUrl)}`,
        },
      }],
    });
    expect(resolveStoredFileUrl).toHaveBeenCalledWith(publicUrl);
  });

  test('falls back to object key when an otherwise valid image lacks a stored public URL', async () => {
    const objectKey = imageAsset.object_key;
    const context = harness({
      assets: [{ ...imageAsset, public_url: null }],
    });

    await expect(context.service.claim(undefined, NOTE_ID)).resolves.toMatchObject({
      material: {
        content_blocks: [{
          type: 'paragraph',
        }, {
          type: 'image',
          asset: {
            src: `https://signed.goodcms.cn/${encodeURIComponent(objectKey)}`,
          },
        }, {
          type: 'image',
          asset: {
            src: `https://signed.goodcms.cn/${encodeURIComponent(objectKey)}`,
          },
        }],
      },
    });
    expect(resolveStoredFileUrl).toHaveBeenCalledWith(objectKey);
  });

  test('resolves owned detail image blocks after body-free access passes', async () => {
    const context = harness();
    await expect(context.service.getOwnedDetail(undefined, CLAIM_ID)).resolves.toEqual({
      claim_id: CLAIM_ID,
      id: NOTE_ID,
      version: 1,
      ...previewVersion,
      claimed_at: NOW,
      content_blocks: [paragraphBlock, publicImageBlock],
    });
    expect(context.findOwnedAccess).toHaveBeenCalledTimes(1);
    expect(context.findMaterialImageAssets).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      fileIds: [IMAGE_FILE_ID],
    });
  });

  test('rejects unusable image assets before exposing a body', async () => {
    const context = harness({ assets: [{ ...imageAsset, mime_type: 'application/pdf' }] });
    await expect(context.service.claim(undefined, NOTE_ID))
      .rejects.toMatchObject({
        statusCode: 500,
        code: 'MATERIAL_NOTE_RESPONSE_INVALID',
      });
  });
});
