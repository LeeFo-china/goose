import {
  DOUYIN_MATERIAL_NOTE_STATUS_VALUES,
  DouyinMaterialNoteClaimResponseSchema,
  type DouyinMaterialNoteStatus,
  type DouyinMaterialNoteVersionDraft,
} from '@gooes/domain';
import { z } from 'zod';

import { AppError } from '@/errors/app-error';
import { Errors } from '@/errors/error-factory';
import {
  DouyinMaterialNoteRepositoryOwnedDetailRowSchema,
  DouyinMaterialNoteRepositoryOwnedRowSchema,
  DouyinMaterialNoteRepositoryPublicRowSchema,
} from '@/schema/douyin-material-notes';
import {
  TenantDouyinMaterialNoteRepositoryDetailRowSchema,
  TenantDouyinMaterialNoteRepositoryListRowSchema,
  TenantDouyinMaterialNoteRepositorySearchListRowSchema,
  TenantDouyinMaterialNoteRepositoryVersionSchema,
} from '@/schema/tenant-douyin-material-notes';
import { SupabaseDB } from '@/utils/supabase';

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
  or(filters: string, options?: ReferencedTableOptions): DouyinMaterialNotesQuery;
  order(column: string, options: OrderOptions): DouyinMaterialNotesQuery;
  range(from: number, to: number): DouyinMaterialNotesQuery;
  limit(count: number, options?: ReferencedTableOptions): DouyinMaterialNotesQuery;
  maybeSingle(): Promise<DouyinMaterialNotesDatabaseResult>;
}

const MATERIAL_NOTE_RPC_NAMES = [
  'create_douyin_material_note',
  'append_douyin_material_note_version',
  'execute_douyin_material_note_state_command',
  'claim_douyin_material_note',
  'remove_douyin_material_note_claim',
  'clear_douyin_material_note_claims',
] as const;
type MaterialNoteRpcName = typeof MATERIAL_NOTE_RPC_NAMES[number];

export interface DouyinMaterialNotesDatabaseClient {
  from(table: string): DouyinMaterialNotesQuery;
  rpc(
    name: MaterialNoteRpcName,
    args: Readonly<Record<string, unknown>>,
  ): PromiseLike<DouyinMaterialNotesDatabaseResult>;
}

const DateTimeSchema = z.iso.datetime({ offset: true });
const CreateResultSchema = z.strictObject({
  note_id: z.uuid(),
  version_id: z.uuid(),
  version_no: z.number().int().positive(),
  status: z.literal('draft'),
});
const AppendResultSchema = CreateResultSchema.extend({
  status: z.enum(DOUYIN_MATERIAL_NOTE_STATUS_VALUES),
}).strict();
const TransitionResultSchema = z.strictObject({
  note_id: z.uuid(),
  status: z.enum(DOUYIN_MATERIAL_NOTE_STATUS_VALUES),
  published_version_id: z.uuid().nullable(),
  published_at: DateTimeSchema.nullable(),
}).superRefine((value, context) => {
  if (
    value.status === 'published'
    && (value.published_version_id === null || value.published_at === null)
  ) {
    context.addIssue({
      code: 'custom',
      path: ['published_version_id'],
      message: '已发布资料必须包含发布版本和时间',
    });
  }
});
const RemoveResultSchema = z.strictObject({ removed: z.literal(true) });
const ClearResultSchema = z.strictObject({
  removed_count: z.number().int().nonnegative(),
});

const PUBLIC_SELECT = [
  'id,published_at',
  'published_version:douyin_material_note_versions!douyin_material_notes_published_version_owner_fkey(title,summary,category,applicable_to)',
  'claims:douyin_material_note_claims!douyin_material_note_claims_note_tenant_fkey(id)',
].join(',');
const TENANT_LIST_SELECT = [
  'id,status,published_at,updated_at',
  'latest_versions:douyin_material_note_versions!douyin_material_note_versions_note_tenant_fkey(version_no,title,category)',
  'claims:douyin_material_note_claims!douyin_material_note_claims_note_tenant_fkey(count)',
].join(',');
const SEARCH_RELATION_SELECT =
  ',search_versions:douyin_material_note_versions!douyin_material_note_versions_note_tenant_fkey!inner(id)';
const VERSION_SELECT =
  'id,note_id,version_no,title,summary,category,applicable_to,content_blocks,created_by,created_at';
