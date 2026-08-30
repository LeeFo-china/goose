import { Errors, EMPTY_USAGE } from "./shared";
import type { PlatformTenantListQuery, PlatformTenantRecord, PlatformTenantStatus, UpdatePlatformTenantInput } from "./shared";

const TENANT_ADDRESS_FIELDS = [
  "address",
  "address_title",
  "address_poi_id",
  "address_province",
  "address_city",
  "address_district",
  "address_adcode",
  "address_latitude",
  "address_longitude",
  "address_source",
  "address_confidence",
  "address_confirmed_at",
] as const;

function toTenantAddressPatch(
  input: UpdatePlatformTenantInput,
  options: { onlyProvided?: boolean } = {},
) {
  const patch: Partial<Record<
    typeof TENANT_ADDRESS_FIELDS[number],
    string | number | null
  >> = {};
  for (const field of TENANT_ADDRESS_FIELDS) {
    if (options.onlyProvided && !(field in input)) continue;
    patch[field] = input[field] ?? null;
  }

  return {
    ...patch,
  };
}

export async function list(this: any, query: PlatformTenantListQuery) {
  const from = (query.page - 1) * query.pageSize;
  const to = from + query.pageSize - 1;

  let request = this.from("tenants")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (query.status) {
    request = request.eq("status", query.status);
  }

  if (query.keyword) {
    const keyword = query.keyword.replace(/[,()]/g, " ").trim();
    if (keyword) {
      request = request.or(
        `name.ilike.%${keyword}%,slug.ilike.%${keyword}%,address.ilike.%${keyword}%,address_title.ilike.%${keyword}%,address_city.ilike.%${keyword}%,address_district.ilike.%${keyword}%,contact_name.ilike.%${keyword}%,contact_phone.ilike.%${keyword}%`,
      );
    }
  }

  const { data, error, count } = await request;
  if (error) {
    throw Errors.dbError("查询租户列表失败", error);
  }

  const records = (data || []) as PlatformTenantRecord[];
  const usageMap = await this.getUsageStats(records.map((item) => item.id));

  return {
    list: records.map((item) => ({
      ...item,
      usage: usageMap.get(item.id) ?? { ...EMPTY_USAGE },
    })),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total: count || 0,
      totalPages: count ? Math.ceil(count / query.pageSize) : 0,
    },
  };
}

export async function findById(this: any, id: string) {
  const { data, error } = await this.from("tenants")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw Errors.dbError("查询租户失败", error);
  }

  return (data || null) as PlatformTenantRecord | null;
}

export async function findBySlug(this: any, slug: string) {
  const { data, error } = await this.from("tenants")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw Errors.dbError("查询租户标识失败", error);
  }

  return (data || null) as PlatformTenantRecord | null;
}

export async function update(this: any, id: string, input: UpdatePlatformTenantInput) {
  const { data, error } = await this.from("tenants")
    .update({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...toTenantAddressPatch(input, { onlyProvided: true }),
      ...(input.contact_name !== undefined ? { contact_name: input.contact_name ?? null } : {}),
      ...(input.contact_phone !== undefined ? { contact_phone: input.contact_phone ?? null } : {}),
    })
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    throw Errors.dbError("更新租户失败", error);
  }

  return (data || null) as PlatformTenantRecord | null;
}

export async function updateStatus(this: any, id: string, status: Exclude<PlatformTenantStatus, "archived">) {
  const { data, error } = await this.from("tenants")
    .update({ status })
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    throw Errors.dbError("更新租户状态失败", error);
  }

  return (data || null) as PlatformTenantRecord | null;
}
