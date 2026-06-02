import { Errors, cleanSearchKeyword, firstRelation, serializeBindProjectOption } from "./shared";
import type {
  ProjectCameraBindOptionsQueryInput,
  ProjectCameraBindProjectRow,
  ProjectCameraProjectGroupRow,
  ProjectCameraProjectGroupsQueryInput,
  ProjectCameraWithProjectRow,
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

export async function listCameraProjectGroups(this: any, 
  input: ProjectCameraProjectGroupsQueryInput & {
    tenantId?: string | null;
    visibleProjectIds: string[] | null;
  },
) {
  const page = input.page;
  const pageSize = input.pageSize;
  const from = (page - 1) * pageSize;
  const to = from + pageSize;
  const keyword = cleanSearchKeyword(input.keyword).toLowerCase();

  if (Array.isArray(input.visibleProjectIds) && input.visibleProjectIds.length === 0) {
    return {
      list: [] as ProjectCameraProjectGroupRow[],
      pagination: {
        page,
        pageSize,
        total: 0,
        totalPages: 0,
      },
      summary: {
        project_count: 0,
        total_camera_count: 0,
        online_count: 0,
        hidden_count: 0,
        tencent_count: 0,
      },
    };
  }

  let query = this.adminClient
    .from("project_cameras")
    .select(`
      *,
      project:projects!project_cameras_project_id_fkey(
        id,
        tenant_id,
        name,
        status,
        address,
        customer_id,
        property_id,
        customer:customers!projects_customer_id_fkey(id, name, phone),
        property:properties!projects_property_id_fkey(id, community, building_info, layout, area)
      )
    `)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });

  if (input.visibleProjectIds) {
    query = query.in("project_id", input.visibleProjectIds);
  }
  if (input.tenantId) {
    query = query.eq("tenant_id", input.tenantId);
  }

  const { data, error } = await query;

  if (error) {
    throw Errors.dbError("查询项目摄像头分组失败", error);
  }

  const groupMap = new Map<string, ProjectCameraProjectGroupRow>();

  for (const row of (data || []) as ProjectCameraWithProjectRow[]) {
    const project = firstRelation(row.project);
    if (!project?.id) continue;

    const projectOption = serializeBindProjectOption(project);
    const searchable = [
      projectOption.label,
      projectOption.name,
      projectOption.customer_name,
      projectOption.phone_masked,
      projectOption.address,
      projectOption.property?.community,
      projectOption.property?.building_info,
      projectOption.property?.layout,
    ].filter(Boolean).join(" ").toLowerCase();

    if (keyword && !searchable.includes(keyword)) continue;

    const existing = groupMap.get(project.id);
    if (existing) {
      existing.cameras.push(row);
    } else {
      groupMap.set(project.id, {
        project: projectOption,
        cameras: [row],
      });
    }
  }

  const groups = Array.from(groupMap.values());
  const allCameras = groups.flatMap((group) => group.cameras);
  const pageGroups = groups.slice(from, to);

  return {
    list: pageGroups,
    pagination: {
      page,
      pageSize,
      total: groups.length,
      totalPages: groups.length ? Math.ceil(groups.length / pageSize) : 0,
    },
    summary: {
      project_count: groups.length,
      total_camera_count: allCameras.length,
      online_count: allCameras.filter((camera) => camera.status === "online").length,
      hidden_count: allCameras.filter((camera) => !camera.can_view).length,
      tencent_count: allCameras.filter((camera) =>
        camera.vendor === "tencent_iotvideo_industry"
      ).length,
    },
  };
}
