import {
  type DouyinMaterialNoteTenantDetail,
  type DouyinMaterialNoteTenantSummary,
  type DouyinMaterialNoteTenantVersion,
  type DouyinMaterialNoteTenantVersionSummary,
} from '@gooes/domain';
import type { z } from 'zod';

import { Errors } from '@/errors/error-factory';
import {
  douyinMaterialNotesRepository,
  type DouyinMaterialNotesRepository,
} from '@/repositories/douyin-material-notes';
import { PaginationQuerySchema, type PaginationQuery } from '@/schema/request';
import {
  CreateTenantDouyinMaterialNoteSchema,
  CreateTenantDouyinMaterialNoteVersionSchema,
  TenantDouyinMaterialNoteArchiveSchema,
  TenantDouyinMaterialNoteCommandHeadersSchema,
  TenantDouyinMaterialNoteDetailResponseSchema,
  TenantDouyinMaterialNoteIdParamsSchema,
  TenantDouyinMaterialNoteListQuerySchema,
  TenantDouyinMaterialNoteListResponseSchema,
  TenantDouyinMaterialNotePublishSchema,
  TenantDouyinMaterialNoteVersionDetailResponseSchema,
  TenantDouyinMaterialNoteVersionListResponseSchema,
  TenantDouyinMaterialNoteVersionParamsSchema,
  TenantDouyinMaterialNoteWithdrawSchema,
  type CreateTenantDouyinMaterialNoteInput,
  type CreateTenantDouyinMaterialNoteVersionInput,
  type TenantDouyinMaterialNoteListQuery,
  type TenantDouyinMaterialNotePublishInput,
  type TenantDouyinMaterialNoteReasonCommandInput,
} from '@/schema/tenant-douyin-material-notes';
import { accessPolicyService } from '@/services/access-policy';
import type { AuthContext } from '@/services/authorization';

const READ_PERMISSION = 'douyin_material_note.read';
const MANAGE_PERMISSION = 'douyin_material_note.manage';
const PUBLISH_PERMISSION = 'douyin_material_note.publish';

type RepositoryPort = Pick<DouyinMaterialNotesRepository,
  'listTenant' | 'findTenantDetail' | 'listVersions' |
  'findTenantVersionDetail' | 'create' | 'appendVersion' | 'transition'>;
type AccessPolicyPort = Pick<typeof accessPolicyService,
  'assertTenantContext' | 'assertPermission'>;
type TenantListRow = Awaited<ReturnType<RepositoryPort['listTenant']>>['rows'][number];
type TenantDetailRow = NonNullable<Awaited<
  ReturnType<RepositoryPort['findTenantDetail']>
>>;
type TenantVersionRow = NonNullable<Awaited<
  ReturnType<RepositoryPort['findTenantVersionDetail']>
>>;
type TenantVersionSummaryRow = Awaited<
  ReturnType<RepositoryPort['listVersions']>
>['rows'][number];

type TransitionCommand = 'publish' | 'archive' | 'withdraw';

export class TenantDouyinMaterialNotesService {
  constructor(private readonly dependencies: {
    readonly repository: RepositoryPort;
    readonly accessPolicy: AccessPolicyPort;
  }) {}

  async list(authContext: AuthContext, input: TenantDouyinMaterialNoteListQuery) {
    const tenantId = this.requirePermission(authContext, READ_PERMISSION);
    const query = parseInput(TenantDouyinMaterialNoteListQuerySchema, input);
    const result = await this.dependencies.repository.listTenant({
      tenantId,
      ...query,
    });
    return parseOutput(TenantDouyinMaterialNoteListResponseSchema, {
      list: result.rows.map(mapTenantSummary),
      pagination: pagination(query, result.total),
    });
  }

  async getDetail(authContext: AuthContext, noteId: string) {
    const tenantId = this.requirePermission(authContext, READ_PERMISSION);
    const { id } = parseInput(TenantDouyinMaterialNoteIdParamsSchema, { id: noteId });
    const row = await this.dependencies.repository.findTenantDetail({
      tenantId,
      noteId: id,
    });
    if (!row) throwNotFound();
    return parseOutput(TenantDouyinMaterialNoteDetailResponseSchema, mapTenantDetail(row));
  }