const TENANT_DETAIL_SELECT = [
  'id,status,published_version_id,published_at,created_at,updated_at',
  `latest_versions:douyin_material_note_versions!douyin_material_note_versions_note_tenant_fkey(${VERSION_SELECT})`,
  'claims:douyin_material_note_claims!douyin_material_note_claims_note_tenant_fkey(count)',
].join(',');
const OWNED_SELECT = [
  'id,claimed_at',
  'note:douyin_material_notes!douyin_material_note_claims_note_tenant_fkey(id,status)',
  'claimed_version:douyin_material_note_versions!douyin_material_note_claims_version_owner_fkey(version_no,title,summary,category,applicable_to)',
].join(',');
const OWNED_DETAIL_SELECT = OWNED_SELECT.replace(
  'version_no,title,summary,category,applicable_to)',
  'id,version_no,title,summary,category,applicable_to,content_blocks,created_by,created_at)',
);

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
      let query = this.publicQuery(input, PUBLIC_SELECT, { count: 'exact' });
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
        .select(VERSION_SELECT, { count: 'exact' }).eq('tenant_id', input.tenantId)
        .eq('note_id', input.noteId).order('version_no', { ascending: false })
        .order('id', { ascending: false }).range(...pageRange(input));
      return pageResult(TenantDouyinMaterialNoteRepositoryVersionSchema, result);
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
        .eq('id', input.claimId).maybeSingle();
      return optionalResult(DouyinMaterialNoteRepositoryOwnedDetailRowSchema, result);
    });
  }

  create(input: {
    readonly tenantId: string;
    readonly actorEmployeeId: string;
    readonly draft: DouyinMaterialNoteVersionDraft;
  }) {
    return this.draftCommand('create_douyin_material_note', input, CreateResultSchema);
  }

  appendVersion(input: {
    readonly tenantId: string;
    readonly noteId: string;
    readonly actorEmployeeId: string;
    readonly draft: DouyinMaterialNoteVersionDraft;
  }) {
    return this.draftCommand('append_douyin_material_note_version', input, AppendResultSchema);
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
    }, TransitionResultSchema, '执行抖音资料状态命令失败');
  }

  claim(input: PublicIdentityInput & { readonly noteId: string }) {
    return this.rpc('claim_douyin_material_note', publicRpcArgs(input, {
      p_note_id: input.noteId,
    }), DouyinMaterialNoteClaimResponseSchema, '领取抖音资料失败');
  }

  remove(input: PublicIdentityInput & { readonly claimId: string }) {
    return this.rpc('remove_douyin_material_note_claim', publicRpcArgs(input, {
      p_claim_id: input.claimId,
    }), RemoveResultSchema, '移除已领取抖音资料失败');
  }

  clear(input: PublicIdentityInput) {
    return this.rpc('clear_douyin_material_note_claims', publicRpcArgs(input),
      ClearResultSchema, '清空已领取抖音资料失败');
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

function pageRange(input: PageInput): [number, number] {
  const from = (input.page - 1) * input.pageSize;
  return [from, from + input.pageSize - 1];
}

function searchFilter(keyword: string): string {
  const escaped = keyword.replace(/\\/g, '\\\\').replace(/[%_(),]/g, '\\$&');
  return ['title', 'summary', 'category']
    .map((column) => `${column}.ilike.%${escaped}%`).join(',');
}

function pageResult<Schema extends z.ZodType>(
  schema: Schema,
  result: DouyinMaterialNotesDatabaseResult,
) {
  assertSuccess(result, '查询抖音资料分页失败');
  if (!Number.isSafeInteger(result.count) || result.count! < 0) {
    throw invalidResponse();
  }
  return { rows: parse(z.array(schema).max(100), result.data ?? []), total: result.count! };
}

function optionalResult<Schema extends z.ZodType>(
  schema: Schema,
  result: DouyinMaterialNotesDatabaseResult,
): z.output<Schema> | null {
  assertSuccess(result, '查询抖音资料详情失败');
  return result.data === null ? null : parse(schema, result.data);
}

function parse<Schema extends z.ZodType>(schema: Schema, value: unknown): z.output<Schema> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw invalidResponse();
  return parsed.data;
}

function assertSuccess(result: DouyinMaterialNotesDatabaseResult, message: string): void {
  if (!result.error) return;
  throw databaseFailure(result.error, message);
}

async function execute<Result>(message: string, operation: () => Promise<Result>) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw Errors.dbError(message);
  }
}

function invalidResponse(): AppError {
  return Errors.business(
    500,
    '抖音资料数据库响应格式无效',
    'MATERIAL_NOTE_REPOSITORY_RESPONSE_INVALID',
  );
}

function databaseFailure(error: unknown, fallbackMessage: string): AppError {
  const text = errorText(error);
  const mappings: ReadonlyArray<readonly [string, number, string]> = [
    ['MATERIAL_NOTE_CLAIM_NOT_FOUND', 404, '领取记录不存在'],
    ['MATERIAL_NOTE_NOT_FOUND', 404, '资料不存在'],
    ['MATERIAL_NOTE_NOT_AVAILABLE', 409, '资料当前不可领取'],
    ['MATERIAL_NOTE_VERSION_CONFLICT', 409, '资料版本冲突'],
    ['MATERIAL_NOTE_STATE_CONFLICT', 409, '资料状态已变化'],
    ['MATERIAL_NOTE_IDEMPOTENCY_CONFLICT', 409, '幂等键已用于不同请求'],
    ['MATERIAL_NOTE_WITHDRAWN', 410, '资料已停止提供'],
    ['MATERIAL_NOTE_INVALID_INPUT', 400, '资料命令参数无效'],
    ['MATERIAL_NOTE_TENANT_NOT_ACTIVE', 409, '租户当前不可执行资料命令'],
    ['MATERIAL_NOTE_ACTOR_NOT_ACTIVE', 409, '员工当前不可执行资料命令'],
    ['MATERIAL_NOTE_INSTALLATION_NOT_ACTIVE', 409, '小程序安装当前不可用'],
  ];
  for (const [code, statusCode, message] of mappings) {
    if (text.includes(code)) return Errors.business(statusCode, message, code);
  }
  return Errors.dbError(fallbackMessage);
}

function errorText(error: unknown): string {
  if (typeof error === 'string') return error;
  if (typeof error !== 'object' || error === null) return '';
  const values = ['message', 'details', 'hint', 'code'].map((key) => {
    const value = (error as Record<string, unknown>)[key];
    return typeof value === 'string' ? value : '';
  });
  return values.join(' ');
}

export const douyinMaterialNotesRepository = new DouyinMaterialNotesRepository();
