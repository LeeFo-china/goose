import { BaseController } from "@/controllers/BaseController";
import { Errors } from "@/errors/error-factory";
import {
  CreateRoleSchema,
  RolePermissionAssignSchema,
  RoleListQuerySchema,
  UpdateRoleSchema,
} from "@/schema/permissions";
import { accessPolicyService } from "@/services/access-policy";
import { authorizationService } from "@/services/authorization";
import { permissionService } from "@/services/permissions";
import { Put } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";

class RolesController extends BaseController<
  typeof CreateRoleSchema,
  typeof UpdateRoleSchema
> {
  constructor() {
    super("roles", CreateRoleSchema, UpdateRoleSchema);
  }

  private async getRequiredAuthContext(request: FastifyRequest) {
    const authContext = await authorizationService.getRequiredAuthContext(
      request.user?.sub,
    );
    request.authContext = authContext;
    return authContext;
  }

  override list = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredAuthContext(request);
    const result = RoleListQuerySchema.safeParse(request.query);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await permissionService.listRoles(result.data, authContext);
    return ResponseHandler.success(data);
  };

  override getById = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredAuthContext(request);
    accessPolicyService.assertPermission(authContext, "employee.permission_manage");

    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const data = await permissionService.getRoleById(idVerify.data.id, authContext);
    return ResponseHandler.success(data);
  };

  override create = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredAuthContext(request);
    accessPolicyService.assertPermission(authContext, "employee.permission_manage");

    if (!this.createSchema) {
      throw Errors.badRequest("缺少参数类型：createSchema");
    }

    const result = this.createSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await permissionService.createRole(result.data, authContext);
    return ResponseHandler.success(data);
  };

  override update = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredAuthContext(request);
    accessPolicyService.assertPermission(authContext, "employee.permission_manage");

    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    if (!this.updateSchema) {
      throw Errors.badRequest("缺少参数类型：updateSchema");
    }

    const result = this.updateSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await permissionService.updateRole(
      idVerify.data.id,
      result.data,
      authContext,
    );
    return ResponseHandler.success(data);
  };

  @Put("/roles/:id/permissions")
  async replaceRolePermissions(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredAuthContext(request);
    accessPolicyService.assertPermission(authContext, "employee.permission_manage");

    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const result = RolePermissionAssignSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await permissionService.replaceRolePermissions(
      authContext,
      idVerify.data.id,
      result.data,
    );
    return ResponseHandler.success(data);
  }
}

export default new RolesController();
