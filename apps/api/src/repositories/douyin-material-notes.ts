import type {
  DouyinMaterialNoteStatus,
  DouyinMaterialNoteVersionDraft,
} from '@gooes/domain';
import { z } from 'zod';

import { Errors } from '@/errors/error-factory';
import {
  DouyinMaterialNoteRepositoryOwnedDetailRowSchema,
  DouyinMaterialNoteRepositoryOwnedAccessRowSchema,
  DouyinMaterialNoteRepositoryOwnedRowSchema,
  DouyinMaterialNoteRepositoryPublicRowSchema,
  DouyinMaterialNoteClearResponseSchema,
  DouyinMaterialNoteErasureResultSchema,
  DouyinMaterialNoteRepositoryClaimResponseSchema,
  DouyinMaterialNoteRepositoryImageAssetRowSchema,
  DouyinMaterialNoteRemoveResponseSchema,
} from '@/schema/douyin-material-notes';
import {
  TenantDouyinMaterialNoteAppendResultSchema,
  TenantDouyinMaterialNoteCategoryRepositoryRowSchema,
  TenantDouyinMaterialNoteCreateResultSchema,
  TenantDouyinMaterialNoteRepositoryDetailRowSchema,
  TenantDouyinMaterialNoteRepositoryListRowSchema,
  TenantDouyinMaterialNoteRepositorySearchListRowSchema,
  TenantDouyinMaterialNoteRepositoryVersionSummarySchema,
  TenantDouyinMaterialNoteRepositoryVersionSchema,
  TenantDouyinMaterialNoteTransitionResultSchema,
} from '@/schema/tenant-douyin-material-notes';
import { SupabaseDB } from '@/utils/supabase';

import {
  assertSuccess,
  categorySearchFilter,
  execute,
  invalidResponse,
  optionalResult,
  pageRange,
  pageResult,
  parse,
  removeUndefined,
  searchFilter,
} from './douyin-material-notes-repository-utils';

export type DouyinMaterialNotesDatabaseResult = {
  readonly data: unknown;
  readonly error: unknown;
  readonly count?: number | null;
};

type ReferencedTableOptions = { readonly referencedTable?: string };
type OrderOptions = ReferencedTableOptions & { readonly ascending: boolean };

export interface DouyinMaterialNotesQuery
  extends PromiseLike<DouyinMaterialNotesDatabaseResult> {
  select(columns: string, options?: { readonly count?: 'exact' }): DouyinMaterialNotesQuery;
  eq(column: string, value: unknown): DouyinMaterialNotesQuery;
  is(column: string, value: null): DouyinMaterialNotesQuery;
  in(column: string, values: readonly unknown[]): DouyinMaterialNotesQuery;
  or(filters: string, options?: ReferencedTableOptions): DouyinMaterialNotesQuery;
  order(column: string, options: OrderOptions): DouyinMaterialNotesQuery;
  range(from: number, to: number): DouyinMaterialNotesQuery;
  limit(count: number, options?: ReferencedTableOptions): DouyinMaterialNotesQuery;
  insert(values: Readonly<Record<string, unknown>>): DouyinMaterialNotesQuery;
  update(values: Readonly<Record<string, unknown>>): DouyinMaterialNotesQuery;
  maybeSingle(): Promise<DouyinMaterialNotesDatabaseResult>;
  single(): Promise<DouyinMaterialNotesDatabaseResult>;
}

const MATERIAL_NOTE_RPC_NAMES = [
  'create_douyin_material_note',
  'append_douyin_material_note_version',
  'execute_douyin_material_note_state_command',
  'claim_douyin_material_note',
  'remove_douyin_material_note_claim',
  'clear_douyin_material_note_claims',
  'erase_douyin_material_note_subject_data',
] as const;
type MaterialNoteRpcName = typeof MATERIAL_NOTE_RPC_NAMES[number];

export interface DouyinMaterialNotesDatabaseClient {
  from(table: string): DouyinMaterialNotesQuery;
  rpc(
    name: MaterialNoteRpcName,
    args: Readonly<Record<string, unknown>>,
  ): PromiseLike<DouyinMaterialNotesDatabaseResult>;
}

