import { isEmployeeOperableStatus } from "@gooes/domain";
import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import {
  employeeAdminSessionsRepository,
  type EmployeeAdminSecuritySnapshot,
  type EmployeeAdminSessionsRepository,
} from "@/repositories/employee-admin-sessions";

function sessionRevoked() {
  return Errors.unauthorized("登录状态已失效，请重新登录", ErrorCodes.ADMIN_SESSION_REVOKED);
}

export function assertAdminCredentialVersion(actual: number, claimed: number | undefined): void {
  if (!Number.isSafeInteger(actual) || actual < 1 || actual !== claimed) {
    throw sessionRevoked();
  }
}

type SessionRepository = Pick<EmployeeAdminSessionsRepository,
  "findByAuthUserId" | "findByEmployeeId" | "bindFirstLogin">;

export class EmployeeAdminSessionsService {
  private readonly repository: SessionRepository;

  constructor(dependencies: { repository?: SessionRepository } = {}) {
    this.repository = dependencies.repository ?? employeeAdminSessionsRepository;
  }

  async assertSession(
    authUserId: string | undefined,
    claimedVersion: number | undefined,
  ): Promise<EmployeeAdminSecuritySnapshot> {
    if (!authUserId || claimedVersion === undefined) throw sessionRevoked();
    const snapshot = this.requireSingleActive(await this.repository.findByAuthUserId(authUserId));
    if (snapshot.user_id !== authUserId) throw sessionRevoked();
    assertAdminCredentialVersion(snapshot.admin_auth_version, claimedVersion);
    return snapshot;
  }

  async getLoginSnapshot(employee: {
    id: string;
    phone: string | null;
    user_id: string | null;
    tenant_id: string | null;
    admin_auth_version?: number | null;
  }, phone: string): Promise<EmployeeAdminSecuritySnapshot> {
    const snapshot = this.requireSingleActive(await this.repository.findByEmployeeId(employee.id));
    if (snapshot.id !== employee.id || snapshot.phone !== phone || employee.phone !== phone
      || snapshot.user_id !== employee.user_id || snapshot.tenant_id !== employee.tenant_id) {
      throw sessionRevoked();
    }
    assertAdminCredentialVersion(snapshot.admin_auth_version, employee.admin_auth_version ?? undefined);
    return snapshot;
  }

  async assertLoginUnchanged(
    initial: EmployeeAdminSecuritySnapshot,
    authUserId: string,
  ): Promise<void> {
    const current = await this.assertSession(authUserId, initial.admin_auth_version);
    this.assertSameLogin(initial, current, authUserId);
  }

  async bindFirstLogin(initial: EmployeeAdminSecuritySnapshot, authUserId: string): Promise<void> {
    if (initial.user_id !== null || (await this.repository.findByAuthUserId(authUserId)).length > 0) {
      throw sessionRevoked();
    }
    const bound = this.requireSingleActive(await this.repository.bindFirstLogin(initial, authUserId));
    assertAdminCredentialVersion(bound.admin_auth_version, initial.admin_auth_version);
    this.assertSameLogin(initial, bound, authUserId);
  }

  private assertSameLogin(
    initial: EmployeeAdminSecuritySnapshot,
    current: EmployeeAdminSecuritySnapshot,
    authUserId: string,
  ): void {
    // Only tenant employees increment row version for our first user_id binding.
    // Platform rows are excluded by the trigger; credential version never changes.
    const isTenantFirstBinding = initial.user_id === null && initial.tenant_id !== null;
    const expectedVersion = initial.version + (isTenantFirstBinding ? 1 : 0);
    if (current.id !== initial.id || current.tenant_id !== initial.tenant_id
      || current.phone !== initial.phone || current.version !== expectedVersion
      || current.user_id !== authUserId
      || (initial.user_id !== null && initial.user_id !== authUserId)) {
      throw sessionRevoked();
    }
  }

  private requireSingleActive(rows: EmployeeAdminSecuritySnapshot[]): EmployeeAdminSecuritySnapshot {
    const snapshot = rows[0];
    if (rows.length !== 1 || !snapshot || !isEmployeeOperableStatus(snapshot.status)
      || !Number.isSafeInteger(snapshot.version) || snapshot.version < 1) {
      throw sessionRevoked();
    }
    return snapshot;
  }
}

export const employeeAdminSessionsService = new EmployeeAdminSessionsService();
