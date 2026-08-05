import { AppError } from "@/errors/app-error";
import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import {
  platformRolesRepository,
  type PlatformRoleRecord,
} from "@/repositories/platform-roles";
import type {
  CreatePlatformRoleInput,
  PlatformPermissionListQuery,
  PlatformRoleActionInput,
  PlatformRoleListQuery,
  ReplacePlatformRolePermissionsInput,
  UpdatePlatformRoleInput,
} from "@/schema/platform-roles";
import type { AuthContext } from "@/services/authorization";
import type { PlatformStaffAuthContext } from "@/services/platform-authorization";

type PlatformRolesRepositoryPort = Pick<
  typeof platformRolesRepository,
  | "listRoles"
  | "findRoleById"
  | "listPermissions"
  | "createCommand"
  | "updateCommand"
  | "replacePermissionsCommand"
  | "archiveCommand"
>;

type PlatformRolesServiceDependencies = {
  repository?: PlatformRolesRepositoryPort;
};

type PlatformRoleView = PlatformRoleRecord & {
  is_protected: boolean;
};

const ROLE_READ_PERMISSION = "platform.role.read";
const ROLE_MANAGE_PERMISSION = "platform.role.manage";
const PROTECTED_ROLE_CODES = new Set(["platform_admin", "platform_staff"]);

const RPC_ERROR_MAP: Record<string, AppError> = {
  PLATFORM_ROLE_NOT_FOUND: Errors.business(
    404,
    "平台角色不存在",
    ErrorCodes.PLATFORM_ROLE_NOT_FOUND,
  ),
  PLATFORM_ROLE_PROTECTED: Errors.business(
    409,
    "受保护的平台角色不可编辑或归档",
    ErrorCodes.PLATFORM_ROLE_PROTECTED,
  ),
  PLATFORM_ROLE_IN_USE: Errors.business(
    409,
    "该平台角色仍有关联人员，不能归档",
    ErrorCodes.PLATFORM_ROLE_IN_USE,
  ),
  PLATFORM_ROLE_VERSION_CONFLICT: Errors.business(
    409,
    "平台角色已被其他操作更新，请刷新后重试",
    ErrorCodes.PLATFORM_ROLE_VERSION_CONFLICT,
  ),
  PLATFORM_ROLE_PERMISSION_INVALID: Errors.business(
    400,
    "平台角色权限不合法",
    ErrorCodes.PLATFORM_ROLE_PERMISSION_INVALID,
  ),
};

export class PlatformRolesService {
  private readonly repository: PlatformRolesRepositoryPort;

  constructor(dependencies: PlatformRolesServiceDependencies = {}) {
    this.repository = dependencies.repository ?? platformRolesRepository;
  }

  async listRoles(authContext: AuthContext, query: PlatformRoleListQuery) {
    this.assertPermission(authContext, ROLE_READ_PERMISSION);
    const page = await this.repository.listRoles(query);
    return {
      ...page,
      list: page.list.map((role) => this.toView(role)),
    };
  }

  async getById(
    authContext: AuthContext,
    roleId: string,
  ): Promise<PlatformRoleView> {
    this.assertPermission(authContext, ROLE_READ_PERMISSION);
    const role = await this.repository.findRoleById(roleId);
    if (!role) {
      throw Errors.business(
        404,
        "平台角色不存在",
        ErrorCodes.PLATFORM_ROLE_NOT_FOUND,
      );
    }
    return this.toView(role);
  }

  async listPermissions(
    authContext: AuthContext,
    query: PlatformPermissionListQuery,
  ) {
    this.assertPermission(authContext, ROLE_READ_PERMISSION);
    return this.repository.listPermissions(query);
  }

  async create(
    authContext: AuthContext,
    input: CreatePlatformRoleInput,
  ): Promise<unknown> {
    const platformContext = this.requireManageContext(authContext);
    return this.mapRpcError(() =>
      this.repository.createCommand(platformContext, input),
    );
  }

  async update(
    authContext: AuthContext,
    roleId: string,
    input: UpdatePlatformRoleInput,
  ): Promise<unknown> {
    const platformContext = this.requireManageContext(authContext);
    return this.mapRpcError(() =>
      this.repository.updateCommand(platformContext, roleId, input),
    );
  }

  async replacePermissions(
    authContext: AuthContext,
    roleId: string,
    input: ReplacePlatformRolePermissionsInput,
  ): Promise<unknown> {
    for (const permission of input.permissions) {
      if (permission.access_scope !== "all") {
        throw Errors.business(
          400,
          "平台权限范围仅支持 all",
          ErrorCodes.PLATFORM_ROLE_PERMISSION_INVALID,
        );
      }
    }

    const platformContext = this.requireManageContext(authContext);
    return this.mapRpcError(() =>
      this.repository.replacePermissionsCommand(
        platformContext,
        roleId,
        input,
      ),
    );
  }

  async archive(
    authContext: AuthContext,
    roleId: string,
    input: PlatformRoleActionInput,
  ): Promise<unknown> {
    const platformContext = this.requireManageContext(authContext);
    return this.mapRpcError(() =>
      this.repository.archiveCommand(platformContext, roleId, input),
    );
  }

  private requireManageContext(
    authContext: AuthContext,
  ): PlatformStaffAuthContext {
    this.assertPermission(authContext, ROLE_MANAGE_PERMISSION);
    if (!authContext.isPlatformSuperAdmin || authContext.tenantId !== null || !authContext.employeeId) {
      throw Errors.business(
        403,
        "当前操作仅平台超管可执行",
        ErrorCodes.PLATFORM_SUPER_ADMIN_REQUIRED,
      );
    }

    return {
      ...authContext,
      employeeId: authContext.employeeId,
      tenantId: null,
      isPlatformStaff: true,
      isPlatformSuperAdmin: true,
      adminAuthVersion: authContext.adminAuthVersion ?? 1,
    };
  }

  private assertPermission(authContext: AuthContext, code: string): void {
    if (!authContext.permissions.some((permission) => permission.code === code)) {
      throw Errors.business(
        403,
        "缺少平台操作权限",
        ErrorCodes.PLATFORM_PERMISSION_REQUIRED,
        { permission: code },
      );
    }
  }

  private toView(role: PlatformRoleRecord): PlatformRoleView {
    return {
      ...role,
      is_protected: PROTECTED_ROLE_CODES.has(role.code),
    };
  }

  private async mapRpcError<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      const rpcMessage = extractRpcMessage(error);
      if (rpcMessage && RPC_ERROR_MAP[rpcMessage]) {
        throw RPC_ERROR_MAP[rpcMessage];
      }
      throw error;
    }
  }
}

function extractRpcMessage(error: unknown): string | null {
  if (!(error instanceof AppError)) return null;
  const details = error.details;

  if (
    details
    && typeof details === "object"
    && "message" in details
    && typeof details.message === "string"
  ) {
    return details.message;
  }

  return null;
}

export const platformRolesService = new PlatformRolesService();
