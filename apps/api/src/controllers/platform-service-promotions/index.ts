import { PlatformBaseController } from "@/controllers/PlatformBaseController";
import { Errors } from "@/errors/error-factory";
import {
  PlatformServicePromotionCreateSchema,
  PlatformServicePromotionListQuerySchema,
  PlatformServicePromotionParamSchema,
  PlatformServicePromotionPublishSchema,
  PlatformServicePromotionStopSchema,
  PlatformServicePromotionUpdateSchema,
} from "@/schema/platform-service-promotions";
import { Get, Patch, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyRequest } from "fastify";

const SERVICE_MODULE = "../../services/platform-service-promotions";

async function service() {
  return (await import(SERVICE_MODULE)).platformServicePromotionService;
}

class PlatformServicePromotionsController extends PlatformBaseController {
  constructor() {
    super("platform-service-promotions");
  }

  @Get("/platform/billing/service-promotions")
  async listPromotions(request: FastifyRequest) {
    const authContext = await this.getRequiredPlatformPermissionContext(
      request,
      "platform.service_product.manage",
    );
    const queryResult = PlatformServicePromotionListQuerySchema.safeParse(
      request.query || {},
    );
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    return ResponseHandler.success(
      await (await service()).listPromotions(authContext, queryResult.data),
    );
  }

  @Post("/platform/billing/service-promotions")
  async createDraft(request: FastifyRequest) {
    const authContext = await this.getRequiredPlatformPermissionContext(
      request,
      "platform.service_product.manage",
    );
    const bodyResult = PlatformServicePromotionCreateSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    return ResponseHandler.success(
      await (await service()).createDraft(authContext, bodyResult.data),
    );
  }

  @Patch("/platform/billing/service-promotions/:id")
  async saveDraft(request: FastifyRequest) {
    const authContext = await this.getRequiredPlatformPermissionContext(
      request,
      "platform.service_product.manage",
    );
    const paramsResult = PlatformServicePromotionParamSchema.safeParse(
      request.params || {},
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const bodyResult = PlatformServicePromotionUpdateSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    return ResponseHandler.success(
      await (await service()).saveDraft(
        authContext,
        paramsResult.data.id,
        bodyResult.data,
      ),
    );
  }

  @Post("/platform/billing/service-promotions/:id/publish")
  async publish(request: FastifyRequest) {
    const authContext = await this.getRequiredPlatformPermissionContext(
      request,
      "platform.service_product.manage",
    );
    const paramsResult = PlatformServicePromotionParamSchema.safeParse(
      request.params || {},
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const bodyResult = PlatformServicePromotionPublishSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    return ResponseHandler.success(
      await (await service()).publish(
        authContext,
        paramsResult.data.id,
        bodyResult.data,
      ),
    );
  }

  @Post("/platform/billing/service-promotions/:id/stop")
  async stop(request: FastifyRequest) {
    const authContext = await this.getRequiredPlatformPermissionContext(
      request,
      "platform.service_product.manage",
    );
    const paramsResult = PlatformServicePromotionParamSchema.safeParse(
      request.params || {},
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const bodyResult = PlatformServicePromotionStopSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    return ResponseHandler.success(
      await (await service()).stop(
        authContext,
        paramsResult.data.id,
        bodyResult.data,
      ),
    );
  }
}

export default new PlatformServicePromotionsController();
