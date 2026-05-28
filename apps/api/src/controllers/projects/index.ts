import { TenantBaseController } from "@/controllers/TenantBaseController";
import {
  CreateProjectSchema,
  ProjectStatusTransitionListQuerySchema,
  ProjectStatusTransitionSchema,
  UpdateProjectSchema,
} from "@/schema/projects";
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
  ProjectMemberCandidateQuerySchema,
  ProjectCreateSelectEmployeeQuerySchema,
} from "@/schema/project-create-select";
import type { Tables } from "@/types/database";
import {
  PROJECT_MEMBER_ROLE_CONFIG,
  PROJECT_LOG_STAGE_CONFIG,
  ProjectStatusConfig,
  isProjectLogStageCode,
  isProjectStatus,
  type ProjectLogStageCode,
  type ProjectMemberRoleCode,
} from "@gooes/domain";
import { accessPolicyService } from "@/services/access-policy";
import { projectMemberService } from "@/services/project-members";
import {
  customerPhonePrivacyService,
  type CustomerPhonePrivacyContext,
} from "@/services/customer-phone-privacy";
import { resolveStoredFileUrlList } from "@/services/files/file-url-resolver";

type ProjectCreateSelectCustomerRow = Pick<
  Tables<"customers">,
  "id" | "name" | "phone" | "owner_id"
>;
type ProjectCreateEmployeeDepartmentRow = {
  id: string;
  name?: string | null;
  alias_name?: string | null;
  code: string | null;
};
type ProjectCreateSelectEmployeeRow =
  & Pick<
    Tables<"employees">,
    "id" | "name" | "phone" | "avatar"
  >
  & {
    department?:
      | Array<ProjectCreateEmployeeDepartmentRow>
      | ProjectCreateEmployeeDepartmentRow
      | null;
    tenant_department?:
      | Array<ProjectCreateEmployeeDepartmentRow>
      | ProjectCreateEmployeeDepartmentRow
      | null;
    post:
      | Array<Pick<Tables<"posts">, "id" | "name" | "code">>
      | null;
  };

