import { Errors } from "@/errors/error-factory";
import {
  identityDiagnosticsRepository,
  type IdentityDiagnosticCustomerRecord,
  type IdentityDiagnosticEmployeeRecord,
  type IdentityDiagnosticMembershipRecord,
  type IdentityDiagnosticOauthRecord,
} from "@/repositories/identity-diagnostics";
import type { IdentityDiagnosticsQuery } from "@/schema/identity-diagnostics";
import type { AuthContext } from "@/services/authorization";
import { platformAuthorizationService } from "@/services/platform-authorization";
import type { PermissionCode } from "@gooes/domain";

type DiagnosticSeverity = "ok" | "warning" | "danger";
const PLATFORM_IDENTITY_DIAGNOSTIC_READ_PERMISSION =
  "platform.identity_diagnostic.read" satisfies PermissionCode;

type DiagnosticIssue = {
  severity: DiagnosticSeverity;
  code: string;
  title: string;
  description: string;
  related_user_id?: string | null;
  related_identity_id?: string | null;
};

class IdentityDiagnosticsService {
  async inspect(query: IdentityDiagnosticsQuery, authContext: AuthContext) {
    this.assertIdentityDiagnosticReadPermission(authContext);

    const data = await identityDiagnosticsRepository.lookup(query.keyword);
    const issues = this.buildIssues(data);
    const current = {
      memberships: data.memberships.filter((item) => item.status === "active"),
      oauth_identities: data.oauth_identities.filter((item) => item.status === "active"),
    };
    const history = {
      memberships: data.memberships.filter((item) => item.status !== "active"),
      oauth_identities: data.oauth_identities.filter((item) => item.status !== "active"),
    };

    return {
      ...data,
      current,
      history,
      summary: {
        auth_user_count: data.auth_users.length,
        oauth_identity_count: data.oauth_identities.length,
        active_oauth_identity_count: current.oauth_identities.length,
        history_oauth_identity_count: history.oauth_identities.length,
        membership_count: data.memberships.length,
        active_membership_count: current.memberships.length,
        history_membership_count: history.memberships.length,
        customer_count: data.customers.length,
        employee_count: data.employees.length,
        event_count: data.auth_events.length,
        issue_count: issues.length,
        danger_count: issues.filter((item) => item.severity === "danger").length,
        warning_count: issues.filter((item) => item.severity === "warning").length,
      },
      issues,
    };
  }

  private assertIdentityDiagnosticReadPermission(authContext: AuthContext) {
    const isPlatformIdentity =
      authContext.isPlatformStaff === true || authContext.isPlatformAdmin === true;
    if (authContext.tenantId !== null || !isPlatformIdentity) {
      throw Errors.forbidden();
    }
    platformAuthorizationService.assertPermission(
      authContext,
      PLATFORM_IDENTITY_DIAGNOSTIC_READ_PERMISSION,
    );
  }

  private buildIssues(data: Awaited<ReturnType<typeof identityDiagnosticsRepository.lookup>>) {
    const issues: DiagnosticIssue[] = [];
    const activeMemberships = data.memberships.filter((item) => item.status === "active");

    for (const customer of data.customers) {
      if (!customer.user_id) continue;

      const matched = activeMemberships.some((membership) => (
        membership.user_id === customer.user_id &&
        membership.identity_type === "customer" &&
        membership.identity_id === customer.id &&
        membership.tenant_id === customer.tenant_id
      ));

      if (!matched) {
        issues.push({
          severity: "danger",
          code: "legacy_customer_without_membership",
          title: "客户旧绑定缺少 active membership",
          description: "customers.user_id 有值，但没有匹配的 active customer membership。",
          related_user_id: customer.user_id,
          related_identity_id: customer.id,
        });
      }
    }

    for (const employee of data.employees) {
      if (!employee.user_id) continue;

      const matched = activeMemberships.some((membership) => (
        membership.user_id === employee.user_id &&
        membership.identity_type === "employee" &&
        membership.identity_id === employee.id &&
        membership.tenant_id === employee.tenant_id
      ));

      if (!matched) {
        issues.push({
          severity: "danger",
          code: "legacy_employee_without_membership",
          title: "员工旧绑定缺少 active membership",
          description: "employees.user_id 有值，但没有匹配的 active employee membership。",
          related_user_id: employee.user_id,
          related_identity_id: employee.id,
        });
      }
    }

    for (const membership of activeMemberships) {
      if (membership.identity_type === "customer") {
        this.checkCustomerMembership(membership, data.customers, issues);
      }

      if (membership.identity_type === "employee") {
        this.checkEmployeeMembership(membership, data.employees, issues);
      }
    }

    for (const oauth of data.oauth_identities) {
      this.checkOauthIdentity(
        oauth,
        data.oauth_identities,
        issues,
      );
    }

    if (
      data.auth_users.length === 0 &&
      data.oauth_identities.length === 0 &&
      data.memberships.length === 0 &&
      data.customers.length === 0 &&
      data.employees.length === 0
    ) {
      issues.push({
        severity: "warning",
        code: "no_identity_data_found",
        title: "未找到身份数据",
        description: "当前关键词没有匹配到登录凭证、业务身份、客户或员工档案。",
      });
    }

    return issues;
  }

