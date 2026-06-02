import {
  getPlatformOverview,
  listPlatformTenantUsage,
} from "./legacy/platform";
import {
  listPlatformAiLogs,
  listPlatformSmsLogs,
  listPlatformSocialVideoLogs,
  listTenantAiLogs,
  listTenantSmsLogs,
  listTenantSocialVideoLogs,
} from "./legacy/logs";
import {
  getTenantOverview,
  getTenantSummary,
} from "./legacy/tenant";

class UsageService {
  getTenantSummary = getTenantSummary;
  getTenantOverview = getTenantOverview;
  listPlatformTenantUsage = listPlatformTenantUsage;
  getPlatformOverview = getPlatformOverview;
  listTenantAiLogs = listTenantAiLogs;
  listTenantSmsLogs = listTenantSmsLogs;
  listTenantSocialVideoLogs = listTenantSocialVideoLogs;
  listPlatformAiLogs = listPlatformAiLogs;
  listPlatformSmsLogs = listPlatformSmsLogs;
  listPlatformSocialVideoLogs = listPlatformSocialVideoLogs;
}

export const usageService = new UsageService();
