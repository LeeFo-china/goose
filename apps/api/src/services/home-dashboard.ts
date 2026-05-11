import { Errors } from "@/errors/error-factory";
import type { AuthContext } from "@/services/authorization";
import { accessPolicyService } from "@/services/access-policy";
import { customerPhonePrivacyService } from "@/services/customer-phone-privacy";
import { homeDashboardRepository } from "@/repositories/home-dashboard";

function getMonthRange(now = new Date()) {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  return {
    monthStart: monthStart.toISOString(),
    nextMonthStart: nextMonthStart.toISOString(),
  };
}

class HomeDashboardService {
  private assertTenantScope(authContext: AuthContext) {
    if (!authContext.employeeId) {
      throw Errors.business(403, "员工身份缺失，无法查看首页统计", "EMPLOYEE_TENANT_MISSING");
    }

    if (!authContext.tenantId) {
      throw Errors.business(403, "员工未绑定装修公司，无法查看首页统计", "EMPLOYEE_TENANT_MISSING");
    }

    if (authContext.tenantStatus && authContext.tenantStatus !== "active") {
      throw Errors.business(403, "装修公司状态不可用", "TENANT_NOT_AVAILABLE", {
        tenant_id: authContext.tenantId,
        tenant_status: authContext.tenantStatus,
      });
    }

    accessPolicyService.assertPermission(authContext, "dashboard.read");
    return authContext.tenantId;
  }

  async getStats(authContext: AuthContext) {
    const tenantId = this.assertTenantScope(authContext);
    const { monthStart, nextMonthStart } = getMonthRange();

    const [
      activeProjects,
      totalCustomers,
      monthRevenue,
      latestCustomers,
      latestProjects,
    ] = await Promise.all([
      homeDashboardRepository.countActiveProjects(tenantId),
      homeDashboardRepository.countCustomers(tenantId),
      homeDashboardRepository.sumMonthRevenue(tenantId, monthStart, nextMonthStart),
      homeDashboardRepository.listLatestCustomers(tenantId),
      homeDashboardRepository.listLatestProjects(tenantId),
    ]);

    return {
      stats: {
        month_revenue: Number(monthRevenue.toFixed(2)),
        active_projects: activeProjects,
        total_customers: totalCustomers,
        pending_tasks: 0,
      },
      latest_customers: latestCustomers.map((item) => ({
        ...item,
        phone: null,
        phone_masked: customerPhonePrivacyService.maskPhone(item.phone),
        can_view_phone: false,
      })),
      latest_projects: latestProjects,
      scope: {
        type: "tenant",
        tenant_id: tenantId,
        tenant_name: authContext.tenantName,
      },
      generated_at: new Date().toISOString(),
    };
  }
}

export const homeDashboardService = new HomeDashboardService();
