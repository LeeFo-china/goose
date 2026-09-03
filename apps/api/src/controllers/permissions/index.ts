import { PlatformBaseController } from "@/controllers/PlatformBaseController";
import { Errors } from "@/errors/error-factory";
import {
  CreatePermissionSchema,
  PermissionListQuerySchema,
  UpdatePermissionSchema,
} from "@/schema/permissions";
import { accessPolicyService } from "@/services/access-policy";
import { authorizationService } from "@/services/authorization";
import { permissionService } from "@/services/permissions";
import { getTenantServiceAuthOptions } from "@/services/tenant-service-route-access";
import { Delete } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";

class PermissionsController extends PlatformBaseController<
  typeof CreatePermissionSchema,
  typeof UpdatePermissionSchema
> {
  constructor() {
    super("permissions", CreatePermissionSchema, UpdatePermissionSchema);
  }

  private async getRequiredPermissionReadContext(request: FastifyRequest) {
    const authContext = await authorizationService.getRequiredAuthContext(
      request.user?.sub,
      getTenantServiceAuthOptions(request),
    );
    request.authContext = authContext;
    if (authContext.isPlatformAdmin) {
      return authContext;
    }

    accessPolicyService.assertTenantContext(authContext);
    accessPolicyService.assertPermission(authContext, "employee.permission_manage");
    return authContext;
  }

  override list = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredPermissionReadContext(request);

    const result = PermissionListQuerySchema.safeParse(request.query);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await permissionService.listPermissions(
      result.data,
      authContext,
    );
    return ResponseHandler.success(data);
  };

  override getById = async (request: FastifyRequest, reply: FastifyReply) => {
    await this.getRequiredPermissionReadContext(request);

    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const data = await permissionService.getPermissionById(idVerify.data.id);
    return ResponseHandler.success(data);
  };

  override create = async (request: FastifyRequest, reply: FastifyReply) => {
    await this.getRequiredPlatformAdminContext(request);

    if (!this.createSchema) {
      throw Errors.badRequest("缺少参数类型：createSchema");
    }

    const result = this.createSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await permissionService.createPermission(result.data);
    return ResponseHandler.success(data);
  };

  override update = async (request: FastifyRequest, reply: FastifyReply) => {
    await this.getRequiredPlatformAdminContext(request);

    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    if (!this.updateSchema) {
      throw Errors.badRequest("缺少参数类型：updateSchema");
    }

    const result = this.updateSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await permissionService.updatePermission(
      idVerify.data.id,
      result.data,
    );
    return ResponseHandler.success(data);
  };

  @Delete("/permissions/:id")
  async deletePermission(request: FastifyRequest, reply: FastifyReply) {
    await this.getRequiredPlatformAdminContext(request);

    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const data = await permissionService.deletePermission(idVerify.data.id);
    return ResponseHandler.success(data, "删除成功");
  }
}

export default new PermissionsController();