  async listVersions(
    authContext: AuthContext,
    noteId: string,
    input: PaginationQuery,
  ) {
    const tenantId = this.requirePermission(authContext, READ_PERMISSION);
    const { id } = parseInput(TenantDouyinMaterialNoteIdParamsSchema, { id: noteId });
    const query = parseInput(PaginationQuerySchema, input);
    const result = await this.dependencies.repository.listVersions({
      tenantId,
      noteId: id,
      ...query,
    });
    if (result.total === 0) {
      if (result.rows.length > 0) throwInvalidResponse();
      throwNotFound();
    }
    return parseOutput(TenantDouyinMaterialNoteVersionListResponseSchema, {
      list: result.rows.map(mapVersionSummary),
      pagination: pagination(query, result.total),
    });
  }

  async getVersionDetail(
    authContext: AuthContext,
    noteId: string,
    versionId: string,
  ) {
    const tenantId = this.requirePermission(authContext, READ_PERMISSION);
    const params = parseInput(TenantDouyinMaterialNoteVersionParamsSchema, {
      id: noteId,
      versionId,
    });
    const row = await this.dependencies.repository.findTenantVersionDetail({
      tenantId,
      noteId: params.id,
      versionId: params.versionId,
    });
    if (!row) throwNotFound();
    return parseOutput(
      TenantDouyinMaterialNoteVersionDetailResponseSchema,
      mapVersion(row),
    );
  }

  async create(authContext: AuthContext, input: CreateTenantDouyinMaterialNoteInput) {
    const identity = this.requireWriteIdentity(authContext, MANAGE_PERMISSION);
    const draft = parseInput(CreateTenantDouyinMaterialNoteSchema, input);
    return await this.dependencies.repository.create({ ...identity, draft });
  }

  async appendVersion(
    authContext: AuthContext,
    noteId: string,
    input: CreateTenantDouyinMaterialNoteVersionInput,
  ) {
    const identity = this.requireWriteIdentity(authContext, MANAGE_PERMISSION);
    const { id } = parseInput(TenantDouyinMaterialNoteIdParamsSchema, { id: noteId });
    const draft = parseInput(CreateTenantDouyinMaterialNoteVersionSchema, input);
    return await this.dependencies.repository.appendVersion({
      ...identity,
      noteId: id,
      draft,
    });
  }

  async publish(
    authContext: AuthContext,
    noteId: string,
    input: TenantDouyinMaterialNotePublishInput,
    idempotencyKey: string,
  ) {
    const body = parseInput(TenantDouyinMaterialNotePublishSchema, input);
    return await this.transition(authContext, noteId, 'publish', body, idempotencyKey);
  }

  async archive(
    authContext: AuthContext,
    noteId: string,
    input: TenantDouyinMaterialNoteReasonCommandInput,
    idempotencyKey: string,
  ) {
    const body = parseInput(TenantDouyinMaterialNoteArchiveSchema, input);
    return await this.transition(authContext, noteId, 'archive', body, idempotencyKey);
  }

  async withdraw(
    authContext: AuthContext,
    noteId: string,
    input: TenantDouyinMaterialNoteReasonCommandInput,
    idempotencyKey: string,
  ) {
    const body = parseInput(TenantDouyinMaterialNoteWithdrawSchema, input);
    return await this.transition(authContext, noteId, 'withdraw', body, idempotencyKey);
  }