const PUBLIC_SELECT = [
  'id,published_at',
  'published_version:douyin_material_note_versions!douyin_material_notes_published_version_owner_fkey(title,summary,category,category_id,applicable_to)',
  'claims:douyin_material_note_claims!douyin_material_note_claims_note_tenant_fkey(id)',
].join(',');
const PUBLIC_SEARCH_SELECT = PUBLIC_SELECT.replace(
  'douyin_material_notes_published_version_owner_fkey(',
  'douyin_material_notes_published_version_owner_fkey!inner(',
);
const TENANT_LIST_SELECT = [
  'id,status,published_at,updated_at',
  'latest_versions:douyin_material_note_versions!douyin_material_note_versions_note_tenant_fkey(version_no,title,category,category_id)',
  'claims:douyin_material_note_claims!douyin_material_note_claims_note_tenant_fkey(count)',
].join(',');
const SEARCH_RELATION_SELECT =
  ',search_versions:douyin_material_note_versions!douyin_material_note_versions_note_tenant_fkey!inner(id)';
const VERSION_SUMMARY_SELECT =
  'id,note_id,version_no,title,summary,category,category_id,applicable_to,created_by,created_at';
const VERSION_DETAIL_SELECT =
  'id,note_id,version_no,title,summary,category,category_id,applicable_to,content_blocks,created_by,created_at';
const TENANT_DETAIL_SELECT = [
  'id,status,published_version_id,published_at,created_at,updated_at',
  `latest_versions:douyin_material_note_versions!douyin_material_note_versions_note_tenant_fkey(${VERSION_SUMMARY_SELECT})`,
  'claims:douyin_material_note_claims!douyin_material_note_claims_note_tenant_fkey(count)',
].join(',');
const OWNED_SELECT = [
  'id,claimed_at',
  'note:douyin_material_notes!douyin_material_note_claims_note_tenant_fkey(id,status)',
  'claimed_version:douyin_material_note_versions!douyin_material_note_claims_version_owner_fkey(version_no,title,summary,category,category_id,applicable_to)',
].join(',');
const OWNED_ACCESS_SELECT = [
  'id',
  'note:douyin_material_notes!douyin_material_note_claims_note_tenant_fkey(id,status)',
].join(',');
const OWNED_DETAIL_SELECT = [
  'id,claimed_at',
  'note:douyin_material_notes!douyin_material_note_claims_note_tenant_fkey!inner(id,status)',
  'claimed_version:douyin_material_note_versions!douyin_material_note_claims_version_owner_fkey(version_no,title,summary,category,category_id,applicable_to,content_blocks)',
].join(',');
const CATEGORY_SELECT =
  'id,name,description,status,sort_order,created_at,updated_at';

type PageInput = { readonly page: number; readonly pageSize: number };
type PublicIdentityInput = {
  readonly tenantId: string;
  readonly installationId: string;
  readonly subjectHash: string;
};

export class DouyinMaterialNotesRepository {
  constructor(
    private readonly client: DouyinMaterialNotesDatabaseClient =
      SupabaseDB.getAdminClient() as unknown as DouyinMaterialNotesDatabaseClient,
  ) {}

  async listPublic(input: PublicIdentityInput & PageInput & { readonly keyword?: string }) {
    return execute('查询抖音资料列表失败', async () => {
      const columns = input.keyword ? PUBLIC_SEARCH_SELECT : PUBLIC_SELECT;
      let query = this.publicQuery(input, columns, { count: 'exact' });
      if (input.keyword) query = query.or(searchFilter(input.keyword), {
        referencedTable: 'published_version',
      });
      const result = await query.order('published_at', { ascending: false })
        .order('id', { ascending: false }).range(...pageRange(input));
      return pageResult(DouyinMaterialNoteRepositoryPublicRowSchema, result);
    });
  }

  async findPublicPreview(input: PublicIdentityInput & { readonly noteId: string }) {
    return execute('查询抖音资料详情失败', async () => {
      const result = await this.publicQuery(input, PUBLIC_SELECT)
        .eq('id', input.noteId).maybeSingle();
      return optionalResult(DouyinMaterialNoteRepositoryPublicRowSchema, result);
    });
  }

