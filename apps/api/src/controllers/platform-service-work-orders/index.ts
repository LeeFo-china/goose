import { PlatformBaseController } from "@/controllers/PlatformBaseController";
import { Errors } from "@/errors/error-factory";
import {
  PlatformServiceAcceptancePreparationSchema,
  PlatformServiceEntityParamSchema,
  PlatformServiceFulfillmentRecordSchema,
  PlatformServiceOverdueAcceptanceConfirmSchema,
  PlatformServiceWorkOrderAssignSchema,
  PlatformServiceWorkOrderListQuerySchema,
  PlatformServiceWorkOrderTransitionSchema,
} from "@/schema/platform-service-fulfillment";
import { Get, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyRequest } from "fastify";

const SERVICE_MODULE = "../../services/platform-service-fulfillment";

async function service() {
  return (await import(SERVICE_MODULE)).platformServiceFulfillmentService;
}

class PlatformServiceWorkOrdersController extends PlatformBaseController {
  constructor() {
    super("platform-service-work-orders");
  }

  @Get("/platform/billing/service-work-orders")
  async listWorkOrders(request: FastifyRequest) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const queryResult = PlatformServiceWorkOrderListQuerySchema.safeParse(
      request.query || {},
    );
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await (await service()).listWorkOrders(
      authContext,
      queryResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Get("/platform/billing/service-work-orders/:id")
  async getWorkOrder(request: FastifyRequest) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const paramsResult = PlatformServiceEntityParamSchema.safeParse(
      request.params || {},
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const data = await (await service()).getWorkOrder(
      authContext,
      paramsResult.data.id,
    );
    return ResponseHandler.success(data);
  }

  @Post("/platform/billing/service-work-orders/:id/assign")
  async assignWorkOrder(request: FastifyRequest) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const paramsResult = PlatformServiceEntityParamSchema.safeParse(
      request.params || {},
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const bodyResult = PlatformServiceWorkOrderAssignSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await (await service()).assignWorkOrder(
      authContext,
      paramsResult.data.id,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Post("/platform/billing/service-work-orders/:id/status-transitions")
  async transitionWorkOrder(request: FastifyRequest) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const paramsResult = PlatformServiceEntityParamSchema.safeParse(
      request.params || {},
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const bodyResult = PlatformServiceWorkOrderTransitionSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await (await service()).transitionWorkOrder(
      authContext,
      paramsResult.data.id,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Post("/platform/billing/service-work-orders/:id/fulfillment-records")
  async createFulfillmentRecord(request: FastifyRequest) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const paramsResult = PlatformServiceEntityParamSchema.safeParse(
      request.params || {},
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const bodyResult = PlatformServiceFulfillmentRecordSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await (await service()).createFulfillmentRecord(
      authContext,
      paramsResult.data.id,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Post("/platform/billing/service-work-orders/:id/acceptance-preparation")
  async upsertAcceptancePreparation(request: FastifyRequest) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const paramsResult = PlatformServiceEntityParamSchema.safeParse(
      request.params || {},
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const bodyResult = PlatformServiceAcceptancePreparationSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await (await service()).upsertAcceptancePreparation(
      authContext,
      paramsResult.data.id,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Post("/platform/billing/service-work-orders/:id/overdue-acceptance/confirm")
  async confirmOverdueAcceptance(request: FastifyRequest) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const paramsResult = PlatformServiceEntityParamSchema.safeParse(
      request.params || {},
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const bodyResult = PlatformServiceOverdueAcceptanceConfirmSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await (await service()).confirmOverdueAcceptance(
      authContext,
      paramsResult.data.id,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }
}

export default new PlatformServiceWorkOrdersController();
