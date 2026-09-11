import type { FastifyRequest } from 'fastify';
import type { z } from 'zod';
import { TenantBaseController } from '@/controllers/TenantBaseController';
import { Errors } from '@/errors/error-factory';
import { RenderingLibraryListSchema, RenderingLibraryCreateSchema, RenderingLibraryUpdateSchema,
  RenderingLibraryVersionSchema, RenderingLibraryParamsSchema, RenderingLibraryEmptyQuerySchema } from '@/schema/tenant-rendering-library';
import { tenantRenderingLibraryService, type TenantRenderingLibraryService } from '@/services/tenant-rendering-library';
import { Get, Post, Patch, Delete } from '@/utils/decorators/route';
import { ResponseHandler } from '@/utils/response';

type ServicePort = Pick<TenantRenderingLibraryService, 'list' | 'get' | 'create' | 'update' | 'hide' | 'remove'>;

export class TenantRenderingLibraryController extends TenantBaseController {
  constructor(private readonly service: ServicePort = tenantRenderingLibraryService) {
    super('tenant_rendering_styles');
  }

  private parse<Output>(schema: z.ZodType<Output>, input: unknown): Output {
    const result = schema.safeParse(input);
    if (!result.success) throw Errors.fromZod(result.error);
    return result.data;
  }

  @Get('/tenant/rendering-library/styles')
  async listStyles(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const query = this.parse(RenderingLibraryListSchema, request.query ?? {});
    return ResponseHandler.success(await this.service.list(auth, query));
  }

  @Get('/tenant/rendering-library/styles/:id')
  async getStyle(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const { id } = this.parse(RenderingLibraryParamsSchema, request.params);
    this.parse(RenderingLibraryEmptyQuerySchema, request.query ?? {});
    return ResponseHandler.success(await this.service.get(auth, id));
  }

  @Post('/tenant/rendering-library/styles')
  async createStyle(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    this.parse(RenderingLibraryEmptyQuerySchema, request.query ?? {});
    const body = this.parse(RenderingLibraryCreateSchema, request.body);
    return ResponseHandler.success(await this.service.create(auth, body));
  }

  @Patch('/tenant/rendering-library/styles/:id')
  async updateStyle(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const { id } = this.parse(RenderingLibraryParamsSchema, request.params);
    this.parse(RenderingLibraryEmptyQuerySchema, request.query ?? {});
    const body = this.parse(RenderingLibraryUpdateSchema, request.body);
    return ResponseHandler.success(await this.service.update(auth, id, body));
  }

  @Post('/tenant/rendering-library/styles/:id/hide')
  async hideStyle(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const { id } = this.parse(RenderingLibraryParamsSchema, request.params);
    this.parse(RenderingLibraryEmptyQuerySchema, request.query ?? {});
    const body = this.parse(RenderingLibraryVersionSchema, request.body);
    return ResponseHandler.success(await this.service.hide(auth, id, body));
  }

  @Delete('/tenant/rendering-library/styles/:id')
  async removeStyle(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const { id } = this.parse(RenderingLibraryParamsSchema, request.params);
    this.parse(RenderingLibraryEmptyQuerySchema, request.query ?? {});
    const body = this.parse(RenderingLibraryVersionSchema, request.body);
    return ResponseHandler.success(await this.service.remove(auth, id, body));
  }
}

export default new TenantRenderingLibraryController();
