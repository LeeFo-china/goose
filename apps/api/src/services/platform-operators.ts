import { AppError } from "@/errors/app-error";
import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import {
  platformOperatorsRepository,
  type PlatformOperatorPage,
  type PlatformOperatorRecord,
  type PlatformOperatorStatus,
} from "@/repositories/platform-operators";
import type {
  CreatePlatformOperatorInput,
  PlatformOperatorActionInput,
  PlatformOperatorListQuery,
  ReplacePlatformOperatorRolesInput,
  UpdatePlatformOperatorInput,
} from "@/schema/platform-operators";
import type { AuthContext } from "@/services/authorization";
import {
  platformAuthorizationService,
  type PlatformStaffAuthContext,
} from "@/services/platform-authorization";
import type { PermissionCode } from "@gooes/domain";

type PlatformOperatorsRepositoryPort = Pick<
  typeof platformOperatorsRepository,
  | "list"
  | "findById"
  | "createCommand"
  | "updateCommand"
  | "replaceRolesCommand"
  | "transitionStatusCommand"
  | "revokeSessionsCommand"
>;

type PlatformOperatorsServiceDependencies = {
  repository?: PlatformOperatorsRepositoryPort;
};

type PlatformOperatorView = Omit<PlatformOperatorRecord, "phone"> & {
  phone: string | null;
  phone_masked: string | null;
  full_phone?: string;
};

const OPERATOR_READ_PERMISSION = "platform.operator.read" satisfies PermissionCode;
const OPERATOR_MANAGE_PERMISSION = "platform.operator.manage" satisfies PermissionCode;

const RPC_ERROR_MAP: Record<string, AppError> = {
  PLATFORM_OPERATOR_NOT_FOUND: Errors.business(
    404,
    "平台运营人员不存在",
    ErrorCodes.PLATFORM_OPERATOR_NOT_FOUND,
  ),
  PLATFORM_OPERATOR_PHONE_CONFLICT: Errors.business(
    409,
    "该手机号已绑定其他平台人员",
    ErrorCodes.PLATFORM_OPERATOR_PHONE_CONFLICT,
  ),
  PLATFORM_OPERATOR_VERSION_CONFLICT: Errors.business(
    409,
    "平台运营人员已被其他操作更新，请刷新后重试",
    ErrorCodes.PLATFORM_OPERATOR_VERSION_CONFLICT,
  ),
  PLATFORM_LAST_SUPER_ADMIN_REQUIRED: Errors.business(
    409,
    "至少需要保留一个可用的平台超管",
    ErrorCodes.PLATFORM_LAST_SUPER_ADMIN_REQUIRED,
  ),
  PLATFORM_ROLE_NOT_FOUND: Errors.business(
    404,
    "平台角色不存在",
    ErrorCodes.PLATFORM_ROLE_NOT_FOUND,
  ),
  PLATFORM_ROLE_PERMISSION_INVALID: Errors.business(
    400,
    "平台角色不合法或不可分配",
    ErrorCodes.PLATFORM_ROLE_PERMISSION_INVALID,
  ),
  PLATFORM_OPERATOR_STATUS_INVALID: Errors.business(
    400,
    "平台运营人员状态不合法",
    ErrorCodes.PLATFORM_OPERATOR_STATUS_INVALID,
  ),
};

export class PlatformOperatorsService {
  private readonly repository: PlatformOperatorsRepositoryPort;

  constructor(dependencies: PlatformOperatorsServiceDependencies = {}) {
    this.repository = dependencies.repository ?? platformOperatorsRepository;
  }

  async list(
    authContext: AuthContext,
    query: PlatformOperatorListQuery,
  ): Promise<PlatformOperatorPage & { list: PlatformOperatorView[] }> {
    this.assertPermission(authContext, OPERATOR_READ_PERMISSION);
    const page = await this.repository.list(query);
    return {
      ...page,
      list: page.list.map((record) => this.toView(record, false)),
    };
  }

  async getById(
    authContext: AuthContext,
    operatorId: string,
  ): Promise<PlatformOperatorView> {
    this.assertPermission(authContext, OPERATOR_READ_PERMISSION);
    const record = await this.repository.findById(operatorId);
    if (!record) {
      throw Errors.business(
        404,
        "平台运营人员不存在",
        ErrorCodes.PLATFORM_OPERATOR_NOT_FOUND,
      );
    }

    return this.toView(
      record,
      this.hasPermission(authContext, OPERATOR_MANAGE_PERMISSION),
    );
  }

  async create(
    authContext: AuthContext,
    input: CreatePlatformOperatorInput,
  ): Promise<unknown> {
    const platformContext = this.requireManageContext(authContext);
    return this.mapRpcError(() =>
      this.repository.createCommand(platformContext, input),
    );
  }

  async update(
    authContext: AuthContext,
    operatorId: string,
    input: UpdatePlatformOperatorInput,
  ): Promise<unknown> {
    const platformContext = this.requireManageContext(authContext);
    return this.mapRpcError(() =>
      this.repository.updateCommand(platformContext, operatorId, input),
    );
  }

  async replaceRoles(
    authContext: AuthContext,
    operatorId: string,
    input: ReplacePlatformOperatorRolesInput,
  ): Promise<unknown> {
    const platformContext = this.requireManageContext(authContext);
    return this.mapRpcError(() =>
      this.repository.replaceRolesCommand(platformContext, operatorId, input),
    );
  }

  async transitionStatus(
    authContext: AuthContext,
    operatorId: string,
    status: Exclude<PlatformOperatorStatus, "pending">,
    input: PlatformOperatorActionInput,
  ): Promise<unknown> {
    const platformContext = this.requireManageContext(authContext);
    return this.mapRpcError(() =>
      this.repository.transitionStatusCommand(
        platformContext,
        operatorId,
        status,
        input,
      ),
    );
  }

  async revokeSessions(
    authContext: AuthContext,
    operatorId: string,
    input: PlatformOperatorActionInput,
  ): Promise<unknown> {
    const platformContext = this.requireManageContext(authContext);
    return this.mapRpcError(() =>
      this.repository.revokeSessionsCommand(platformContext, operatorId, input),
    );
  }

  private requireManageContext(
    authContext: AuthContext,
  ): PlatformStaffAuthContext {
    this.assertPermission(authContext, OPERATOR_MANAGE_PERMISSION);
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

  private assertPermission(authContext: AuthContext, code: PermissionCode): void {
    platformAuthorizationService.assertPermission(authContext, code);
  }

  private hasPermission(authContext: AuthContext, code: PermissionCode): boolean {
    if (authContext.isPlatformSuperAdmin && code.startsWith("platform.")) {
      return true;
    }

    return authContext.permissions.some((permission) => permission.code === code);
  }

  private toView(
    record: PlatformOperatorRecord,
    exposeFullPhone: boolean,
  ): PlatformOperatorView {
    const phoneMasked = maskPhone(record.phone);
    return {
      ...record,
      phone: exposeFullPhone ? record.phone : phoneMasked,
      phone_masked: phoneMasked,
      ...(exposeFullPhone && record.phone ? { full_phone: record.phone } : {}),
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

export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  if (!/^1[3-9]\d{9}$/.test(phone)) return phone;
  return `${phone.slice(0, 3)}****${phone.slice(7)}`;
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

export const platformOperatorsService = new PlatformOperatorsService();
