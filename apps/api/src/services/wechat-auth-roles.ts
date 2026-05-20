import {
  wechatAuthRoleRepository,
  type WechatAuthCustomerRoleRow,
  type WechatAuthEmployeeRoleRow,
} from "@/repositories/wechat-auth-roles";
import { userIdentityService } from "@/services/user-identities";

class WechatAuthRoleService {
  private normalizeTenantRelation(
    value: WechatAuthEmployeeRoleRow["tenant"] | WechatAuthCustomerRoleRow["tenant"],
  ) {
    if (Array.isArray(value)) {
      return value[0] ?? null;
    }

    return value ?? null;
  }

  private hasActiveEmployee(rows: WechatAuthEmployeeRoleRow[]) {
    return rows.some((item) => {
      const tenant = this.normalizeTenantRelation(item.tenant);
      return item.status === "active" && tenant?.status === "active";
    });
  }

  private hasActiveCustomer(rows: WechatAuthCustomerRoleRow[]) {
    return rows.some((item) => {
      const tenant = this.normalizeTenantRelation(item.tenant);
      return tenant?.status === "active";
    });
  }

  async getUserRoles(input: {
    userId: string;
    memberships?: Awaited<ReturnType<typeof userIdentityService.listActiveBusinessMemberships>>;
  }) {
    const memberships = input.memberships ??
      await userIdentityService.listActiveBusinessMemberships({
        userId: input.userId,
      });
    const employeeIds = Array.from(new Set(
      memberships
        .filter((item) => item.identity_type === "employee")
        .map((item) => item.identity_id),
    ));
    const customerIds = Array.from(new Set(
      memberships
        .filter((item) => item.identity_type === "customer")
        .map((item) => item.identity_id),
    ));

    const [employees, customers] = await Promise.all([
      wechatAuthRoleRepository.listEmployeesByIds(employeeIds),
      wechatAuthRoleRepository.listCustomersByIds(customerIds),
    ]);

    const roles = new Set<string>();
    if (this.hasActiveEmployee(employees)) {
      roles.add("employee");
    }

    if (this.hasActiveCustomer(customers)) {
      roles.add("customer");
    }

    if (roles.size === 0) {
      return ["visitor"];
    }

    return Array.from(roles);
  }
}

export const wechatAuthRoleService = new WechatAuthRoleService();
