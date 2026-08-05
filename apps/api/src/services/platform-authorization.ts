import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import {
  platformAuthorizationRepository,
  type PlatformAuthorizationRepository,
  type PlatformAuthorizationSnapshot,
} from "@/repositories/platform-authorization";
import type { AuthContext } from "@/services/authorization";
import type { PermissionCode } from "@gooes/domain";

export type PlatformStaffAuthContext = AuthContext & {
  employeeId: string;
  tenantId: null;
  isPlatformStaff: true;
  isPlatformSuperAdmin: boolean;
  adminAuthVersion: number;
};

export interface PlatformAuthorizationDependencies {
  repository?: Pick<PlatformAuthorizationRepository, "getSecuritySnapshot">;
}

export class PlatformAuthorizationService {
  readonly repository: Pick<
    PlatformAuthorizationRepository,
    "getSecuritySnapshot"
  >;

  constructor(dependencies: PlatformAuthorizationDependencies = {}) {
    this.repository = dependencies.repository ?? platformAuthorizationRepository;
  }

  async assertPlatformSession(
    authContext: AuthContext,
    tokenVersion: number | undefined,
  ): Promise<PlatformStaffAuthContext> {
    if (!authContext.employeeId || tokenVersion === undefined) {
      throw this.sessionRevoked();
    }

    const snapshot = await this.repository.getSecuritySnapshot(
      authContext.employeeId,
    );

    if (!this.isActivePlatformStaffSnapshot(snapshot)) {
      throw this.platformStaffRequired();
    }

    if (snapshot.admin_auth_version !== tokenVersion) {
      throw this.sessionRevoked();
    }

    const isPlatformSuperAdmin = snapshot.role_codes.includes("platform_admin");
    const isPlatformStaff = isPlatformSuperAdmin
      || snapshot.role_codes.includes("platform_staff");

    return {
      ...authContext,
      employeeId: snapshot.employee_id,
      tenantId: null,
      isPlatformAdmin: isPlatformSuperAdmin,
      isPlatformStaff: true,
      isPlatformSuperAdmin,
      adminAuthVersion: snapshot.admin_auth_version,
      roleCodes: snapshot.role_codes,
    } satisfies PlatformStaffAuthContext;
  }

  assertSuperAdmin(authContext: PlatformStaffAuthContext): void {
    if (!authContext.isPlatformSuperAdmin) {
      throw Errors.business(
        403,
        "当前操作仅平台超管可执行",
        ErrorCodes.PLATFORM_SUPER_ADMIN_REQUIRED,
      );
    }
  }

  assertPermission(
    authContext: PlatformStaffAuthContext,
    code: PermissionCode,
  ): void {
    const hasPermission = authContext.permissions.some(
      (permission) => permission.code === code,
    );

    if (!hasPermission) {
      throw Errors.business(
        403,
        "缺少平台操作权限",
        ErrorCodes.PLATFORM_PERMISSION_REQUIRED,
        { permission: code },
      );
    }
  }

  private isActivePlatformStaffSnapshot(
    snapshot: PlatformAuthorizationSnapshot | null,
  ): snapshot is PlatformAuthorizationSnapshot {
    if (!snapshot || snapshot.tenant_id !== null || snapshot.status !== "active") {
      return false;
    }

    return snapshot.role_codes.includes("platform_admin")
      || snapshot.role_codes.includes("platform_staff");
  }

  private sessionRevoked() {
    return Errors.business(
      401,
      "平台会话已失效，请重新登录",
      ErrorCodes.ADMIN_SESSION_REVOKED,
    );
  }

  private platformStaffRequired() {
    return Errors.business(
      403,
      "当前身份不是有效平台工作人员",
      ErrorCodes.PLATFORM_STAFF_REQUIRED,
    );
  }
}

export const platformAuthorizationService = new PlatformAuthorizationService();
