import { BaseController } from "@/controllers/BaseController";
import { CreateProjectSchema, UpdateProjectSchema } from "@/schema/projects";
import { SupabaseDB } from "@/utils/supabase/index";
import { Errors } from "@/errors/error-factory";
import { Delete, Get, Patch, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
  CreateProjectMemberSchema,
  ProjectListQuerySchema,
  ProjectMemberParamsSchema,
  UpdateProjectMemberSchema,
} from "@/schema/projects";
import { projectSer } from "@/services/projects";
import {
  ProjectCreateSelectCustomerQuerySchema,
  type ProjectCreateSelectCustomerQueryType,
  ProjectMemberCandidateQuerySchema,
  type ProjectMemberCandidateQueryType,
  ProjectCreateSelectEmployeeQuerySchema,
  type ProjectCreateSelectEmployeeQueryType,
  type ProjectCreateSelectEmployeeScene,
} from "@/schema/project-create-select";
import type { Tables } from "@/types/database";
import {
  PROJECT_MEMBER_ROLE_CONFIG,
  PROJECT_LOG_STAGE_CONFIG,
  ProjectStatusConfig,
  isProjectLogStageCode,
  isProjectStatus,
  type PostCode,
  type ProjectMemberRoleCode,
  type ProjectLogStageCode,
} from "@gooes/domain";
import { authorizationService } from "@/services/authorization";
import { accessPolicyService } from "@/services/access-policy";
import { projectMemberService } from "@/services/project-members";

type ProjectCreateSelectCustomerRow = Pick<
  Tables<"customers">,
  "id" | "name" | "phone"
>;
type ProjectCreateSelectEmployeeRow =
  & Pick<
    Tables<"employees">,
    "id" | "name" | "phone" | "avatar"
  >
  & {
    department:
      | Array<Pick<Tables<"departments">, "id" | "name" | "code">>
      | null;
    post:
      | Array<Pick<Tables<"posts">, "id" | "name" | "code">>
      | null;
  };

type ProjectCreateCustomerOption = {
  id: string;
  name: string | null;
  phone: string | null;
};

type ProjectCreateEmployeeOption = {
  id: string;
  name: string | null;
  phone: string | null;
  avatar: string | null;
  role_label: string | null;
  department: {
    id: string;
    name: string;
  } | null;
  department_name: string | null;
  post: {
    id: string;
    name: string | null;
    code: string | null;
  } | null;
  post_code: string | null;
  post_name: string | null;
};

type ProjectMemberEmployeeSummary = {
  id: string;
  name: string | null;
  avatar: string | null;
  phone: string | null;
};

type ProjectMemberSummary = {
  id: string;
  project_id: string;
  employee_id: string;
  role_code: ProjectMemberRoleCode;
  role_name: string;
  is_primary: boolean;
  sort_order: number;
  created_at: string | null;
  updated_at?: string | null;
  employee: ProjectMemberEmployeeSummary | null;
  is_virtual?: boolean;
};

type ProjectMemberRoleOption = {
  role_code: ProjectMemberRoleCode;
  role_name: string;
  category: "core" | "extended";
  is_core: boolean;
  sort_order: number;
  status: "active" | "inactive";
};

type PublicProjectMemberSummary = {
  id: string;
  role_code: ProjectMemberRoleCode;
  role_name: string;
  employee_id: string;
  employee_name: string | null;
  avatar: string | null;
  is_primary: boolean;
  sort_order: number;
};

type PublicProjectLogSummary = {
  id: string;
  project_id: string;
  stage_code: ProjectLogStageCode | null;
  stage_label: string | null;
  node_name: string | null;
  content: string | null;
  images: string[];
  created_at: string | null;
};

class ProjectController extends BaseController<
  typeof CreateProjectSchema,
  typeof UpdateProjectSchema
