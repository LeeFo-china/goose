import { getAdminSession } from "@/lib/auth";
import {
  defaultPlatformDateFrom,
  defaultPlatformDateTo,
  fetchPlatformOverview,
  fetchTenantOverview,
} from "./dashboard-data";
import {
  PlatformAdminDashboard,
  TenantAdminDashboard,
} from "./dashboard-sections";

export default async function DashboardPage() {
  const dateFrom = defaultPlatformDateFrom();
  const dateTo = defaultPlatformDateTo();
  const session = await getAdminSession();

  if (session?.roles.includes("platform_admin")) {
    const overviewResult = await fetchPlatformOverview(dateFrom, dateTo);
    return (
      <PlatformAdminDashboard
        overview={overviewResult.data}
        error={overviewResult.error}
        dateFrom={dateFrom}
        dateTo={dateTo}
      />
    );
  }

  const overviewResult = await fetchTenantOverview(dateFrom, dateTo);
  return (
    <TenantAdminDashboard
      overview={overviewResult.data}
      error={overviewResult.error}
      dateFrom={dateFrom}
      dateTo={dateTo}
    />
  );
}
