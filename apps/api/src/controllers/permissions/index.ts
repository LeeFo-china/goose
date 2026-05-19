import { BaseController } from "@/controllers/BaseController";
import { Errors } from "@/errors/error-factory";
import {
  CreatePermissionSchema,
  PermissionListQuerySchema,
  UpdatePermissionSchema,
} from "@/schema/permissions";
import { authorizationService, type AuthContext } from "@/services/authorization";
import { permissionService } from "@/services/permissions";
import { Delete } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";

class PermissionsController extends BaseController<
  typeof CreatePermissionSchema,
  typeof UpdatePermissionSchema
> {
  constructor() {
    super("permissions", CreatePermissionSchema, UpdatePermissionSchema);
  }

  private async getRequiredAuthContext(request: FastifyRequest) {
    const authContext = await authorizationService.getRequiredAuthContext(
      request.user?.sub,
    );
    request.authContext = authContext;
    return authContext;
  }

  private assertPlatformAdmin(authContext: AuthContext) {
    if (!authContext.isPlatformAdmin) {
      throw Errors.forbidden();
    }
  }

  override list = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredAuthContext(request);
    this.assertPlatformAdmin(authContext);

    const result = PermissionListQuerySchema.safeParse(request.query);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await permissionService.listPermissions(result.data);
    return ResponseHandler.success(data);
  };

  override getById = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredAuthContext(request);
    this.assertPlatformAdmin(authContext);

    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const data = await permissionService.getPermissionById(idVerify.data.id);
    return ResponseHandler.success(data);
  };

  override create = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredAuthContext(request);
    this.assertPlatformAdmin(authContext);

    if (!this.createSchema) {
      throw Errors.badRequest("缺少参数类型：createSchema");
    }

    const result = this.createSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await permissionService.createPermission(result.data);
    return ResponseHandler.success(data);
  };

  override update = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredAuthContext(request);
    this.assertPlatformAdmin(authContext);

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
    const authContext = await this.getRequiredAuthContext(request);
    this.assertPlatformAdmin(authContext);

    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const data = await permissionService.deletePermission(idVerify.data.id);
    return ResponseHandler.success(data, "删除成功");
  }
}

export default new PermissionsController();