> {
  private publicProjectVisibleStatuses = ["signed", "constructing", "completed"] as const;

  private publicProjectListSelect = `
    id,
    name,
    status,
    budget,
    start_date,
    created_at,
    address,
    style_tags,
    visibility_status,
    customer:customers!projects_customer_id_fkey(
      id,
      name
    ),
    property:properties!projects_property_id_fkey(
      id,
      community,
      building_info,
      area,
      layout,
      latitude,
      longitude
    ),
    designer:employees!projects_designer_id_fkey(
      id,
      name,
      avatar
    ),
    supervisor:employees!projects_supervisor_id_fkey(
      id,
      name,
      avatar
    )
  `;

  private publicProjectDetailSelect = `
    id,
    name,
    status,
    budget,
    start_date,
    address,
    style_tags,
    visibility_status,
    customer:customers!projects_customer_id_fkey(
      name
    ),
    property:properties!projects_property_id_fkey(
      id,
      community,
      building_info,
      layout,
      area,
      latitude,
      longitude
    )
  `;

  private projectListSelect = `
    id,
    name,
    status,
    budget,
    start_date,
    created_at,
    address,
    customer:customers!projects_customer_id_fkey(
      id,
      name
    ),
    property:properties!projects_property_id_fkey(
      community,
      building_info
    ),
    designer:employees!projects_designer_id_fkey(
      id,
      name
    ),
    supervisor:employees!projects_supervisor_id_fkey(
      id,
      name
    )
  `;

  private projectDetailSelect = `
    *,
    customer:customers!projects_customer_id_fkey(
      id,
      name,
      phone,
      owner_id,
      owner:employees!customers_owner_id_fkey(
        id,
        name,
        avatar,
        phone
      )
    ),
    property:properties!projects_property_id_fkey(
      id,
      community,
      building_info,
      layout,
      area,
      latitude,
      longitude
    ),
    designer:employees!projects_designer_id_fkey(
      id,
      name,
      avatar,
      phone
    ),
    supervisor:employees!projects_supervisor_id_fkey(
      id,
      name,
      avatar,
      phone
    )
  `;

  constructor() {
    super("projects", CreateProjectSchema, UpdateProjectSchema);
  }

  private async getRequiredAuthContext(request: FastifyRequest) {
    const authContext = await authorizationService.getRequiredAuthContext(
      request.user?.sub,
    );
    request.authContext = authContext;
    return authContext;
  }

  private applyProjectIdsFilter(query: any, visibleProjectIds: string[] | null) {
    if (visibleProjectIds === null) {
      return query;
    }

    if (visibleProjectIds.length === 0) {
      return query.eq("id", "00000000-0000-0000-0000-000000000000");
    }

    return query.in("id", visibleProjectIds);
  }

  private async getProjectListVisibleIds(
    request: FastifyRequest,
    ownership?: "self" | "all",
  ) {
    return accessPolicyService.getVisibleProjectIdsByOwnership(
      await this.getRequiredAuthContext(request),
      "project.read",
      ownership,
    );
  }

  private normalizeRelation<T extends Record<string, unknown>>(
    value: unknown,
    fallback: T,
  ): T {
    if (Array.isArray(value)) {
      const first = value[0];
      if (first && typeof first === "object") {
        return { ...fallback, ...(first as T) };
      }

      return fallback;
    }

    if (value && typeof value === "object") {
      return { ...fallback, ...(value as T) };
    }

    return fallback;
  }

  private normalizeStringArray(value: unknown) {
    if (!Array.isArray(value)) {
      return [] as string[];
    }

    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private normalizeProjectLogImages(images: unknown) {
    if (!Array.isArray(images)) {
      return [] as string[];
    }

    return images
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        if (/^https?:\/\//i.test(item)) {
          return item;
        }

        return SupabaseDB.getAdminClient()
          .storage
          .from("project-logs")
          .getPublicUrl(item)
          .data.publicUrl;
      });
  }

  private isPublicProjectVisible(row: Record<string, unknown>) {
    const visibilityStatus =
      typeof row.visibility_status === "string" ? row.visibility_status : "inherit";
    const status = typeof row.status === "string" ? row.status : null;

    if (visibilityStatus === "hidden") {
      return false;
    }

    if (visibilityStatus === "public") {
      return true;
    }

    return status
      ? this.publicProjectVisibleStatuses.includes(
          status as (typeof this.publicProjectVisibleStatuses)[number],
        )
      : false;
  }

  private applyPublicProjectVisibilityQuery(query: any) {
    return query
      .neq("visibility_status", "hidden")
      .or("status.in.(signed,constructing,completed),visibility_status.eq.public");
  }

  private serializePublicProjectMember(item: {
    id: string;
    role_code: ProjectMemberRoleCode;
    role_name: string | null;
    employee_id: string;
    is_primary: boolean;
    sort_order: number | null;
    employee: ProjectMemberEmployeeSummary | null;
  }): PublicProjectMemberSummary {
    const roleConfig = PROJECT_MEMBER_ROLE_CONFIG[item.role_code];

    return {
      id: item.id,
      role_code: item.role_code,
      role_name: item.role_name ?? roleConfig.label,
      employee_id: item.employee_id,
      employee_name: item.employee?.name ?? null,
      avatar: item.employee?.avatar ?? null,
      is_primary: item.is_primary,
      sort_order: item.sort_order ?? roleConfig.sortOrder,
    };
  }

  private async getPublicProjectMembers(projectId: string) {
    const members = await projectMemberService.listProjectMembers(projectId);
    return members
      .filter((item) => item.role_code !== "customer_owner")
      .map((item) => this.serializePublicProjectMember(item));
  }

  private serializePublicProjectLog(row: Record<string, unknown>): PublicProjectLogSummary {
    const rawStageCode = typeof row.stage_code === "string" ? row.stage_code : null;
    const stageCode: ProjectLogStageCode | null = isProjectLogStageCode(rawStageCode)
      ? rawStageCode
      : null;

    return {
      id: typeof row.id === "string" ? row.id : "",
      project_id: typeof row.project_id === "string" ? row.project_id : "",
      stage_code: stageCode,
      stage_label: stageCode ? PROJECT_LOG_STAGE_CONFIG[stageCode].label : null,
      node_name: typeof row.node_name === "string" ? row.node_name : null,
      content: typeof row.content === "string" ? row.content : null,
      images: this.normalizeProjectLogImages(row.images),
      created_at: typeof row.created_at === "string" ? row.created_at : null,
    };
  }

  private async getPublicProjectLogs(projectId: string) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_logs")
      .select("id, project_id, stage_code, node_name, content, images, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    if (error) {
      throw Errors.dbError("查询公开项目日志失败", error);
    }

    return ((data || []) as unknown as Array<Record<string, unknown>>).map((item) =>
      this.serializePublicProjectLog(item)
    );
  }

  private buildPublicProjectCoverImages(logs: PublicProjectLogSummary[]) {
    return Array.from(
      new Set(
        logs.flatMap((item) => item.images).filter(Boolean),
      ),
    ).slice(0, 6);
  }

  private async serializePublicProjectDetailItem(row: Record<string, unknown>) {
    const normalizedProperty = this.normalizeRelation(row.property, {
      id: null,
      community: null,
      building_info: null,
      layout: null,
      area: null,
      latitude: null,
      longitude: null,
    });
    const normalizedCustomer = this.normalizeRelation(row.customer, {
      name: null,
    });
    const projectId = typeof row.id === "string" ? row.id : "";
    const publicLogs = projectId ? await this.getPublicProjectLogs(projectId) : [];
    const members = projectId ? await this.getPublicProjectMembers(projectId) : [];
    const rawStatus = typeof row.status === "string" ? row.status : null;
    const status = isProjectStatus(rawStatus) ? rawStatus : null;

    return {
      id: projectId,
      name: typeof row.name === "string" ? row.name : null,
      status,
      status_label: status ? ProjectStatusConfig[status].label : null,
      address: typeof row.address === "string" ? row.address : null,
      latitude: normalizedProperty.latitude ?? null,
      longitude: normalizedProperty.longitude ?? null,
      budget: typeof row.budget === "number" ? row.budget : null,
      start_date: typeof row.start_date === "string" ? row.start_date : null,
      cover_images: this.buildPublicProjectCoverImages(publicLogs),
      style_tags: this.normalizeStringArray(row.style_tags),
      property: normalizedProperty,
      customer: {
        name: typeof normalizedCustomer.name === "string" ? normalizedCustomer.name : null,
      },
      members,
    };
  }

  private serializeProjectMember(item: {
    id: string;
    project_id: string;
    employee_id: string;
    role_code: ProjectMemberRoleCode;
    role_name: string | null;
    is_primary: boolean;
    sort_order: number | null;
    created_at?: string | null;
    updated_at?: string | null;
    employee: ProjectMemberEmployeeSummary | null;
    is_virtual?: boolean;
  }): ProjectMemberSummary {
    const roleConfig = PROJECT_MEMBER_ROLE_CONFIG[item.role_code];

    return {
      id: item.id,
      project_id: item.project_id,
      employee_id: item.employee_id,
      role_code: item.role_code,
      role_name: item.role_name ?? roleConfig.label,
      is_primary: item.is_primary,
      sort_order: item.sort_order ?? roleConfig.sortOrder,
      created_at: item.created_at ?? null,
      updated_at: item.updated_at ?? null,
      employee: item.employee,
      ...(item.is_virtual ? { is_virtual: true } : {}),
    };
  }

  private async getProjectMembersForDetail(project: Record<string, unknown>) {
    const projectId = typeof project.id === "string" ? project.id : "";
    if (!projectId) {
      return [] as ProjectMemberSummary[];
    }

    const members = await projectMemberService.listProjectMembers(projectId);
    const customer = this.normalizeRelation(project.customer, {
      id: null,
      name: null,
      phone: null,
      owner_id: null,
      owner: null,
    });
    const customerOwnerRelation = this.normalizeRelation(customer.owner, {
      id: "",
      name: null,
      avatar: null,
      phone: null,
    });
    const customerOwner = projectMemberService.buildDerivedCustomerOwnerMember({
      projectId,
      employee: customerOwnerRelation.id ? customerOwnerRelation : null,
    });

    return [
      ...(customerOwner ? [this.serializeProjectMember(customerOwner)] : []),
      ...members.map((item) => this.serializeProjectMember(item)),
    ].sort((a, b) => {
      if (a.sort_order !== b.sort_order) {
        return a.sort_order - b.sort_order;
      }

      const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
      if (timeA !== timeB) {
        return timeA - timeB;
      }

      return a.role_name.localeCompare(b.role_name, "zh-CN");
    });
  }

  private async serializeProjectDetailItem(row: Record<string, unknown>) {
    const normalizedCustomer = this.normalizeRelation(row.customer, {
      id: null,
      name: null,
      phone: null,
      owner_id: null,
      owner: null,
    });

    return {
      ...row,
      customer: {
        ...normalizedCustomer,
        owner: this.normalizeRelation(normalizedCustomer.owner, {
          id: null,
          name: null,
          avatar: null,
          phone: null,
        }),
      },
      property: this.normalizeRelation(row.property, {
        id: null,
        community: null,
        building_info: null,
        area: null,
        layout: null,
        latitude: null,
        longitude: null,
      }),
      designer: this.normalizeRelation(row.designer, {
        id: null,
        name: null,
        phone: null,
        avatar: null,
      }),
      supervisor: this.normalizeRelation(row.supervisor, {
        id: null,
        name: null,
        phone: null,
        avatar: null,
      }),
      members: await this.getProjectMembersForDetail(row),
    };
  }

  private serializeProjectListItem<T extends Record<string, unknown>>(row: T) {
    return {
      ...row,
      customer: this.normalizeRelation(row.customer, {
        id: null,
        name: null,
        phone: null,
      }),
      property: this.normalizeRelation(row.property, {
        community: null,
        building_info: null,
        area: null,
        layout: null,
        latitude: null,
        longitude: null,
      }),
      designer: this.normalizeRelation(row.designer, {
        id: null,
        name: null,
        phone: null,
        avatar: null,
      }),
      supervisor: this.normalizeRelation(row.supervisor, {
        id: null,
        name: null,
        phone: null,
        avatar: null,
      }),
    };
  }

  override list = async (request: FastifyRequest, reply: FastifyReply) => {
    const queryResult = ProjectListQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const visibleProjectIds = await this.getProjectListVisibleIds(
      request,
      queryResult.data.ownership,
    );

    const { page, pageSize, status, keyword } = queryResult.data;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = SupabaseDB.getAdminClient()
      .from("projects")
      .select(this.projectListSelect, { count: "exact" })
      .order("created_at", { ascending: false });

    query = this.applyProjectIdsFilter(query, visibleProjectIds);

    if (status) {
      query = query.eq("status", status);
    }

    const normalizedKeyword = keyword?.trim();
    if (normalizedKeyword) {
      query = query.or(
        `name.ilike.%${normalizedKeyword}%,address.ilike.%${normalizedKeyword}%`,
      );
    }

    const { data, error, count } = await query.range(from, to);
    if (error) throw Errors.dbError("列表查询失败", error);

    return ResponseHandler.success({
      list: ((data || []) as unknown as Array<Record<string, unknown>>).map((item) =>
        this.serializeProjectListItem(item)
      ),
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: count ? Math.ceil(count / pageSize) : 0,
      },
    });
  };

  override getById = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredAuthContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const hasAccess = await accessPolicyService.canAccessProject(
      authContext,
      idVerify.data.id,
      "project.read",
    );
    if (!hasAccess) {
      throw Errors.forbidden();
    }

    const { data, error } = await SupabaseDB.getAdminClient().from(this.tableName)
      .select(this.projectDetailSelect)
      .eq("id", idVerify.data.id)
      .maybeSingle();

    if (error) throw Errors.dbError("查询失败", error);
    if (!data) throw Errors.dbError("查询记录不存在", error);

    return ResponseHandler.success(
      await this.serializeProjectDetailItem((data || {}) as unknown as Record<string, unknown>),
    );
  };

  override create = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredAuthContext(request);
    accessPolicyService.assertPermission(authContext, "project.create");

    if (!this.createSchema) {
      throw Errors.badRequest("缺少参数类型：createSchema");
    }

    const result = this.createSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const { data, error } = await SupabaseDB.getAdminClient()
      .from(this.tableName)
      .insert(result.data)
      .select()
      .single();

    if (error) throw Errors.dbError("创建失败", error);
    await projectMemberService.syncLegacyProjectMembers(data.id, {
      designer_id: result.data.designer_id,
      supervisor_id: result.data.supervisor_id,
    });
    return ResponseHandler.success(data);
  };

  override update = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredAuthContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const hasAccess = await accessPolicyService.canAccessProject(
      authContext,
      idVerify.data.id,
      "project.update",
    );
    if (!hasAccess) {
      throw Errors.forbidden();
    }

    if (!this.updateSchema) {
      throw Errors.badRequest("缺少参数类型：updateSchema");
    }

    const result = this.updateSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await projectSer.updateProject(idVerify.data.id, result.data);
    await projectMemberService.syncLegacyProjectMembers(idVerify.data.id, {
      designer_id: result.data.designer_id,
      supervisor_id: result.data.supervisor_id,
    });
    return ResponseHandler.success(data);
  };

  @Get("/projects/:id/members")
  async getProjectMembers(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredAuthContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const hasAccess = await accessPolicyService.canAccessProject(
      authContext,
      idVerify.data.id,
      "project.read",
    );
    if (!hasAccess) {
      throw Errors.forbidden();
    }

    const { data, error } = await SupabaseDB.getAdminClient()
      .from(this.tableName)
      .select(this.projectDetailSelect)
      .eq("id", idVerify.data.id)
      .maybeSingle();

    if (error) throw Errors.dbError("查询项目成员失败", error);
    if (!data) throw Errors.badRequest("项目不存在");

    const members = await this.getProjectMembersForDetail(
      (data || {}) as unknown as Record<string, unknown>,
    );
    return ResponseHandler.success(members);
  }

  @Get("/projects/member-roles")
  async getProjectMemberRoles(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredAuthContext(request);
    accessPolicyService.assertPermission(authContext, "project.read");

    const list: ProjectMemberRoleOption[] = Object.entries(
      PROJECT_MEMBER_ROLE_CONFIG,
    )
      .map(([roleCode, config]) => ({
        role_code: roleCode as ProjectMemberRoleCode,
        role_name: config.label,
        category: config.category,
        is_core: config.isCore,
        sort_order: config.sortOrder,
        status: config.status,
      }))
      .sort((a, b) => a.sort_order - b.sort_order);

    return ResponseHandler.success(list);
  }

  @Post("/projects/:id/members")
  async createProjectMember(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredAuthContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const hasAccess = await accessPolicyService.canAccessProject(
      authContext,
      idVerify.data.id,
      "project.update",
    );
    if (!hasAccess) {
      throw Errors.forbidden();
    }

    const result = CreateProjectMemberSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await projectMemberService.createProjectMember(
      idVerify.data.id,
      result.data,
    );

    return ResponseHandler.success(this.serializeProjectMember(data));
  }

  @Patch("/projects/:id/members/:memberId")
  async updateProjectMember(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredAuthContext(request);
    const paramsResult = ProjectMemberParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const hasAccess = await accessPolicyService.canAccessProject(
      authContext,
      paramsResult.data.id,
      "project.update",
    );
    if (!hasAccess) {
      throw Errors.forbidden();
    }

    const result = UpdateProjectMemberSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await projectMemberService.updateProjectMember(
      paramsResult.data.id,
      paramsResult.data.memberId,
      result.data,
    );

    return ResponseHandler.success(this.serializeProjectMember(data));
  }

  @Delete("/projects/:id/members/:memberId")
  async deleteProjectMember(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredAuthContext(request);
    const paramsResult = ProjectMemberParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const hasAccess = await accessPolicyService.canAccessProject(
      authContext,
      paramsResult.data.id,
      "project.update",
    );
    if (!hasAccess) {
      throw Errors.forbidden();
    }

    await projectMemberService.deleteProjectMember(
      paramsResult.data.id,
      paramsResult.data.memberId,
    );

    return ResponseHandler.success({ success: true });
  }

  @Get("/projects/frontend-visible")
  //获取游客页可以展示的项目
  async getFrontendVisibleProjects(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    let query = SupabaseDB.from(this.tableName)
      .select(this.publicProjectListSelect)
      .order("created_at", { ascending: false });
    query = this.applyPublicProjectVisibilityQuery(query);
    const { data, error } = await query;

    if (error) {
      throw Errors.dbError("查询前端可展示项目失败", error);
    }

    return ResponseHandler.success(
      ((data || []) as unknown as Array<Record<string, unknown>>).map((item) =>
        this.serializeProjectListItem(item)
      ),
      "查询成功",
    );
  }

  @Get("/front/projects")
  async getPublicProjects(request: FastifyRequest, reply: FastifyReply) {
    let query = SupabaseDB.from(this.tableName)
      .select(this.publicProjectListSelect)
      .order("created_at", { ascending: false });
    query = this.applyPublicProjectVisibilityQuery(query);
    const { data, error } = await query;

    if (error) {
      throw Errors.dbError("查询公开项目列表失败", error);
    }

    return ResponseHandler.success(
      ((data || []) as unknown as Array<Record<string, unknown>>).map((item) =>
        this.serializeProjectListItem(item)
      ),
    );
  }

  @Get("/front/projects/:id/logs")
  async getPublicProjectLogsById(request: FastifyRequest, reply: FastifyReply) {
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const { data, error } = await SupabaseDB.getAdminClient()
      .from(this.tableName)
      .select("id, status, visibility_status")
      .eq("id", idVerify.data.id)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询公开项目失败", error);
    }
    if (!data || !this.isPublicProjectVisible((data || {}) as unknown as Record<string, unknown>)) {
      throw Errors.notFound("项目不存在");
    }

    return ResponseHandler.success(
      await this.getPublicProjectLogs(idVerify.data.id),
    );
  }

  @Get("/front/projects/:id")
  async getPublicProjectById(request: FastifyRequest, reply: FastifyReply) {
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const { data, error } = await SupabaseDB.getAdminClient()
      .from(this.tableName)
      .select(this.publicProjectDetailSelect)
      .eq("id", idVerify.data.id)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询公开项目详情失败", error);
    }
    if (!data || !this.isPublicProjectVisible((data || {}) as unknown as Record<string, unknown>)) {
      throw Errors.notFound("项目不存在");
    }

    return ResponseHandler.success(
      await this.serializePublicProjectDetailItem(
        (data || {}) as unknown as Record<string, unknown>,
      ),
    );
  }

  @Get("/projects/status")
  async getProjectsBystatus(request: FastifyRequest, reply: FastifyReply) {
    const queryResult = ProjectListQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);
    const visibleProjectIds = await this.getProjectListVisibleIds(
      request,
      queryResult.data.ownership,
    );
    const { page, pageSize, status, keyword } = queryResult.data;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = SupabaseDB
      .from("projects")
      .select(
        `
            id,
            name,
            status,
            budget,
            start_date,
            address,
            created_at,
            designer:employees!projects_designer_id_fkey(
              id,
              name,
              avatar,
              phone
            ),
            property:properties!projects_property_id_fkey(
              community,
              building_info,
              area,
              layout,
              latitude,
              longitude
            ),
            customer:customers!projects_customer_id_fkey(
              id,
              name,
              phone
            ),
            supervisor:employees!projects_supervisor_id_fkey(
              id,
              name,
              avatar,
              phone
            )
            `,
        { count: "exact" },
      );

    query = this.applyProjectIdsFilter(query, visibleProjectIds);

    if (status) {
      query = query.eq("status", status);
    }

    const normalizedKeyword = keyword?.trim();
    if (normalizedKeyword) {
      query = query.or(
        `name.ilike.%${normalizedKeyword}%,address.ilike.%${normalizedKeyword}%`,
      );
    }

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw Errors.dbError("列表查询失败", error);

    return ResponseHandler.success({
      list: ((data || []) as Array<Record<string, unknown>>).map((item) =>
        this.serializeProjectListItem(item)
      ),
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: count ? Math.ceil(count / pageSize) : 0,
      },
    });
  }

  @Get("/projects/create/customers")
  async getProjectCreateCustomers(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const authContext = await this.getRequiredAuthContext(request);
    accessPolicyService.assertPermission(authContext, "project.create");

    const queryResult = ProjectCreateSelectCustomerQuerySchema.safeParse(
      request.query,
    );
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const { page, pageSize, keyword }: ProjectCreateSelectCustomerQueryType =
      queryResult.data;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = SupabaseDB.from("customers")
      .select("id, name, phone", { count: "exact" })
      .order("created_at", { ascending: false });

    const normalizedKeyword = keyword?.trim();
    if (normalizedKeyword) {
      query = query.or(
        `name.ilike.%${normalizedKeyword}%,phone.ilike.%${normalizedKeyword}%`,
      );
    }

    const { data, error, count } = await query.range(from, to);

    if (error) {
      throw Errors.dbError("查询项目创建客户选择项失败", error);
    }

    const list: ProjectCreateCustomerOption[] =
      ((data || []) as ProjectCreateSelectCustomerRow[])
        .map((item) => ({
          id: item.id,
          name: item.name,
          phone: item.phone,
        }));

    return ResponseHandler.success({
      list,
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: count ? Math.ceil(count / pageSize) : 0,
      },
    });
  }

  @Get("/projects/create/employees")
  async getProjectCreateEmployees(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const authContext = await this.getRequiredAuthContext(request);
    accessPolicyService.assertPermission(authContext, "project.create");

    const queryResult = ProjectCreateSelectEmployeeQuerySchema.safeParse(
      request.query,
    );
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const { page, pageSize, keyword, scene }:
      ProjectCreateSelectEmployeeQueryType = queryResult.data;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const postCodes = this.getPostCodesByScene(scene);
    const postIds = await this.getPostIdsByCodes(postCodes);
    const result = await this.queryProjectCreateEmployees({
      from,
      to,
      keyword,
      postIds,
    });

    const list: ProjectCreateEmployeeOption[] =
      ((result.data || []) as ProjectCreateSelectEmployeeRow[])
        .map((item) => {
          const department = Array.isArray(item.department)
            ? (item.department[0] ?? null)
            : item.department;
          const post = Array.isArray(item.post)
            ? (item.post[0] ?? null)
            : item.post;

          return {
            id: item.id,
            name: item.name,
            phone: item.phone,
            avatar: item.avatar ?? null,
            role_label: post?.name || null,
            department: department
              ? {
                id: department.id,
                name: department.name,
              }
              : null,
            department_name: department?.name || null,
            post: post
              ? {
                id: post.id,
                name: post.name,
                code: post.code,
              }
              : null,
            post_code: post?.code || null,
            post_name: post?.name || null,
          };
        });

    return ResponseHandler.success({
      list,
      pagination: {
        page,
        pageSize,
        total: result.count || 0,
        totalPages: result.count ? Math.ceil(result.count / pageSize) : 0,
      },
    });
  }

  @Get("/projects/:id/member-candidates")
  async getProjectMemberCandidates(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const authContext = await this.getRequiredAuthContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const hasAccess = await accessPolicyService.canAccessProject(
      authContext,
      idVerify.data.id,
      "project.update",
    );
    if (!hasAccess) {
      throw Errors.forbidden();
    }

    const queryResult = ProjectMemberCandidateQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const { page, pageSize, keyword, role_code } = queryResult.data;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const postCodes = this.getPostCodesByMemberRole(role_code);
    const postIds = await this.getPostIdsByCodes(postCodes);
    const result = await this.queryProjectCreateEmployees({
      from,
      to,
      keyword,
      postIds: postIds.length > 0 ? postIds : undefined,
    });

    const list: ProjectCreateEmployeeOption[] =
      ((result.data || []) as ProjectCreateSelectEmployeeRow[])
        .map((item) => {
          const department = Array.isArray(item.department)
            ? (item.department[0] ?? null)
            : item.department;
          const post = Array.isArray(item.post)
            ? (item.post[0] ?? null)
            : item.post;

          return {
            id: item.id,
            name: item.name,
            phone: item.phone,
            avatar: item.avatar ?? null,
            role_label: post?.name || null,
            department: department
              ? {
                id: department.id,
                name: department.name,
              }
              : null,
            department_name: department?.name || null,
            post: post
              ? {
                id: post.id,
                name: post.name,
                code: post.code,
              }
              : null,
            post_code: post?.code || null,
            post_name: post?.name || null,
          };
        });

    return ResponseHandler.success({
      list,
      pagination: {
        page,
        pageSize,
        total: result.count || 0,
        totalPages: result.count ? Math.ceil(result.count / pageSize) : 0,
      },
    });
  }

  private getPostCodesByScene(scene: ProjectCreateSelectEmployeeScene): PostCode[] {
    if (scene === "project_designer") {
      return ["INTERIOR_DESIGNER", "DESIGN_DIRECTOR"];
    }

    if (scene === "project_construction_manager") {
      return ["PROJECT_MANAGER"];
    }

    return ["PROJECT_MANAGER", "CONSTRUCTION_SUPER"];
  }

  private getPostCodesByMemberRole(
    roleCode?: ProjectMemberCandidateQueryType["role_code"],
  ): PostCode[] {
    if (!roleCode) {
      return [];
    }

    if (roleCode === "customer_owner" || roleCode === "sales_followup") {
      return ["MARKETING_DIRECTOR", "SALES_CONSULTANT"];
    }

    if (roleCode === "designer") {
      return ["INTERIOR_DESIGNER", "DESIGN_DIRECTOR"];
    }

    if (roleCode === "supervisor") {
      return ["PROJECT_MANAGER", "CONSTRUCTION_SUPER"];
    }

    if (roleCode === "construction_manager" || roleCode === "site_manager") {
      return ["PROJECT_MANAGER", "CONSTRUCTION_SUPER"];
    }

    if (roleCode === "budget_manager") {
      return ["FINANCE_ACCOUNTANT"];
    }

    if (roleCode === "material_manager") {
      return ["PROCURE_OFFICER"];
    }

    return [];
  }

  private async getPostIdsByCodes(codes: PostCode[]) {
    if (codes.length === 0) {
      return [];
    }

    const { data, error } = await SupabaseDB.from("posts")
      .select("id")
      .in("code", codes);

    if (error) {
      throw Errors.dbError("查询项目创建员工筛选岗位失败", error);
    }

    return ((data || []) as Array<Pick<Tables<"posts">, "id">>).map(
      (item) => item.id,
    );
  }

  private async queryProjectCreateEmployees(params: {
    from: number;
    to: number;
    keyword?: string;
    postIds?: string[];
  }) {
    let query = SupabaseDB.from("employees")
      .select(
        `
        id,
        name,
        avatar,
        phone,
        department:departments!employees_department_id_fkey(id, name, code),
        post:posts!employees_post_id_fkey(id, name, code)
      `,
        { count: "exact" },
      )
      .eq("status", "active")
      .order("created_at", { ascending: false });

    if (params.postIds && params.postIds.length > 0) {
      query = query.in("post_id", params.postIds);
    }

    const normalizedKeyword = params.keyword?.trim();
    if (normalizedKeyword) {
      query = query.or(
        `name.ilike.%${normalizedKeyword}%,phone.ilike.%${normalizedKeyword}%`,
      );
    }

    const { data, error, count } = await query.range(params.from, params.to);

    if (error) {
      throw Errors.dbError("查询项目创建员工选择项失败", error);
    }

    return {
      data,
      count,
    };
  }
}

export default new ProjectController();
