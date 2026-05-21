import { Errors } from "@/errors/error-factory";
import type { AuthContext } from "@/services/authorization";
import { accessPolicyService } from "@/services/access-policy";
import { customerPhonePrivacyService } from "@/services/customer-phone-privacy";
import { homeDashboardRepository } from "@/repositories/home-dashboard";

const HOME_DASHBOARD_CACHE_TTL_MS = 60_000;

function getMonthRange(now = new Date()) {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  return {
    monthStart: monthStart.toISOString(),
    nextMonthStart: nextMonthStart.toISOString(),
  };
}

class HomeDashboardService {
  private statsCache = new Map<string, {
    expiresAt: number;
    value: Awaited<ReturnType<HomeDashboardService["loadStats"]>>;
  }>();
  private statsInFlight = new Map<string, Promise<Awaited<ReturnType<HomeDashboardService["loadStats"]>>>>();

  private buildStatsCacheKey(authContext: AuthContext) {
    return [
      authContext.tenantId ?? "",
      authContext.employeeId ?? "",
      [...authContext.roleCodes].sort().join(","),
      authContext.permissions
        .map((item) => `${item.code}:${item.scope}`)
        .sort()
        .join(","),
    ].join(":");
  }

  private getCachedStats(cacheKey: string) {
    const cached = this.statsCache.get(cacheKey);
    if (!cached) {
      return null;
    }

    if (cached.expiresAt <= Date.now()) {
      this.statsCache.delete(cacheKey);
      return null;
    }

    return cached.value;
  }

  private setCachedStats(cacheKey: string, value: Awaited<ReturnType<HomeDashboardService["loadStats"]>>) {
    this.statsCache.set(cacheKey, {
      expiresAt: Date.now() + HOME_DASHBOARD_CACHE_TTL_MS,
      value,
    });
  }

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

  private async loadStats(authContext: AuthContext) {
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

  async getStats(authContext: AuthContext) {
    const cacheKey = this.buildStatsCacheKey(authContext);
    const cached = this.getCachedStats(cacheKey);
    if (cached) {
      return cached;
    }

    const inFlight = this.statsInFlight.get(cacheKey);
    if (inFlight) {
      return inFlight;
    }

    const request = this.loadStats(authContext)
      .then((result) => {
        this.setCachedStats(cacheKey, result);
        return result;
      })
      .finally(() => {
        if (this.statsInFlight.get(cacheKey) === request) {
          this.statsInFlight.delete(cacheKey);
        }
      });
    this.statsInFlight.set(cacheKey, request);
    return request;
  }
}

export const homeDashboardService = new HomeDashboardService();