  async listTenant(input: PageInput & {
    readonly tenantId: string;
    readonly status?: DouyinMaterialNoteStatus;
    readonly keyword?: string;
  }) {
    return execute('查询租户抖音资料列表失败', async () => {
      const hasKeyword = Boolean(input.keyword);
      let query = this.client.from('douyin_material_notes')
        .select(TENANT_LIST_SELECT + (hasKeyword ? SEARCH_RELATION_SELECT : ''), {
          count: 'exact',
        }).eq('tenant_id', input.tenantId);
      if (input.status) query = query.eq('status', input.status);
      if (input.keyword) {
        query = query.or(searchFilter(input.keyword), {
          referencedTable: 'search_versions',
        }).limit(1, { referencedTable: 'search_versions' });
      }
      const result = await latestVersion(query).order('updated_at', { ascending: false })
        .order('id', { ascending: false }).range(...pageRange(input));
      if (!hasKeyword) {
        return pageResult(TenantDouyinMaterialNoteRepositoryListRowSchema, result);
      }
      const parsed = pageResult(
        TenantDouyinMaterialNoteRepositorySearchListRowSchema,
        result,
      );
      return {
        ...parsed,
        rows: parsed.rows.map(({ search_versions: _search, ...row }) => row),
      };
    });
  }

  async findTenantDetail(input: { readonly tenantId: string; readonly noteId: string }) {
    return execute('查询租户抖音资料详情失败', async () => {
      const result = await latestVersion(this.client.from('douyin_material_notes')
        .select(TENANT_DETAIL_SELECT).eq('tenant_id', input.tenantId)
        .eq('id', input.noteId)).maybeSingle();
      return optionalResult(TenantDouyinMaterialNoteRepositoryDetailRowSchema, result);
    });
  }

  async listVersions(input: PageInput & { readonly tenantId: string; readonly noteId: string }) {
    return execute('查询抖音资料版本失败', async () => {
      const result = await this.client.from('douyin_material_note_versions')
        .select(VERSION_SUMMARY_SELECT, { count: 'exact' }).eq('tenant_id', input.tenantId)
        .eq('note_id', input.noteId).order('created_at', { ascending: false })
        .order('id', { ascending: false }).range(...pageRange(input));
      return pageResult(TenantDouyinMaterialNoteRepositoryVersionSummarySchema, result);
    });
  }

  async findTenantVersionDetail(input: {
    readonly tenantId: string;
    readonly noteId: string;
    readonly versionId: string;
  }) {
    return execute('查询抖音资料版本详情失败', async () => {
      const result = await this.client.from('douyin_material_note_versions')
        .select(VERSION_DETAIL_SELECT).eq('tenant_id', input.tenantId)
        .eq('note_id', input.noteId).eq('id', input.versionId).maybeSingle();
      return optionalResult(TenantDouyinMaterialNoteRepositoryVersionSchema, result);
    });
  }

  async listCategories(input: PageInput & {
    readonly tenantId: string;
    readonly keyword?: string;
    readonly status?: 'active' | 'disabled';
  }) {
    return execute('查询抖音资料分类失败', async () => {
      let query = this.client.from('douyin_material_note_categories')
        .select(CATEGORY_SELECT, { count: 'exact' })
        .eq('tenant_id', input.tenantId)
        .is('deleted_at', null);
      if (input.status) query = query.eq('status', input.status);
      if (input.keyword) query = query.or(categorySearchFilter(input.keyword));
      const result = await query.order('sort_order', { ascending: true })
        .order('updated_at', { ascending: false })
        .order('id', { ascending: false })
        .range(...pageRange(input));
      return pageResult(TenantDouyinMaterialNoteCategoryRepositoryRowSchema, result);
    });
  }

  async createCategory(input: {
    readonly tenantId: string;
    readonly actorEmployeeId: string;
    readonly name: string;
    readonly description: string | null;
    readonly sortOrder: number;
  }) {
    return execute('创建抖音资料分类失败', async () => {
      const result = await this.client.from('douyin_material_note_categories')
        .insert({
          tenant_id: input.tenantId,
          name: input.name,
          description: input.description,
          status: 'active',
          sort_order: input.sortOrder,
          created_by: input.actorEmployeeId,
          updated_by: input.actorEmployeeId,
        })
        .select(CATEGORY_SELECT)
        .single();
      assertSuccess(result, '创建抖音资料分类失败');
      return parse(TenantDouyinMaterialNoteCategoryRepositoryRowSchema, result.data);
    });
  }