type ProjectCreateCustomerOption = {
  id: string;
  name: string | null;
  phone: string | null;
  phone_masked: string | null;
  can_view_phone: boolean;
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
  department_name?: string | null;
  post_name?: string | null;
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

class ProjectController extends TenantBaseController<
  typeof CreateProjectSchema,
  typeof UpdateProjectSchema
> {
  constructor() {
    super("projects", CreateProjectSchema, UpdateProjectSchema);
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
    return resolveStoredFileUrlList(images);
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
    const members = await projectSer.listPublicProjectMembers(projectId);
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
    const logs = await projectSer.listPublicProjectLogs(projectId);
    return logs.map((item) =>
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

  private async serializePublicProjectDetailItem(
    row: Record<string, unknown>,
    related?: {
      publicLogs?: PublicProjectLogSummary[];
      members?: PublicProjectMemberSummary[];
    },
  ) {
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
    const publicLogs = related?.publicLogs ??
      (projectId ? await this.getPublicProjectLogs(projectId) : []);
    const members = related?.members ??
      (projectId ? await this.getPublicProjectMembers(projectId) : []);
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
      department_name: null,
      post_name: null,
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

  private async serializeProjectDetailItem(
    row: Record<string, unknown>,
    phonePrivacyContext?: CustomerPhonePrivacyContext,
  ) {
    const normalizedCustomer = this.normalizeRelation(row.customer, {
      id: null,
      name: null,
      phone: null,
      owner_id: null,
      owner: null,
    });
    const customerPhoneFields =
      typeof normalizedCustomer.id === "string" && phonePrivacyContext
        ? customerPhonePrivacyService.serializeCustomerPhoneFields(
          phonePrivacyContext,
          {
            id: normalizedCustomer.id,
            owner_id: typeof normalizedCustomer.owner_id === "string"
              ? normalizedCustomer.owner_id
              : null,
            phone: typeof normalizedCustomer.phone === "string"
              ? normalizedCustomer.phone
              : null,
          },
        )
        : customerPhonePrivacyService.serializeMaskedPhoneOnly(
          typeof normalizedCustomer.phone === "string" ? normalizedCustomer.phone : null,
        );

    return {
      ...row,
      customer: {
        ...normalizedCustomer,
        ...customerPhoneFields,
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

  private serializeProjectListItem<T extends Record<string, unknown>>(
    row: T,
    phonePrivacyContext?: CustomerPhonePrivacyContext,
  ) {
    const normalizedCustomer = this.normalizeRelation(row.customer, {
      id: null,
      name: null,
      phone: null,
      owner_id: null,
    });
    const customerPhoneFields =
      typeof normalizedCustomer.id === "string" && phonePrivacyContext
        ? customerPhonePrivacyService.serializeCustomerPhoneFields(
          phonePrivacyContext,
          {
            id: normalizedCustomer.id,
            owner_id: typeof normalizedCustomer.owner_id === "string"
              ? normalizedCustomer.owner_id
              : null,
            phone: typeof normalizedCustomer.phone === "string"
              ? normalizedCustomer.phone
              : null,
          },
        )
        : customerPhonePrivacyService.serializeMaskedPhoneOnly(
          typeof normalizedCustomer.phone === "string" ? normalizedCustomer.phone : null,
        );

    return {
      ...row,
      customer: {
        ...normalizedCustomer,
        ...customerPhoneFields,
      },
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

    const authContextStartedAt = Date.now();
    const authContext = await this.getRequiredTenantContext(request);
    const authContextMs = Date.now() - authContextStartedAt;
    const result = await projectSer.listProjects({
      authContext,
      query: queryResult.data,
    });
    if (queryResult.data.mode === "home") {
      request.log.info(
        {
          requestId: request.id,
          employeeId: authContext.employeeId ?? null,
          tenantId: authContext.tenantId,
          authContextMs,
          timings: result.debugTimings ?? null,
        },
        "[project-home-list] timings",
      );

      return ResponseHandler.success({
        list: result.rows.map((item) => this.serializeProjectListItem(item)),
        pagination: result.pagination,
      });
    }

    const phonePrivacyContext = await customerPhonePrivacyService.createPrivacyContext(
      authContext,
    );

    return ResponseHandler.success({
      list: result.rows.map((item) =>
        this.serializeProjectListItem(item, phonePrivacyContext)
      ),
      pagination: result.pagination,
    });
  };

  override getById = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const project = await projectSer.getProjectDetail({
      authContext,
      projectId: idVerify.data.id,
    });

    return ResponseHandler.success(
      await this.serializeProjectDetailItem(
        project,
        await customerPhonePrivacyService.createPrivacyContext(authContext),
      ),
    );
  };

  override create = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredTenantContext(request);

    if (!this.createSchema) {
      throw Errors.badRequest("缺少参数类型：createSchema");
    }

    const result = this.createSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const project = await projectSer.createProject({
      authContext,
      payload: result.data,
    });
    return ResponseHandler.success(project);
  };

  override update = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    if (!this.updateSchema) {
      throw Errors.badRequest("缺少参数类型：updateSchema");
    }

    const result = this.updateSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await projectSer.updateProjectForTenant({
      authContext,
      projectId: idVerify.data.id,
      payload: result.data,
    });
    return ResponseHandler.success(data);
  };

  @Delete("/projects/:id")
  async deleteProject(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const data = await projectSer.deleteProjectForTenant({
      authContext,
      projectId: idVerify.data.id,
    });
    return ResponseHandler.success(data);
  }

  @Post("/projects/:id/status-transition")
  async transitionProjectStatus(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const result = ProjectStatusTransitionSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await projectSer.transitionProjectStatusForTenant({
      authContext,
      projectId: idVerify.data.id,
      payload: result.data,
    });

    return ResponseHandler.success(data);
  }

  @Get("/projects/:id/status-actions")
  async listProjectStatusActions(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const data = await projectSer.listProjectStatusActionsForTenant({
      authContext,
      projectId: idVerify.data.id,
    });

    return ResponseHandler.success(data);
  }

  @Get("/projects/:id/construction-stages")
  async listProjectConstructionStages(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const authContext = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const data = await projectSer.listProjectConstructionStagesForTenant({
      authContext,
      projectId: idVerify.data.id,
    });

    return ResponseHandler.success(data);
  }

  @Get("/projects/:id/status-transitions")
  async listProjectStatusTransitions(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const authContext = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const queryResult = ProjectStatusTransitionListQuerySchema.safeParse(
      request.query,
    );
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await projectSer.listProjectStatusTransitionsForTenant({
      authContext,
      projectId: idVerify.data.id,
      query: queryResult.data,
    });

    return ResponseHandler.success(data);
  }

  @Get("/projects/:id/members")
  async getProjectMembers(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const project = await projectSer.getProjectDetail({
      authContext,
      projectId: idVerify.data.id,
    });

    const members = await this.getProjectMembersForDetail(
      project,
    );
    return ResponseHandler.success(members);
  }

  @Get("/projects/member-roles")
  async getProjectMemberRoles(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
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
    const authContext = await this.getRequiredTenantContext(request);
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
      authContext.tenantId,
    );
    projectSer.invalidatePublicProjectMembersCache(idVerify.data.id);

    return ResponseHandler.success(this.serializeProjectMember(data));
  }

  @Patch("/projects/:id/members/:memberId")
  async updateProjectMember(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
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
      authContext.tenantId,
    );
    projectSer.invalidatePublicProjectMembersCache(paramsResult.data.id);

    return ResponseHandler.success(this.serializeProjectMember(data));
  }

  @Delete("/projects/:id/members/:memberId")
  async deleteProjectMember(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
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
      authContext.tenantId,
    );
    projectSer.invalidatePublicProjectMembersCache(paramsResult.data.id);

    return ResponseHandler.success({ success: true });
  }

  @Get("/front/projects")
  async getPublicProjects(request: FastifyRequest, reply: FastifyReply) {
    const projects = await projectSer.listPublicProjects();

    return ResponseHandler.success(
      projects.map((item) =>
        this.serializeProjectListItem(item)
      ),
    );
  }

  @Get("/front/projects/:id/logs")
  async getPublicProjectLogsById(request: FastifyRequest, reply: FastifyReply) {
    const startedAt = Date.now();
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);
    const projectId = idVerify.data.id;

    const visibilityStartedAt = Date.now();
    await projectSer.getPublicProjectDetail(projectId);
    const visibilityMs = Date.now() - visibilityStartedAt;

    const logsStartedAt = Date.now();
    const rows = await projectSer.listPublicProjectLogs(projectId);
    const logsFetchMs = Date.now() - logsStartedAt;

    const serializeStartedAt = Date.now();
    const logs = rows.map((item) => this.serializePublicProjectLog(item));
    const serializeMs = Date.now() - serializeStartedAt;

    request.log.info(
      {
        requestId: request.id,
        projectId,
        visibilityMs,
        logsFetchMs,
        serializeMs,
        totalMs: Date.now() - startedAt,
        logCount: logs.length,
        imageCount: logs.reduce((count, item) => count + item.images.length, 0),
      },
      "[public-project-logs] timings",
    );

    return ResponseHandler.success(logs);
  }

  @Get("/front/projects/:id")
  async getPublicProjectById(request: FastifyRequest, reply: FastifyReply) {
    const startedAt = Date.now();
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);
    const projectId = idVerify.data.id;

    const detailStartedAt = Date.now();
    const project = await projectSer.getPublicProjectDetail(projectId);
    const detailMs = Date.now() - detailStartedAt;

    const [publicLogResult, publicMemberResult] = await Promise.all([
      (async () => {
        const startedAt = Date.now();
        const rows = await projectSer.listPublicProjectLogs(projectId);
        return { rows, durationMs: Date.now() - startedAt };
      })(),
      (async () => {
        const startedAt = Date.now();
        const rows = await projectSer.listPublicProjectMembers(projectId);
        return { rows, durationMs: Date.now() - startedAt };
      })(),
    ]);
    const publicLogRows = publicLogResult.rows;
    const logsFetchMs = publicLogResult.durationMs;
    const publicMemberRows = publicMemberResult.rows;
    const membersFetchMs = publicMemberResult.durationMs;

    const logsSerializeStartedAt = Date.now();
    const publicLogs = publicLogRows.map((item) =>
      this.serializePublicProjectLog(item)
    );
    const logsSerializeMs = Date.now() - logsSerializeStartedAt;

    const membersSerializeStartedAt = Date.now();
    const members = publicMemberRows
      .filter((item) => item.role_code !== "customer_owner")
      .map((item) => this.serializePublicProjectMember(item));
    const membersSerializeMs = Date.now() - membersSerializeStartedAt;

    const serializeStartedAt = Date.now();
    const data = await this.serializePublicProjectDetailItem(project, {
      publicLogs,
      members,
    });
    const serializeMs = Date.now() - serializeStartedAt;

    request.log.info(
      {
        requestId: request.id,
        projectId,
        detailMs,
        logsFetchMs,
        logsSerializeMs,
        membersFetchMs,
        membersSerializeMs,
        serializeMs,
        totalMs: Date.now() - startedAt,
        logCount: publicLogs.length,
        memberCount: members.length,
        coverImageCount: data.cover_images.length,
      },
      "[public-project-detail] timings",
    );

    return ResponseHandler.success(data);
  }

  @Get("/projects/status")
  async getProjectsBystatus(request: FastifyRequest, reply: FastifyReply) {
    const queryResult = ProjectListQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);
    const authContextStartedAt = Date.now();
    const authContext = await this.getRequiredTenantContext(request);
    const authContextMs = Date.now() - authContextStartedAt;
    const result = await projectSer.listProjects({
      authContext,
      query: queryResult.data,
    });
    if (queryResult.data.mode === "home") {
      request.log.info(
        {
          requestId: request.id,
          employeeId: authContext.employeeId ?? null,
          tenantId: authContext.tenantId,
          authContextMs,
          timings: result.debugTimings ?? null,
        },
        "[project-home-list] timings",
      );

      return ResponseHandler.success({
        list: result.rows.map((item) => this.serializeProjectListItem(item)),
        pagination: result.pagination,
      });
    }

    const phonePrivacyContext = await customerPhonePrivacyService.createPrivacyContext(
      authContext,
    );

    return ResponseHandler.success({
      list: result.rows.map((item) =>
        this.serializeProjectListItem(item, phonePrivacyContext)
      ),
      pagination: result.pagination,
    });
  }

  @Get("/projects/create/customers")
  async getProjectCreateCustomers(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const authContext = await this.getRequiredTenantContext(request);

    const queryResult = ProjectCreateSelectCustomerQuerySchema.safeParse(
      request.query,
    );
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const result = await projectSer.listProjectCreateCustomers({
      authContext,
      query: queryResult.data,
    });

    const list: ProjectCreateCustomerOption[] =
      (result.rows as unknown as ProjectCreateSelectCustomerRow[])
        .map((item) => ({
          id: item.id,
          name: item.name,
          phone: null,
          phone_masked: customerPhonePrivacyService.maskPhone(item.phone),
          can_view_phone: false,
        }));

    return ResponseHandler.success({
      list,
      pagination: result.pagination,
    });
  }

  @Get("/projects/create/employees")
  async getProjectCreateEmployees(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const authContext = await this.getRequiredTenantContext(request);

    const queryResult = ProjectCreateSelectEmployeeQuerySchema.safeParse(
      request.query,
    );
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const result = await projectSer.listProjectCreateEmployees({
      authContext,
      query: queryResult.data,
    });

    const list: ProjectCreateEmployeeOption[] =
      (result.rows as unknown as ProjectCreateSelectEmployeeRow[])
        .map((item) => {
          const rawDepartment = item.department ?? item.tenant_department ?? null;
          const department = Array.isArray(rawDepartment)
            ? (rawDepartment[0] ?? null)
            : rawDepartment;
          const post = Array.isArray(item.post)
            ? (item.post[0] ?? null)
            : item.post;
          const departmentName = department?.name ?? department?.alias_name ?? null;

          return {
            id: item.id,
            name: item.name,
            phone: item.phone,
            avatar: item.avatar ?? null,
            role_label: post?.name || null,
            department: department
              ? {
                id: department.id,
                name: departmentName ?? "",
              }
              : null,
            department_name: departmentName,
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
      pagination: result.pagination,
    });
  }

  @Get("/projects/:id/member-candidates")
  async getProjectMemberCandidates(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const authContext = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const queryResult = ProjectMemberCandidateQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const result = await projectSer.listProjectMemberCandidates({
      authContext,
      projectId: idVerify.data.id,
      query: queryResult.data,
    });

    const list: ProjectCreateEmployeeOption[] =
      (result.rows as unknown as ProjectCreateSelectEmployeeRow[])
        .map((item) => {
          const rawDepartment = item.department ?? item.tenant_department ?? null;
          const department = Array.isArray(rawDepartment)
            ? (rawDepartment[0] ?? null)
            : rawDepartment;
          const post = Array.isArray(item.post)
            ? (item.post[0] ?? null)
            : item.post;
          const departmentName = department?.name ?? department?.alias_name ?? null;

          return {
            id: item.id,
            name: item.name,
            phone: item.phone,
            avatar: item.avatar ?? null,
            role_label: post?.name || null,
            department: department
              ? {
                id: department.id,
                name: departmentName ?? "",
              }
              : null,
            department_name: departmentName,
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
      pagination: result.pagination,
    });
  }
}

export default new ProjectController();