  private async transition(
    authContext: AuthContext,
    noteId: string,
    command: TransitionCommand,
    input: TenantDouyinMaterialNotePublishInput | TenantDouyinMaterialNoteReasonCommandInput,
    idempotencyKey: string,
  ) {
    const identity = this.requireWriteIdentity(authContext, PUBLISH_PERMISSION);
    const { id } = parseInput(TenantDouyinMaterialNoteIdParamsSchema, { id: noteId });
    const headers = parseInput(TenantDouyinMaterialNoteCommandHeadersSchema, {
      'idempotency-key': idempotencyKey,
    });
    return await this.dependencies.repository.transition({
      ...identity,
      noteId: id,
      command,
      targetVersionId: command === 'publish'
        ? ('version_id' in input ? input.version_id : null)
        : null,
      expectedStatus: input.expected_status,
      reason: command === 'publish'
        ? null
        : ('reason' in input ? input.reason : null),
      idempotencyKey: headers['idempotency-key'],
    });
  }

  private requirePermission(authContext: AuthContext, permission: string): string {
    const tenantId = this.dependencies.accessPolicy.assertTenantContext(authContext);
    this.dependencies.accessPolicy.assertPermission(authContext, permission);
    return tenantId;
  }

  private requireWriteIdentity(authContext: AuthContext, permission: string) {
    const tenantId = this.requirePermission(authContext, permission);
    if (!authContext.employeeId) {
      throw Errors.business(
        403,
        '当前操作需要有效员工身份',
        'MATERIAL_NOTE_EMPLOYEE_REQUIRED',
      );
    }
    return { tenantId, actorEmployeeId: authContext.employeeId };
  }
}

function mapTenantSummary(row: TenantListRow): DouyinMaterialNoteTenantSummary {
  const latest = row.latest_versions[0];
  const claimCount = row.claims[0]?.count;
  if (!latest || claimCount === undefined) throwInvalidResponse();
  return {
    id: row.id,
    status: row.status,
    title: latest.title,
    category: latest.category,
    current_version: latest.version_no,
    claim_count: claimCount,
    published_at: row.published_at,
    updated_at: row.updated_at,
  };
}

function mapTenantDetail(row: TenantDetailRow): DouyinMaterialNoteTenantDetail {
  const latest = row.latest_versions[0];
  const claimCount = row.claims[0]?.count;
  if (!latest || claimCount === undefined) throwInvalidResponse();
  return {
    ...mapTenantSummary({
      id: row.id,
      status: row.status,
      published_at: row.published_at,
      updated_at: row.updated_at,
      latest_versions: [latest],
      claims: row.claims,
    }),
    published_version_id: row.published_version_id,
    latest_version: mapVersionSummary(latest),
    created_at: row.created_at,
  };
}

function mapVersion(row: TenantVersionRow): DouyinMaterialNoteTenantVersion {
  const { version_no, ...fields } = row;
  return { ...fields, version: version_no };
}

function mapVersionSummary(
  row: TenantVersionSummaryRow,
): DouyinMaterialNoteTenantVersionSummary {
  const { version_no, ...fields } = row;
  return { ...fields, version: version_no };
}

function pagination(input: PaginationQuery, total: number) {
  if (!Number.isSafeInteger(total) || total < 0) throwInvalidResponse();
  return {
    page: input.page,
    pageSize: input.pageSize,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / input.pageSize),
  };
}

function parseInput<Schema extends z.ZodType>(
  schema: Schema,
  value: unknown,
): z.output<Schema> {
  const result = schema.safeParse(value);
  if (!result.success) throw Errors.fromZod(result.error);
  return result.data;
}

function parseOutput<Schema extends z.ZodType>(
  schema: Schema,
  value: unknown,
): z.output<Schema> {
  const result = schema.safeParse(value);
  if (!result.success) throwInvalidResponse();
  return result.data;
}

function throwNotFound(): never {
  throw Errors.business(404, '资料不存在', 'MATERIAL_NOTE_NOT_FOUND');
}

function throwInvalidResponse(): never {
  throw Errors.business(
    500,
    '租户抖音资料响应格式无效',
    'MATERIAL_NOTE_RESPONSE_INVALID',
  );
}

export const tenantDouyinMaterialNotesService = new TenantDouyinMaterialNotesService({
  repository: douyinMaterialNotesRepository,
  accessPolicy: accessPolicyService,
});