  async updateCategory(input: {
    readonly tenantId: string;
    readonly actorEmployeeId: string;
    readonly categoryId: string;
    readonly name?: string;
    readonly description?: string | null;
    readonly status?: 'active' | 'disabled';
    readonly sortOrder?: number;
  }) {
    return execute('更新抖音资料分类失败', async () => {
      const result = await this.client.from('douyin_material_note_categories')
        .update(removeUndefined({
          name: input.name,
          description: input.description,
          status: input.status,
          sort_order: input.sortOrder,
          updated_by: input.actorEmployeeId,
        }))
        .eq('tenant_id', input.tenantId)
        .eq('id', input.categoryId)
        .is('deleted_at', null)
        .select(CATEGORY_SELECT)
        .maybeSingle();
      assertSuccess(result, '更新抖音资料分类失败');
      if (result.data === null) {
        throw Errors.business(404, '资料分类不存在', 'MATERIAL_NOTE_CATEGORY_NOT_FOUND');
      }
      return parse(TenantDouyinMaterialNoteCategoryRepositoryRowSchema, result.data);
    });
  }

  async listOwned(input: PublicIdentityInput & PageInput) {
    return execute('查询我的抖音资料失败', async () => {
      const result = await this.ownedQuery(input, OWNED_SELECT, { count: 'exact' })
        .order('claimed_at', { ascending: false }).order('id', { ascending: false })
        .range(...pageRange(input));
      return pageResult(DouyinMaterialNoteRepositoryOwnedRowSchema, result);
    });
  }

  async findOwnedDetail(input: PublicIdentityInput & { readonly claimId: string }) {
    return execute('查询已领取抖音资料失败', async () => {
      const result = await this.ownedQuery(input, OWNED_DETAIL_SELECT)
        .eq('id', input.claimId).in('note.status', ['published', 'archived'])
        .maybeSingle();
      return optionalResult(DouyinMaterialNoteRepositoryOwnedDetailRowSchema, result);
    });
  }

  async findOwnedAccess(input: PublicIdentityInput & { readonly claimId: string }) {
    return execute('查询抖音资料领取状态失败', async () => {
      const result = await this.ownedQuery(input, OWNED_ACCESS_SELECT)
        .eq('id', input.claimId).maybeSingle();
      return optionalResult(DouyinMaterialNoteRepositoryOwnedAccessRowSchema, result);
    });
  }

  create(input: {
    readonly tenantId: string;
    readonly actorEmployeeId: string;
    readonly draft: DouyinMaterialNoteVersionDraft;
  }) {
    return this.draftCommand(
      'create_douyin_material_note',
      input,
      TenantDouyinMaterialNoteCreateResultSchema,
    );
  }

  appendVersion(input: {
    readonly tenantId: string;
    readonly noteId: string;
    readonly actorEmployeeId: string;
    readonly draft: DouyinMaterialNoteVersionDraft;
  }) {
    return this.draftCommand(
      'append_douyin_material_note_version',
      input,
      TenantDouyinMaterialNoteAppendResultSchema,
    );
  }

  transition(input: {
    readonly tenantId: string;
    readonly noteId: string;
    readonly actorEmployeeId: string;
    readonly command: 'publish' | 'archive' | 'withdraw';
    readonly targetVersionId: string | null;
    readonly expectedStatus: DouyinMaterialNoteStatus;
    readonly reason: string | null;
    readonly idempotencyKey: string;
  }) {
    return this.rpc('execute_douyin_material_note_state_command', {
      p_tenant_id: input.tenantId,
      p_note_id: input.noteId,
      p_actor_employee_id: input.actorEmployeeId,
      p_command: input.command,
      p_target_version_id: input.targetVersionId,
      p_expected_status: input.expectedStatus,
      p_reason: input.reason,
      p_idempotency_key: input.idempotencyKey,
    }, TenantDouyinMaterialNoteTransitionResultSchema, '执行抖音资料状态命令失败');
  }

  claim(input: PublicIdentityInput & { readonly noteId: string }) {
    return this.rpc('claim_douyin_material_note', publicRpcArgs(input, {
      p_note_id: input.noteId,
    }), DouyinMaterialNoteRepositoryClaimResponseSchema, '领取抖音资料失败');
  }