  private checkCustomerMembership(
    membership: IdentityDiagnosticMembershipRecord,
    customers: IdentityDiagnosticCustomerRecord[],
    issues: DiagnosticIssue[],
  ) {
    const customer = customers.find((item) => item.id === membership.identity_id);
    if (!customer) {
      issues.push({
        severity: "danger",
        code: "customer_membership_missing_identity",
        title: "客户 membership 指向的档案不存在",
        description: "active customer membership 的 identity_id 没有匹配到 customers 记录。",
        related_user_id: membership.user_id,
        related_identity_id: membership.identity_id,
      });
      return;
    }

    if (customer.tenant_id !== membership.tenant_id) {
      issues.push({
        severity: "danger",
        code: "customer_membership_tenant_mismatch",
        title: "客户 membership 租户不一致",
        description: "membership.tenant_id 与 customers.tenant_id 不一致。",
        related_user_id: membership.user_id,
        related_identity_id: membership.identity_id,
      });
    }

    if (customer.user_id && customer.user_id !== membership.user_id) {
      issues.push({
        severity: "warning",
        code: "customer_legacy_user_mismatch",
        title: "客户旧字段与 membership 用户不一致",
        description: "customers.user_id 与 membership.user_id 不一致，需要确认旧字段是否已过期。",
        related_user_id: membership.user_id,
        related_identity_id: membership.identity_id,
      });
    }
  }

  private checkEmployeeMembership(
    membership: IdentityDiagnosticMembershipRecord,
    employees: IdentityDiagnosticEmployeeRecord[],
    issues: DiagnosticIssue[],
  ) {
    const employee = employees.find((item) => item.id === membership.identity_id);
    if (!employee) {
      issues.push({
        severity: "danger",
        code: "employee_membership_missing_identity",
        title: "员工 membership 指向的档案不存在",
        description: "active employee membership 的 identity_id 没有匹配到 employees 记录。",
        related_user_id: membership.user_id,
        related_identity_id: membership.identity_id,
      });
      return;
    }

    if (employee.tenant_id !== membership.tenant_id) {
      issues.push({
        severity: "danger",
        code: "employee_membership_tenant_mismatch",
        title: "员工 membership 租户不一致",
        description: "membership.tenant_id 与 employees.tenant_id 不一致。",
        related_user_id: membership.user_id,
        related_identity_id: membership.identity_id,
      });
    }

    if (employee.user_id && employee.user_id !== membership.user_id) {
      issues.push({
        severity: "warning",
        code: "employee_legacy_user_mismatch",
        title: "员工旧字段与 membership 用户不一致",
        description: "employees.user_id 与 membership.user_id 不一致，需要确认旧字段是否已过期。",
        related_user_id: membership.user_id,
        related_identity_id: membership.identity_id,
      });
    }
  }

  private checkOauthIdentity(
    oauth: IdentityDiagnosticOauthRecord,
    oauthRows: IdentityDiagnosticOauthRecord[],
    issues: DiagnosticIssue[],
  ) {
    if (oauth.platform !== "wechat_mini") return;

    const hasActiveOauthForSameCredential = oauthRows.some((item) => (
      item.user_id === oauth.user_id &&
      item.platform === oauth.platform &&
      item.openid === oauth.openid &&
      item.status === "active"
    ));

    if (oauth.status === "unbound" && !hasActiveOauthForSameCredential) {
      issues.push({
        severity: "warning",
        code: "unbound_oauth_without_active_replacement",
        title: "已解绑 OAuth 缺少 active 替代凭证",
        description: "该 openid 已标记 unbound，当前用户没有相同 openid 的 active OAuth 记录。",
        related_user_id: oauth.user_id,
      });
    }
  }
}

export const identityDiagnosticsService = new IdentityDiagnosticsService();
