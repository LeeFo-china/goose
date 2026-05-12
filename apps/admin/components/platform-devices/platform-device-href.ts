import type { PlatformDevicesTabValue } from "@/components/platform-devices/platform-device-types";

export function buildPlatformDevicesHref(input: {
  tab?: PlatformDevicesTabValue;
  page?: number;
  vendor?: string;
  status?: string;
  onlyUnbound?: string;
  keyword?: string;
}) {
  const params = new URLSearchParams();
  if (input.tab && input.tab !== "ownership") params.set("tab", input.tab);
  if (input.page && input.page > 1) params.set("page", String(input.page));
  if (input.vendor && input.vendor !== "__all") params.set("vendor", input.vendor);
  if (input.status && input.status !== "__all") params.set("status", input.status);
  if (input.onlyUnbound === "true") params.set("only_unbound", "true");
  if (input.keyword) params.set("keyword", input.keyword);
  const query = params.toString();
  return query ? `/platform/devices?${query}` : "/platform/devices";
}
