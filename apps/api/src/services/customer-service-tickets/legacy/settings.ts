import { Errors, systemSettingsService } from "./shared";

export async function getCustomerServiceConfig(tenantId: string | null | undefined) {
  const options = { tenantId: tenantId ?? null };
  const [enabled, phone, workingHours, notice] = await Promise.all([
    systemSettingsService.getBoolean("CUSTOMER_SERVICE_ENABLED", false, options),
    systemSettingsService.getString("CUSTOMER_SERVICE_PHONE", "", options),
    systemSettingsService.getString("CUSTOMER_SERVICE_WORKING_HOURS", "", options),
    systemSettingsService.getString("CUSTOMER_SERVICE_NOTICE", "", options),
  ]);

  return {
    enabled,
    phone: phone || null,
    working_hours: workingHours || null,
    notice: notice || null,
  };
}

export async function assertCustomerServiceEnabled(tenantId: string) {
  const config = await getCustomerServiceConfig(tenantId);
  if (!config.enabled) {
    throw Errors.business(403, "客服入口未启用", "CUSTOMER_SERVICE_DISABLED");
  }
  return config;
}
