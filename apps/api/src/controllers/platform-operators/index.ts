import { PlatformBaseController } from "@/controllers/PlatformBaseController";
import { Errors } from "@/errors/error-factory";
import {
  CreatePlatformOperatorSchema,
  PlatformOperatorActionSchema,
  PlatformOperatorIdParamSchema,
  PlatformOperatorListQuerySchema,
  ReplacePlatformOperatorRolesSchema,
  UpdatePlatformOperatorSchema,
} from "@/schema/platform-operators";
import { platformOperatorsService } from "@/services/platform-operators";
import { Get, Patch, Post, Put } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";

class PlatformOperatorsController extends PlatformBaseController {
  constructor() {
    super("platform_operators");
  }

  @Get("/platform/operators")
  async listOperators(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformPermissionContext(
      request,
      "platform.operator.read",
    );
    const queryResult = PlatformOperatorListQuerySchema.safeParse(
      request.query || {},
    );
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await platformOperatorsService.list(
      authContext,
      queryResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Post("/platform/operators")
  async createOperator(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformSuperAdminContext(request);
    const bodyResult = CreatePlatformOperatorSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await platformOperatorsService.create(
      authContext,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Get("/platform/operators/:id")
  async getOperator(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformPermissionContext(
      request,
      "platform.operator.read",
    );
    const paramsResult = PlatformOperatorIdParamSchema.safeParse(
      request.params || {},
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const data = await platformOperatorsService.getById(
      authContext,
      paramsResult.data.id,
    );
    return ResponseHandler.success(data);
  }

  @Patch("/platform/operators/:id")
  async updateOperator(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformSuperAdminContext(request);
    const paramsResult = PlatformOperatorIdParamSchema.safeParse(
      request.params || {},
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const bodyResult = UpdatePlatformOperatorSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await platformOperatorsService.update(
      authContext,
      paramsResult.data.id,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Put("/platform/operators/:id/roles")
  async replaceOperatorRoles(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformSuperAdminContext(request);
    const paramsResult = PlatformOperatorIdParamSchema.safeParse(
      request.params || {},
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const bodyResult = ReplacePlatformOperatorRolesSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await platformOperatorsService.replaceRoles(
      authContext,
      paramsResult.data.id,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Post("/platform/operators/:id/activate")
  async activateOperator(request: FastifyRequest, reply: FastifyReply) {
    return this.transitionOperatorStatus(request, "active");
  }

  @Post("/platform/operators/:id/suspend")
  async suspendOperator(request: FastifyRequest, reply: FastifyReply) {
    return this.transitionOperatorStatus(request, "suspended");
  }

  @Post("/platform/operators/:id/leave")
  async leaveOperator(request: FastifyRequest, reply: FastifyReply) {
    return this.transitionOperatorStatus(request, "leaved");
  }

  @Post("/platform/operators/:id/revoke-sessions")
  async revokeOperatorSessions(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformSuperAdminContext(request);
    const paramsResult = PlatformOperatorIdParamSchema.safeParse(
      request.params || {},
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const bodyResult = PlatformOperatorActionSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await platformOperatorsService.revokeSessions(
      authContext,
      paramsResult.data.id,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  private async transitionOperatorStatus(
    request: FastifyRequest,
    status: "active" | "suspended" | "leaved",
  ) {
    const authContext = await this.getRequiredPlatformSuperAdminContext(request);
    const paramsResult = PlatformOperatorIdParamSchema.safeParse(
      request.params || {},
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const bodyResult = PlatformOperatorActionSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await platformOperatorsService.transitionStatus(
      authContext,
      paramsResult.data.id,
      status,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }
}

export default new PlatformOperatorsController();
