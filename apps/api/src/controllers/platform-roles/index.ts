import { PlatformBaseController } from "@/controllers/PlatformBaseController";
import { Errors } from "@/errors/error-factory";
import {
  CreatePlatformRoleSchema,
  PlatformPermissionListQuerySchema,
  PlatformRoleActionSchema,
  PlatformRoleIdParamSchema,
  PlatformRoleListQuerySchema,
  ReplacePlatformRolePermissionsSchema,
  UpdatePlatformRoleSchema,
} from "@/schema/platform-roles";
import { platformRolesService } from "@/services/platform-roles";
import { Get, Patch, Post, Put } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";

class PlatformRolesController extends PlatformBaseController {
  constructor() {
    super("platform_roles");
  }

  @Get("/platform/roles")
  async listRoles(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformPermissionContext(
      request,
      "platform.role.read",
    );
    const queryResult = PlatformRoleListQuerySchema.safeParse(
      request.query || {},
    );
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await platformRolesService.listRoles(
      authContext,
      queryResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Post("/platform/roles")
  async createRole(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformSuperAdminContext(request);
    const bodyResult = CreatePlatformRoleSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await platformRolesService.create(
      authContext,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Get("/platform/roles/:id")
  async getRole(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformPermissionContext(
      request,
      "platform.role.read",
    );
    const paramsResult = PlatformRoleIdParamSchema.safeParse(
      request.params || {},
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const data = await platformRolesService.getById(
      authContext,
      paramsResult.data.id,
    );
    return ResponseHandler.success(data);
  }

  @Patch("/platform/roles/:id")
  async updateRole(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformSuperAdminContext(request);
    const paramsResult = PlatformRoleIdParamSchema.safeParse(
      request.params || {},
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const bodyResult = UpdatePlatformRoleSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await platformRolesService.update(
      authContext,
      paramsResult.data.id,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Put("/platform/roles/:id/permissions")
  async replaceRolePermissions(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformSuperAdminContext(request);
    const paramsResult = PlatformRoleIdParamSchema.safeParse(
      request.params || {},
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const bodyResult = ReplacePlatformRolePermissionsSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await platformRolesService.replacePermissions(
      authContext,
      paramsResult.data.id,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Post("/platform/roles/:id/archive")
  async archiveRole(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformSuperAdminContext(request);
    const paramsResult = PlatformRoleIdParamSchema.safeParse(
      request.params || {},
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const bodyResult = PlatformRoleActionSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await platformRolesService.archive(
      authContext,
      paramsResult.data.id,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Get("/platform/permissions")
  async listPermissions(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformPermissionContext(
      request,
      "platform.role.read",
    );
    const queryResult = PlatformPermissionListQuerySchema.safeParse(
      request.query || {},
    );
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await platformRolesService.listPermissions(
      authContext,
      queryResult.data,
    );
    return ResponseHandler.success(data);
  }
}

export default new PlatformRolesController();
