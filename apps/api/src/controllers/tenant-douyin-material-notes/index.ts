import type { FastifyRequest } from 'fastify';
import type { z } from 'zod';

import { TenantBaseController } from '@/controllers/TenantBaseController';
import { Errors } from '@/errors/error-factory';
import { PaginationQuerySchema } from '@/schema/request';
import {
  CreateTenantDouyinMaterialNoteSchema,
  CreateTenantDouyinMaterialNoteVersionSchema,
  TenantDouyinMaterialNoteArchiveSchema,
  TenantDouyinMaterialNoteCategoryCreateSchema,
  TenantDouyinMaterialNoteCategoryListQuerySchema,
  TenantDouyinMaterialNoteCategoryParamsSchema,
  TenantDouyinMaterialNoteCategoryUpdateSchema,
  TenantDouyinMaterialNoteCommandHeadersSchema,
  TenantDouyinMaterialNoteIdParamsSchema,
  TenantDouyinMaterialNoteListQuerySchema,
  TenantDouyinMaterialNotePublishSchema,
  TenantDouyinMaterialNoteVersionParamsSchema,
  TenantDouyinMaterialNoteWithdrawSchema,
} from '@/schema/tenant-douyin-material-notes';
import {
  tenantDouyinMaterialNotesService,
  type TenantDouyinMaterialNotesService,
} from '@/services/tenant-douyin-material-notes';
import { Get, Patch, Post } from '@/utils/decorators/route';
import { ResponseHandler } from '@/utils/response';

type ServicePort = Pick<TenantDouyinMaterialNotesService,
  'list' | 'create' | 'listCategories' | 'createCategory' | 'updateCategory' |
  'getDetail' | 'listVersions' | 'getVersionDetail' |
  'appendVersion' | 'publish' | 'archive' | 'withdraw'>;

export class TenantDouyinMaterialNotesController extends TenantBaseController {
  constructor(
    private readonly service: ServicePort = tenantDouyinMaterialNotesService,
  ) {
    super('tenant-douyin-material-notes');
  }

  @Get('/tenant/douyin-material-notes')
  async listNotes(request: FastifyRequest) {
    const query = parse(TenantDouyinMaterialNoteListQuerySchema, request.query || {});
    const authContext = await this.getRequiredTenantContext(request);
    return ResponseHandler.success(await this.service.list(authContext, query));
  }

  @Post('/tenant/douyin-material-notes')
  async createNote(request: FastifyRequest) {
    const body = parse(CreateTenantDouyinMaterialNoteSchema, request.body || {});
    const authContext = await this.getRequiredTenantContext(request);
    return ResponseHandler.success(await this.service.create(authContext, body));
  }

  @Get('/tenant/douyin-material-note-categories')
  async listCategories(request: FastifyRequest) {
    const query = parse(
      TenantDouyinMaterialNoteCategoryListQuerySchema,
      request.query || {},
    );
    const authContext = await this.getRequiredTenantContext(request);
    return ResponseHandler.success(
      await this.service.listCategories(authContext, query),
    );
  }

  @Post('/tenant/douyin-material-note-categories')
  async createCategory(request: FastifyRequest) {
    const body = parse(
      TenantDouyinMaterialNoteCategoryCreateSchema,
      request.body || {},
    );
    const authContext = await this.getRequiredTenantContext(request);
    return ResponseHandler.success(
      await this.service.createCategory(authContext, body),
    );
  }

  @Patch('/tenant/douyin-material-note-categories/:id')
  async updateCategory(request: FastifyRequest) {
    const { id } = parse(
      TenantDouyinMaterialNoteCategoryParamsSchema,
      request.params || {},
    );
    const body = parse(
      TenantDouyinMaterialNoteCategoryUpdateSchema,
      request.body || {},
    );
    const authContext = await this.getRequiredTenantContext(request);
    return ResponseHandler.success(
      await this.service.updateCategory(authContext, id, body),
    );
  }

  @Get('/tenant/douyin-material-notes/:id')
  async getDetail(request: FastifyRequest) {
    const { id } = parse(TenantDouyinMaterialNoteIdParamsSchema, request.params || {});
    const authContext = await this.getRequiredTenantContext(request);
    return ResponseHandler.success(await this.service.getDetail(authContext, id));
  }

  @Get('/tenant/douyin-material-notes/:id/versions')
  async listVersions(request: FastifyRequest) {
    const { id } = parse(TenantDouyinMaterialNoteIdParamsSchema, request.params || {});
    const query = parse(PaginationQuerySchema, request.query || {});
    const authContext = await this.getRequiredTenantContext(request);
    return ResponseHandler.success(
      await this.service.listVersions(authContext, id, query),
    );
  }

  @Get('/tenant/douyin-material-notes/:id/versions/:versionId')
  async getVersionDetail(request: FastifyRequest) {
    const params = parse(TenantDouyinMaterialNoteVersionParamsSchema, request.params || {});
    const authContext = await this.getRequiredTenantContext(request);
    return ResponseHandler.success(
      await this.service.getVersionDetail(authContext, params.id, params.versionId),
    );
  }

  @Post('/tenant/douyin-material-notes/:id/versions')
  async appendVersion(request: FastifyRequest) {
    const { id } = parse(TenantDouyinMaterialNoteIdParamsSchema, request.params || {});
    const body = parse(CreateTenantDouyinMaterialNoteVersionSchema, request.body || {});
    const authContext = await this.getRequiredTenantContext(request);
    return ResponseHandler.success(
      await this.service.appendVersion(authContext, id, body),
    );
  }

  @Post('/tenant/douyin-material-notes/:id/publish')
  async publish(request: FastifyRequest) {
    const command = parseCommand(request, TenantDouyinMaterialNotePublishSchema);
    const authContext = await this.getRequiredTenantContext(request);
    return ResponseHandler.success(await this.service.publish(
      authContext,
      command.id,
      command.body,
      command.idempotencyKey,
    ));
  }

  @Post('/tenant/douyin-material-notes/:id/archive')
  async archive(request: FastifyRequest) {
    const command = parseCommand(request, TenantDouyinMaterialNoteArchiveSchema);
    const authContext = await this.getRequiredTenantContext(request);
    return ResponseHandler.success(await this.service.archive(
      authContext,
      command.id,
      command.body,
      command.idempotencyKey,
    ));
  }

  @Post('/tenant/douyin-material-notes/:id/withdraw')
  async withdraw(request: FastifyRequest) {
    const command = parseCommand(request, TenantDouyinMaterialNoteWithdrawSchema);
    const authContext = await this.getRequiredTenantContext(request);
    return ResponseHandler.success(await this.service.withdraw(
      authContext,
      command.id,
      command.body,
      command.idempotencyKey,
    ));
  }
}

function parseCommand<Schema extends z.ZodType>(request: FastifyRequest, schema: Schema) {
  const { id } = parse(TenantDouyinMaterialNoteIdParamsSchema, request.params || {});
  const headers = parse(TenantDouyinMaterialNoteCommandHeadersSchema, request.headers || {});
  const body = parse(schema, request.body || {});
  return { id, body, idempotencyKey: headers['idempotency-key'] };
}

function parse<Schema extends z.ZodType>(
  schema: Schema,
  value: unknown,
): z.output<Schema> {
  const result = schema.safeParse(value);
  if (!result.success) throw Errors.fromZod(result.error);
  return result.data;
}

export default new TenantDouyinMaterialNotesController();
