import { PlatformBaseController } from "@/controllers/PlatformBaseController";
import { Errors } from "@/errors/error-factory";
import {
  PlatformServiceProductActionSchema,
  PlatformServiceProductDraftSchema,
  PlatformServiceProductListQuerySchema,
  PlatformServiceProductParamSchema,
  PlatformServiceProductUpdateSchema,
} from "@/schema/platform-service-products";
import { Get, Patch, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyRequest } from "fastify";

const SERVICE_MODULE = "../../services/platform-service-products";

async function service() {
  return (await import(SERVICE_MODULE)).platformServiceProductService;
}

class PlatformServiceProductsController extends PlatformBaseController {
  constructor() {
    super("platform-service-products");
  }

  @Get("/platform/billing/service-products")
  async listProducts(request: FastifyRequest) {
    const authContext = await this.getRequiredPlatformPermissionContext(
      request,
      "platform.service_product.manage",
    );
    const queryResult = PlatformServiceProductListQuerySchema.safeParse(
      request.query || {},
    );
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await (await service()).listProducts(
      authContext,
      queryResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Post("/platform/billing/service-products")
  async createProduct(request: FastifyRequest) {
    const authContext = await this.getRequiredPlatformPermissionContext(
      request,
      "platform.service_product.manage",
    );
    const bodyResult = PlatformServiceProductDraftSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await (await service()).createProduct(
      authContext,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Patch("/platform/billing/service-products/:id")
  async updateProduct(request: FastifyRequest) {
    const authContext = await this.getRequiredPlatformPermissionContext(
      request,
      "platform.service_product.manage",
    );
    const paramsResult = PlatformServiceProductParamSchema.safeParse(
      request.params || {},
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const bodyResult = PlatformServiceProductUpdateSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await (await service()).updateProduct(
      authContext,
      paramsResult.data.id,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Post("/platform/billing/service-products/:id/publish")
  async publishProduct(request: FastifyRequest) {
    const authContext = await this.getRequiredPlatformPermissionContext(
      request,
      "platform.service_product.manage",
    );
    const paramsResult = PlatformServiceProductParamSchema.safeParse(
      request.params || {},
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const bodyResult = PlatformServiceProductActionSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await (await service()).publishProduct(
      authContext,
      paramsResult.data.id,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Post("/platform/billing/service-products/:id/archive")
  async archiveProduct(request: FastifyRequest) {
    const authContext = await this.getRequiredPlatformPermissionContext(
      request,
      "platform.service_product.manage",
    );
    const paramsResult = PlatformServiceProductParamSchema.safeParse(
      request.params || {},
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const bodyResult = PlatformServiceProductActionSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await (await service()).archiveProduct(
      authContext,
      paramsResult.data.id,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }
}

export default new PlatformServiceProductsController();
