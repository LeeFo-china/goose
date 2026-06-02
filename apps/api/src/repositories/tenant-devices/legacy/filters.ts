import type {
  TenantDeviceFilterableQuery,
  TenantDeviceListQueryInput,
} from "./shared";

export function applyListFilters<T extends TenantDeviceFilterableQuery<T>>(
  query: T,
  input: TenantDeviceListQueryInput,
) {
  const keyword = input.keyword?.trim();
  let request = query;

  if (input.vendor) {
    request = request.eq("vendor", input.vendor);
  }
  if (input.status) {
    request = request.eq("status", input.status);
  }
  if (input.only_unbound) {
    request = request.is("bound_camera_id", null);
  }
  if (keyword) {
    const safeKeyword = keyword.replace(/[%,()]/g, " ").replace(/\s+/g, " ");
    request = request.or([
      `vendor_device_serial.ilike.%${safeKeyword}%`,
      `vendor_device_code.ilike.%${safeKeyword}%`,
      `vendor_device_name.ilike.%${safeKeyword}%`,
      `vendor_channel_id.ilike.%${safeKeyword}%`,
      `vendor_channel_code.ilike.%${safeKeyword}%`,
      `vendor_channel_name.ilike.%${safeKeyword}%`,
    ].join(","));
  }

  return request;
}

export function uniqueIds(ids: Array<string | null | undefined>) {
  return Array.from(new Set(ids.filter((id): id is string => Boolean(id))));
}
