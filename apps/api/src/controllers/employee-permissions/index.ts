import { TenantBaseController } from "@/controllers/TenantBaseController";
import { Errors } from "@/errors/error-factory";
import {
  AssignEmployeeRolesSchema,
  EmployeePermissionOverrideParamSchema,
  EmployeePermissionOverrideSchema,
  EmployeeRoleParamSchema,
} from "@/schema/permissions";
import { permissionService } from "@/services/permissions";
import { Delete, Get, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";

class EmployeePermissionsController extends TenantBaseController {
  constructor() {
    super("employee_permissions");
  }

  @Get("/auth/me/permissions", { tenantServiceAccess: "session" })
  async getMyPermissions(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredAuthContext(request);
    return ResponseHandler.success(authContext);
  }

  @Get("/employees/:id/permissions")
  async getEmployeePermissionContext(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const authContext = await this.getRequiredTenantContext(request);
    this.assertPermission(authContext, "employee.permission_manage");

    const idVerify = EmployeeRoleParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const data = await permissionService.getEmployeePermissionContext(
      authContext,
      idVerify.data.id,
    );
    return ResponseHandler.success(data);
  }

  @Post("/employees/:id/roles")
  async assignRoles(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    this.assertPermission(authContext, "employee.permission_manage");

    const idVerify = EmployeeRoleParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const result = AssignEmployeeRolesSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await permissionService.assignEmployeeRoles(
      authContext,
      idVerify.data.id,
      result.data,
    );

    return ResponseHandler.success(data);
  }

  @Post("/employees/:id/permission-overrides")
  async upsertOverride(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    this.assertPermission(authContext, "employee.permission_manage");

    const idVerify = EmployeeRoleParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const result = EmployeePermissionOverrideSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await permissionService.upsertEmployeePermissionOverride(
      authContext,
      idVerify.data.id,
      result.data,
    );

    return ResponseHandler.success(data);
  }

  @Delete("/employees/:id/permission-overrides/:permission_id")
  async deleteOverride(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    this.assertPermission(authContext, "employee.permission_manage");

    const idVerify = EmployeePermissionOverrideParamSchema.safeParse(
      request.params,
    );
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const data = await permissionService.deleteEmployeePermissionOverride(
      authContext,
      idVerify.data.id,
      idVerify.data.permission_id,
    );

    return ResponseHandler.success(data);
  }
}

export default new EmployeePermissionsController();