  async findMaterialImageAssets(input: {
    readonly tenantId: string;
    readonly fileIds: readonly string[];
  }) {
    if (input.fileIds.length === 0) return [];
    return execute('查询抖音资料图片素材失败', async () => {
      const result = await this.client.from('platform_file_objects')
        .select('id,tenant_id,public_url,object_key,width,height,mime_type,status,visibility')
        .eq('tenant_id', input.tenantId)
        .in('id', input.fileIds)
        .eq('status', 'active')
        .eq('visibility', 'public')
        .is('deleted_at', null);
      assertSuccess(result, '查询抖音资料图片素材失败');
      if (!Array.isArray(result.data)) throw invalidResponse();
      return parse(z.array(DouyinMaterialNoteRepositoryImageAssetRowSchema).max(100), result.data);
    });
  }

  remove(input: PublicIdentityInput & { readonly claimId: string }) {
    return this.rpc('remove_douyin_material_note_claim', publicRpcArgs(input, {
      p_claim_id: input.claimId,
    }), DouyinMaterialNoteRemoveResponseSchema, '移除已领取抖音资料失败');
  }

  clear(input: PublicIdentityInput) {
    return this.rpc('clear_douyin_material_note_claims', publicRpcArgs(input),
      DouyinMaterialNoteClearResponseSchema, '清空已领取抖音资料失败');
  }

  eraseSubjectData(input: PublicIdentityInput) {
    return this.rpc('erase_douyin_material_note_subject_data', publicRpcArgs(input),
      DouyinMaterialNoteErasureResultSchema, '删除抖音资料主体关联数据失败');
  }

  private publicQuery(
    input: PublicIdentityInput,
    columns: string,
    options?: { readonly count?: 'exact' },
  ) {
    return this.client.from('douyin_material_notes').select(columns, options)
      .eq('tenant_id', input.tenantId)
      .eq('status', 'published')
      .eq('claims.douyin_miniapp_installation_id', input.installationId)
      .eq('claims.subject_hash', input.subjectHash).is('claims.removed_at', null)
      .limit(1, { referencedTable: 'claims' });
  }

  private ownedQuery(
    input: PublicIdentityInput,
    columns: string,
    options?: { readonly count?: 'exact' },
  ) {
    return this.client.from('douyin_material_note_claims').select(columns, options)
      .eq('tenant_id', input.tenantId)
      .eq('douyin_miniapp_installation_id', input.installationId)
      .eq('subject_hash', input.subjectHash).is('removed_at', null);
  }

  private draftCommand<Schema extends z.ZodType>(
    name: 'create_douyin_material_note' | 'append_douyin_material_note_version',
    input: {
      readonly tenantId: string;
      readonly noteId?: string;
      readonly actorEmployeeId: string;
      readonly draft: DouyinMaterialNoteVersionDraft;
    },
    schema: Schema,
  ) {
    return this.rpc(name, {
      p_tenant_id: input.tenantId,
      ...(input.noteId ? { p_note_id: input.noteId } : {}),
      p_actor_employee_id: input.actorEmployeeId,
      p_title: input.draft.title,
      p_summary: input.draft.summary,
      p_category: input.draft.category,
      p_category_id: input.draft.category_id ?? null,
      p_applicable_to: input.draft.applicable_to,
      p_content_blocks: input.draft.content_blocks,
    }, schema, '保存抖音资料版本失败');
  }

  private async rpc<Schema extends z.ZodType>(name: MaterialNoteRpcName,
    args: Readonly<Record<string, unknown>>,
    schema: Schema,
    message: string,
  ): Promise<z.output<Schema>> {
    return execute(message, async () => {
      const result = await this.client.rpc(name, args);
      assertSuccess(result, message);
      return parse(schema, result.data);
    });
  }
}

function latestVersion(query: DouyinMaterialNotesQuery) {
  return query.order('version_no', {
    ascending: false,
    referencedTable: 'latest_versions',
  }).limit(1, { referencedTable: 'latest_versions' });
}

function publicRpcArgs(input: PublicIdentityInput, extra: Readonly<Record<string, unknown>> = {}) {
  return {
    p_tenant_id: input.tenantId,
    p_douyin_miniapp_installation_id: input.installationId,
    p_subject_hash: input.subjectHash,
    ...extra,
  };
}

export const douyinMaterialNotesRepository = new DouyinMaterialNotesRepository();
