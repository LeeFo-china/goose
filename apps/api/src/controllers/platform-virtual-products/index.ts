import { PlatformBaseController } from '../PlatformBaseController';
import { Errors } from '../../errors/error-factory';
import {
  CreatePlatformVirtualProductSchema,
  PlatformVirtualProductListQuerySchema,
  PlatformVirtualProductParamsSchema,
  PlatformVirtualProductVersionCommandSchema,
  UpdatePlatformVirtualProductSchema,
} from '../../schema/platform-virtual-products';
import { platformVirtualProductsService } from '../../services/platform-virtual-products';
import { Get, Patch, Post } from '../../utils/decorators/route';
import { ResponseHandler } from '../../utils/response';
import type { FastifyRequest } from 'fastify';
import type { ZodType } from 'zod';

function parse<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input ?? {});
  if (!result.success) throw Errors.fromZod(result.error);
  return result.data;
}

class PlatformVirtualProductsController extends PlatformBaseController {
  constructor() {
    super('platform-virtual-products');
  }

  @Get('/platform/virtual-products')
  async listProducts(request: FastifyRequest) {
    const auth = await this.getRequiredPlatformAdminContext(request);
    const query = parse(PlatformVirtualProductListQuerySchema, request.query);
    return ResponseHandler.success(
      await platformVirtualProductsService.list(auth, query),
    );
  }

  @Post('/platform/virtual-products')
  async createProduct(request: FastifyRequest) {
    const auth = await this.getRequiredPlatformAdminContext(request);
    const input = parse(CreatePlatformVirtualProductSchema, request.body);
    return ResponseHandler.success(
      await platformVirtualProductsService.create(auth, input),
    );
  }

  @Get('/platform/virtual-products/:id')
  async getDetail(request: FastifyRequest) {
    const auth = await this.getRequiredPlatformAdminContext(request);
    const { id } = parse(PlatformVirtualProductParamsSchema, request.params);
    return ResponseHandler.success(
      await platformVirtualProductsService.getDetail(auth, id),
    );
  }

  @Patch('/platform/virtual-products/:id')
  async updateProduct(request: FastifyRequest) {
    const auth = await this.getRequiredPlatformAdminContext(request);
    const { id } = parse(PlatformVirtualProductParamsSchema, request.params);
    const input = parse(UpdatePlatformVirtualProductSchema, request.body);
    return ResponseHandler.success(
      await platformVirtualProductsService.update(auth, id, input),
    );
  }

  @Post('/platform/virtual-products/:id/activate')
  async activate(request: FastifyRequest) {
    const auth = await this.getRequiredPlatformAdminContext(request);
    const { id } = parse(PlatformVirtualProductParamsSchema, request.params);
    const input = parse(PlatformVirtualProductVersionCommandSchema, request.body);
    return ResponseHandler.success(
      await platformVirtualProductsService.activate(auth, id, input),
    );
  }

  @Post('/platform/virtual-products/:id/suspend')
  async suspend(request: FastifyRequest) {
    const auth = await this.getRequiredPlatformAdminContext(request);
    const { id } = parse(PlatformVirtualProductParamsSchema, request.params);
    const input = parse(PlatformVirtualProductVersionCommandSchema, request.body);
    return ResponseHandler.success(
      await platformVirtualProductsService.suspend(auth, id, input),
    );
  }

  @Post('/platform/virtual-products/:id/archive')
  async archive(request: FastifyRequest) {
    const auth = await this.getRequiredPlatformAdminContext(request);
    const { id } = parse(PlatformVirtualProductParamsSchema, request.params);
    const input = parse(PlatformVirtualProductVersionCommandSchema, request.body);
    return ResponseHandler.success(
      await platformVirtualProductsService.archive(auth, id, input),
    );
  }
}

export default new PlatformVirtualProductsController();
