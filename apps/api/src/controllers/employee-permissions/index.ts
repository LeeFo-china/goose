import { BaseController } from "@/controllers/BaseController";
import { Errors } from "@/errors/error-factory";
import {
  AssignEmployeeRolesSchema,
  EmployeePermissionOverrideParamSchema,
  EmployeePermissionOverrideSchema,
  EmployeeRoleParamSchema,
} from "@/schema/permissions";
import { accessPolicyService } from "@/services/access-policy";
import { authorizationService } from "@/services/authorization";
import { permissionService } from "@/services/permissions";
import { Delete, Get, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";

class EmployeePermissionsController extends BaseController {
  constructor() {
    super("employee_permissions");
  }

  private async getRequiredAuthContext(request: FastifyRequest) {
    const authContext = await authorizationService.getRequiredAuthContext(
      request.user?.sub,
    );
    request.authContext = authContext;
    return authContext;
  }

  @Get("/auth/me/permissions")
  async getMyPermissions(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredAuthContext(request);
    return ResponseHandler.success(authContext);
  }

  @Get("/employees/:id/permissions")
  async getEmployeePermissionContext(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const authContext = await this.getRequiredAuthContext(request);
    accessPolicyService.assertPermission(authContext, "employee.permission_manage");

    const idVerify = EmployeeRoleParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const data = await permissionService.getEmployeePermissionContext(
      idVerify.data.id,
    );
    return ResponseHandler.success(data);
  }

  @Post("/employees/:id/roles")
  async assignRoles(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredAuthContext(request);
    accessPolicyService.assertPermission(authContext, "employee.permission_manage");

    const idVerify = EmployeeRoleParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const result = AssignEmployeeRolesSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await permissionService.assignEmployeeRoles(
      idVerify.data.id,
      result.data,
    );

    return ResponseHandler.success(data);
  }

  @Post("/employees/:id/permission-overrides")
  async upsertOverride(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredAuthContext(request);
    accessPolicyService.assertPermission(authContext, "employee.permission_manage");

    const idVerify = EmployeeRoleParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const result = EmployeePermissionOverrideSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await permissionService.upsertEmployeePermissionOverride(
      idVerify.data.id,
      result.data,
    );

    return ResponseHandler.success(data);
  }

  @Delete("/employees/:id/permission-overrides/:permission_id")
  async deleteOverride(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredAuthContext(request);
    accessPolicyService.assertPermission(authContext, "employee.permission_manage");

    const idVerify = EmployeePermissionOverrideParamSchema.safeParse(
      request.params,
    );
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const data = await permissionService.deleteEmployeePermissionOverride(
      idVerify.data.id,
      idVerify.data.permission_id,
    );

    return ResponseHandler.success(data);
  }
}

export default new EmployeePermissionsController();
