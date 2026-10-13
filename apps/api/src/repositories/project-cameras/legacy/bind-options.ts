import { Errors, cleanSearchKeyword, serializeBindProjectOption } from "./shared";
import type {
  ProjectCameraBindOptionsQueryInput,
  ProjectCameraBindProjectRow,
} from "./shared";

export async function findSearchCustomerIds(this: any, keyword: string, tenantId?: string | null) {
  if (!keyword) return [] as string[];

  const likeKeyword = `%${keyword}%`;
  let query = this.adminClient
    .from("customers")
    .select("id")
    .or(`name.ilike.${likeKeyword},phone.ilike.${likeKeyword}`);

  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }

  const { data, error } = await query.limit(100);

  if (error) {
    throw Errors.dbError("查询客户匹配项目失败", error);
  }

  return ((data || []) as Array<{ id?: string | null }>)
    .map((item) => (item as { id?: string | null }).id)
    .filter((id): id is string => Boolean(id));
}

export async function findSearchPropertyIds(this: any, keyword: string, tenantId?: string | null) {
  if (!keyword) return [] as string[];

  const likeKeyword = `%${keyword}%`;
  let query = this.adminClient
    .from("properties")
    .select("id")
    .or(`community.ilike.${likeKeyword},building_info.ilike.${likeKeyword},layout.ilike.${likeKeyword}`);

  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }

  const { data, error } = await query.limit(100);

  if (error) {
    throw Errors.dbError("查询房产匹配项目失败", error);
  }

  return ((data || []) as Array<{ id?: string | null }>)
    .map((item) => (item as { id?: string | null }).id)
    .filter((id): id is string => Boolean(id));
}

export async function listCameraBindProjectOptions(this: any, 
  input: ProjectCameraBindOptionsQueryInput & {
    tenantId?: string | null;
    visibleProjectIds: string[] | null;
  },
) {
  const page = input.page;
  const pageSize = input.pageSize;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const keyword = cleanSearchKeyword(input.keyword);

  if (Array.isArray(input.visibleProjectIds) && input.visibleProjectIds.length === 0) {
    return {
      list: [],
      pagination: {
        page,
        pageSize,
        total: 0,
        totalPages: 0,
      },
    };
  }

  const [customerIds, propertyIds] = await Promise.all([
    this.findSearchCustomerIds(keyword, input.tenantId),
    this.findSearchPropertyIds(keyword, input.tenantId),
  ]);

  let query = this.adminClient
    .from("projects")
    .select(
      `
      id,
      tenant_id,
      name,
      status,
      address,
      customer_id,
      property_id,
      customer:customers!projects_customer_id_fkey(id, name, phone),
      property:properties!projects_property_id_fkey(id, community, building_info, layout, area)
      `,
      { count: "exact" },
    );

  if (input.visibleProjectIds) {
    query = query.in("id", input.visibleProjectIds);
  }
  if (input.tenantId) {
    query = query.eq("tenant_id", input.tenantId);
  }

  if (keyword) {
    const likeKeyword = `%${keyword}%`;
    const filters = [
      `name.ilike.${likeKeyword}`,
      `address.ilike.${likeKeyword}`,
    ];
    if (customerIds.length) {
      filters.push(`customer_id.in.(${customerIds.join(",")})`);
    }
    if (propertyIds.length) {
      filters.push(`property_id.in.(${propertyIds.join(",")})`);
    }
    query = query.or(filters.join(","));
  }

  const { data, error, count } = await query
    .order("created_at", { ascending: false, nullsFirst: false })
    .range(from, to);

  if (error) {
    throw Errors.dbError("查询绑定项目选项失败", error);
  }

  const rows = ((data || []) as ProjectCameraBindProjectRow[]).map(
    serializeBindProjectOption,
  );
  const selectedProjectId = input.selected_project_id;
  if (
    selectedProjectId &&
    !rows.some((item) => item.id === selectedProjectId) &&
    (!input.visibleProjectIds || input.visibleProjectIds.includes(selectedProjectId))
  ) {
    let selectedQuery = this.adminClient
      .from("projects")
      .select(`
        id,
        tenant_id,
        name,
        status,
        address,
        customer_id,
        property_id,
        customer:customers!projects_customer_id_fkey(id, name, phone),
        property:properties!projects_property_id_fkey(id, community, building_info, layout, area)
      `)
      .eq("id", selectedProjectId);

    if (input.tenantId) {
      selectedQuery = selectedQuery.eq("tenant_id", input.tenantId);
    }

    const { data: selected, error: selectedError } = await selectedQuery.maybeSingle();

    if (selectedError) {
      throw Errors.dbError("查询当前绑定项目失败", selectedError);
    }

    if (selected) {
      rows.unshift(serializeBindProjectOption(selected as ProjectCameraBindProjectRow));
    }
  }

  return {
    list: rows,
    pagination: {
      page,
      pageSize,
      total: count || 0,
      totalPages: count ? Math.ceil(count / pageSize) : 0,
    },
  };
}

export { listCameraProjectGroups } from "../workspace";
