import { BaseController } from "@/controllers/BaseController";
import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import { projectMemberService } from "@/services/project-members";
import { projectAcceptanceService } from "@/services/project-acceptances";
import {
  customerSelfServiceService,
  type CustomerContextRow,
  type CustomerProjectLogCommentAggregateRow,
  type CustomerProjectLogCommentAuthorCustomer,
  type CustomerProjectLogCommentAuthorEmployee,
  type CustomerProjectLogCommentRow,
  type CustomerProjectLogRow,
  type CustomerProjectListItem,
  type CustomerProjectRecentLogSummaryRow,
  type UserProfileRow,
} from "@/services/customer-self-service";
import {
  CustomerProjectAcceptanceOpenTicketQuerySchema,
  VerifyProjectAcceptanceOpenTicketSchema,
} from "@/schema/project-acceptances";
import {
  CreateCustomerServiceTicketSchema,
  CustomerServiceTicketListQuerySchema,
  CustomerServiceTicketParamsSchema,
} from "@/schema/customer-service";
import { Get, Patch, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import { userIdentityService } from "@/services/user-identities";
import { customerServiceTicketService } from "@/services/customer-service-tickets";
import { constructionStageStatusService } from "@/services/construction-stage-status";
import type { FastifyRequest, FastifyReply } from "fastify";
import { IdParamSchema, PaginationQuerySchema } from "@/schema/request";
import {
  AuthMeProfileUpdateSchema,
  type AuthMeProfileUpdateInput,
} from "@/schema/user-profile";
import { z } from "zod";
import {
  PROJECT_LOG_STAGE_CONFIG,
  PROJECT_LOG_STAGE_CODE_VALUES,
  PROJECT_ACCEPTANCE_STATUS_VALUES,
  ProjectStatusConfig,
  isProjectLogStageCode,
  isProjectStatus,
  type ProjectLogStageCode,
  type ProjectMemberRoleCode,
} from "@gooes/domain";
import { resolveStoredFileUrl } from "@/services/files/file-url-resolver";

type CustomerProjectLogCommentAuthor = {
  id: string;
  name: string | null;
  avatar: string | null;
};

type CustomerProjectMemberSummary = {
  id: string;
  project_id: string;
  employee_id: string;
  role_code: ProjectMemberRoleCode;
  role_name: string;
  is_primary: boolean;
  sort_order: number;
  created_at: string | null;
  updated_at?: string | null;
  employee: {
    id: string;
    name: string | null;
    avatar: string | null;
    phone: string | null;
  } | null;
  is_virtual?: boolean;
};

function optionalCustomerQueryValue<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((value) => {
    if (value == null) {
      return undefined;
    }

    if (typeof value === "string") {
      const normalized = value.trim();
      if (
        normalized === "" ||
        normalized === "undefined" ||
        normalized === "null"
      ) {
        return undefined;
      }

      return normalized;
    }

    return value;
  }, schema.optional());
}

const CustomerProjectListQuerySchema = PaginationQuerySchema.extend({
  include: optionalCustomerQueryValue(z.enum(["home_summary"])),
});

const CustomerBootstrapQuerySchema = PaginationQuerySchema.extend({
  include: optionalCustomerQueryValue(z.enum(["home_summary"])).default("home_summary"),
  projects_mode: optionalCustomerQueryValue(z.enum(["inline", "defer"])).default("inline"),
});

const CustomerProjectLogListQuerySchema = PaginationQuerySchema.extend({
  pageSize: z.coerce.number().int().min(1, "每页条数必须大于 0").max(
    20,
    "每页日志不能超过 20 条",
  ).default(10),
  imageMode: optionalCustomerQueryValue(z.enum(["thumb", "full"])).default("thumb"),
});

const CustomerProjectAcceptanceListQuerySchema = PaginationQuerySchema.extend({
  project_id: z.uuid("无效的项目 ID"),
  status: optionalCustomerQueryValue(z.enum(PROJECT_ACCEPTANCE_STATUS_VALUES)),
  stage_code: optionalCustomerQueryValue(z.enum(PROJECT_LOG_STAGE_CODE_VALUES)),
  pageSize: z.coerce.number().int().min(1, "每页条数必须大于 0").max(
    20,
    "每页验收单不能超过 20 条",
  ).default(10),
});

const CustomerProjectLogCommentListQuerySchema = PaginationQuerySchema.extend({
  pageSize: z.coerce.number().int().min(1, "每页条数必须大于 0").max(
    20,
    "每页评论不能超过 20 条",
  ).default(20),
});

const CustomerProjectLogCommentParamSchema = IdParamSchema.extend({
  logId: z.uuid("无效的日志 ID"),
});

class CustomerSelfServiceController extends BaseController {
  constructor() {
    super("customer-self-service");
  }

  private async getRequiredAuthUserId(request: FastifyRequest) {
    const authUserId = request.user?.sub;
    if (!authUserId) {
      throw Errors.unauthorized();
    }
    return authUserId;
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

  private getImagePublicUrl(path: string | null | undefined) {
    return resolveStoredFileUrl(path);
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
        return this.getImagePublicUrl(item) || item;
      });
  }

  private getImageThumbUrl(url: string) {
    return url;
  }

  private normalizeProjectLogImageItems(images: unknown) {
    return this.normalizeProjectLogImages(images).map((url) => ({
      url,
      thumb_url: this.getImageThumbUrl(url),
      width: null as number | null,
      height: null as number | null,
    }));
  }

  private async getCustomerProfileByAuthUserId(
    authUserId: string,
    options?: {
      required?: boolean;
      tenantId?: string | null;
      customerId?: string | null;
    },
  ) {
    if (options?.customerId && options.tenantId) {
      const customers = await customerSelfServiceService.listCustomerProfilesByIds([
        options.customerId,
      ]);
      const customer = customers.find((item) => (
        item.id === options.customerId && item.tenant_id === options.tenantId
      )) ?? null;
      if (!customer && options.required) {
        throw Errors.forbidden();
      }

      return customer;
    }

    const list = await this.listCustomerProfilesByMembership(authUserId, options);
    if (list.length > 1) {
      throw Errors.badRequest("当前账号绑定了多个客户档案，请先选择装修公司");
    }

    const customer = list[0] || null;
    if (!customer && options?.required) {
      throw Errors.forbidden();
    }

    return customer;
  }

  private async listCustomerProfilesByMembership(
    authUserId: string,
    options?: {
      tenantId?: string | null;
      customerId?: string | null;
    },
  ) {
    const memberships = (await userIdentityService.listActiveBusinessMemberships({
      userId: authUserId,
      identityType: "customer",
    })).filter((item) => (
      (!options?.tenantId || item.tenant_id === options.tenantId) &&
      (!options?.customerId || item.identity_id === options.customerId)
    ));

    const customerIds = Array.from(new Set(memberships.map((item) => item.identity_id)));
    if (customerIds.length === 0) {
      return [] as CustomerContextRow[];
    }

    const customers = await customerSelfServiceService.listCustomerProfilesByIds(
      customerIds,
    );

    const membershipTenantMap = new Map(
      memberships.map((item) => [item.identity_id, item.tenant_id]),
    );

    return customers.filter((item) => {
      const membershipTenantId = membershipTenantMap.get(item.id);
      return (
        item.tenant_id &&
        item.tenant_id === membershipTenantId &&
        (!options?.tenantId || item.tenant_id === options.tenantId) &&
        (!options?.customerId || item.id === options.customerId)
      );
    });
  }

  private normalizeTenantRelation(value: CustomerContextRow["tenant"]) {
    if (Array.isArray(value)) {
      return value[0] ?? null;
    }

    return value ?? null;
  }

  private assertCustomerTenantAvailable(customer: CustomerContextRow | null) {
    if (!customer) return;

    const tenant = this.normalizeTenantRelation(customer.tenant);
    if (!customer.tenant_id || tenant?.status !== "active") {
      throw Errors.business(
        403,
        "装修公司服务已暂停，请联系装修公司",
        ErrorCodes.TENANT_NOT_AVAILABLE,
        {
          tenant_id: customer.tenant_id,
          tenant_status: tenant?.status ?? null,
        },
      );
    }
  }

  private async getCustomerProfileFromRequest(
    request: FastifyRequest,
    options?: { required?: boolean },
  ) {
    const authUserId = await this.getRequiredAuthUserId(request);
    const customer = await this.getCustomerProfileByAuthUserId(authUserId, {
      required: options?.required,
      tenantId: request.user?.tenant_id ?? null,
      customerId: request.user?.customer_id ?? null,
    });
    this.assertCustomerTenantAvailable(customer);
    return customer;
  }

  private async getUserProfileByAuthUserId(authUserId: string) {
    return customerSelfServiceService.getUserProfileByAuthUserId(authUserId);
  }

  private serializeAuthProfile(
    authUserId: string,
    userProfile: UserProfileRow | null,
    roles: string[],
  ) {
    return {
      auth_user_id: authUserId,
      nickname: userProfile?.nickname ?? null,
      avatar: this.getImagePublicUrl(userProfile?.avatar_path),
      avatar_path: userProfile?.avatar_path ?? null,
      profile_completed: Boolean(userProfile?.profile_completed_at),
      profile_completed_at: userProfile?.profile_completed_at ?? null,
      roles,
    };
  }

  private serializeCustomerProfile(
    customer: CustomerContextRow,
    userProfile: UserProfileRow | null,
  ) {
    return {
      customer_id: customer.id,
      auth_user_id: customer.user_id,
      name: customer.name,
      phone: customer.phone ?? null,
      nickname: userProfile?.nickname ?? null,
      avatar: this.getImagePublicUrl(userProfile?.avatar_path),
      avatar_path: userProfile?.avatar_path ?? null,
      profile_completed: Boolean(userProfile?.profile_completed_at),
      profile_completed_at: userProfile?.profile_completed_at ?? null,
    };
  }

  private serializeCustomerContext(
    authUserId: string,
    customer: CustomerContextRow | null,
    userProfile: UserProfileRow | null,
  ) {
    const tenant = customer ? this.normalizeTenantRelation(customer.tenant) : null;

    return {
      mode: customer ? "customer" : "platform_visitor",
      auth_user_id: authUserId,
      customer_id: customer?.id ?? null,
      tenant_id: customer?.tenant_id ?? null,
      tenant_status: tenant?.status ?? null,
      customer_name: customer?.name ?? null,
      has_customer_profile: Boolean(customer),
      nickname: userProfile?.nickname ?? null,
      avatar: this.getImagePublicUrl(userProfile?.avatar_path),
      profile_completed: Boolean(userProfile?.profile_completed_at),
    };
  }

  private async buildCustomerProjectsPayload(input: {
    customer: CustomerContextRow;
    page: number;
    pageSize: number;
    include?: "home_summary";
    request?: FastifyRequest;
  }) {
    const from = (input.page - 1) * input.pageSize;
    const to = from + input.pageSize - 1;

    const projectsStartedAt = Date.now();
    const { list: projectRows, count } = await customerSelfServiceService.listOwnedProjects({
      customerId: input.customer.id,
      tenantId: input.customer.tenant_id!,
      from,
      to,
    });
    input.request?.log.info(
      {
        requestId: input.request.id,
        durationMs: Date.now() - projectsStartedAt,
        customerId: input.customer.id,
        tenantId: input.customer.tenant_id,
        count: projectRows.length,
        total: count || 0,
        page: input.page,
        pageSize: input.pageSize,
      },
      "[customer-bootstrap] owned projects loaded",
    );

    const list = projectRows.map((item) =>
      this.serializeCustomerProjectListItem(item)
    );

    let recentLogMap: Awaited<
      ReturnType<CustomerSelfServiceController["listRecentLogSummariesForProjects"]>
    > | null = null;
    if (input.include === "home_summary") {
      const recentLogsStartedAt = Date.now();
      const loadedRecentLogMap = await this.listRecentLogSummariesForProjects(
        input.customer.id,
        list.map((item) => item.id),
      );
      recentLogMap = loadedRecentLogMap;
      input.request?.log.info(
        {
          requestId: input.request.id,
          durationMs: Date.now() - recentLogsStartedAt,
          customerId: input.customer.id,
          projectCount: list.length,
          recentLogProjectCount: loadedRecentLogMap.size,
        },
        "[customer-bootstrap] recent log summaries loaded",
      );
    }

    return {
      list: list.map((item) => ({
        ...item,
        ...(recentLogMap
          ? { recent_logs: recentLogMap.get(item.id) || [] }
          : {}),
      })),
      pagination: {
        page: input.page,
        pageSize: input.pageSize,
        total: count || 0,
        totalPages: count ? Math.ceil(count / input.pageSize) : 0,
      },
    };
  }

  private async saveAuthUserProfile(
    authUserId: string,
    input: AuthMeProfileUpdateInput,
  ) {
    return customerSelfServiceService.saveAuthUserProfile(authUserId, input);
  }

  private serializeCustomerProjectListItem(row: CustomerProjectListItem) {
    const status = isProjectStatus(row.status) ? row.status : null;
    const property = this.normalizeRelation(row.property, {
      id: null,
      community: null,
      building_info: null,
      layout: null,
      area: null,
      latitude: null,
      longitude: null,
    });
    const designer = this.normalizeRelation(row.designer, {
      id: null,
      name: null,
      avatar: null,
    });

    return {
      id: row.id,
      name: row.name,
      status,
      status_label: status ? ProjectStatusConfig[status].label : null,
      budget: row.budget,
      address: row.address,
      start_date: row.start_date,
      style_tags: this.normalizeStringArray(row.style_tags),
      designer: designer.id
        ? {
          id: designer.id as string,
          name: typeof designer.name === "string" ? designer.name : null,
          avatar: typeof designer.avatar === "string" ? designer.avatar : null,
        }
        : null,
      property: {
        id: typeof property.id === "string" ? property.id : null,
        community: typeof property.community === "string" ? property.community : null,
        building_info: typeof property.building_info === "string"
          ? property.building_info
          : null,
        layout: typeof property.layout === "string" ? property.layout : null,
        area: typeof property.area === "number" ? property.area : null,
        latitude: typeof property.latitude === "number" ? property.latitude : null,
        longitude: typeof property.longitude === "number" ? property.longitude : null,
      },
    };
  }

  private serializeCustomerProjectRecentLog(row: CustomerProjectRecentLogSummaryRow) {
    const stageCode: ProjectLogStageCode | null = isProjectLogStageCode(row.stage_code)
      ? row.stage_code
      : null;

    return {
      id: row.id,
      employee_id: row.employee_id,
      employee_name: row.employee_name,
      employee_avatar: row.employee_avatar,
      employee: row.employee_id
        ? {
          id: row.employee_id,
          name: row.employee_name,
          avatar: row.employee_avatar,
        }
        : null,
      stage_code: stageCode,
      stage_label: stageCode ? PROJECT_LOG_STAGE_CONFIG[stageCode].label : null,
      node_name: row.node_name,
      created_at: row.created_at,
      comment_count: Number(row.comment_count ?? 0),
      rating_count: Number(row.rating_count ?? 0),
      average_rating: row.average_rating == null ? null : Number(row.average_rating),
      image_count: Number(row.image_count ?? 0),
      cover_thumb_url: this.getImagePublicUrl(row.cover_image_path),
    };
  }

  private serializeCustomerProjectLog(row: CustomerProjectLogRow) {
    const stageCode: ProjectLogStageCode | null = isProjectLogStageCode(row.stage_code)
      ? row.stage_code
      : null;
    const images = this.normalizeProjectLogImages(row.images);
    const imageItems = images.map((url) => ({
      url,
      thumb_url: this.getImageThumbUrl(url),
      width: null as number | null,
      height: null as number | null,
    }));
    const employee = this.normalizeRelation(row.employee, {
      id: null,
      name: null,
      avatar: null,
    });
    const employeeId = typeof employee.id === "string"
      ? employee.id
      : row.employee_id ?? null;
    const employeeName = typeof employee.name === "string" ? employee.name : null;
    const employeeAvatar = typeof employee.avatar === "string" ? employee.avatar : null;

    return {
      id: row.id,
      project_id: row.project_id,
      employee_id: employeeId,
      employee_name: employeeName,
      employee_avatar: employeeAvatar,
      employee: employeeId
        ? {
          id: employeeId,
          name: employeeName,
          avatar: employeeAvatar,
        }
        : null,
      stage_code: stageCode,
      stage_label: stageCode ? PROJECT_LOG_STAGE_CONFIG[stageCode].label : null,
      node_name: row.node_name,
      content: row.content,
      images,
      image_items: imageItems,
      image_count: imageItems.length,
      created_at: row.created_at,
    };
  }

  private buildProjectLogAggregates(
    rows: CustomerProjectLogCommentAggregateRow[],
    customerId: string,
  ) {
    const aggregates = new Map<string, {
      comment_count: number;
      rating_count: number;
      rating_sum: number;
      my_rating: number | null;
      my_rating_created_at: string | null;
    }>();

    for (const row of rows) {
      const current = aggregates.get(row.log_id) || {
        comment_count: 0,
        rating_count: 0,
        rating_sum: 0,
        my_rating: null,
        my_rating_created_at: null,
      };

      current.comment_count += 1;

      if (typeof row.rating === "number") {
        current.rating_count += 1;
        current.rating_sum += row.rating;

        if (
          row.author_type === "customer" &&
          row.author_id === customerId &&
          row.parent_id == null
        ) {
          const nextCreatedAt = row.created_at ? new Date(row.created_at).getTime() : 0;
          const currentCreatedAt = current.my_rating_created_at
            ? new Date(current.my_rating_created_at).getTime()
            : 0;

          if (nextCreatedAt >= currentCreatedAt) {
            current.my_rating = row.rating;
            current.my_rating_created_at = row.created_at;
          }
        }
      }

      aggregates.set(row.log_id, current);
    }

    return aggregates;
  }

  private async listRecentLogSummariesForProjects(
    customerId: string,
    projectIds: string[],
  ) {
    if (projectIds.length === 0) {
      return new Map<string, ReturnType<typeof this.serializeCustomerProjectRecentLog>[]>();
    }

    const rows = await customerSelfServiceService.listRecentLogSummariesForProjects({
      customerId,
      projectIds,
      perProject: 2,
    });

    const recentLogMap = new Map<
      string,
      ReturnType<typeof this.serializeCustomerProjectRecentLog>[]
    >();

    for (const row of rows) {
      const list = recentLogMap.get(row.project_id) || [];
      if (list.length < 2) {
        list.push(this.serializeCustomerProjectRecentLog(row));
        recentLogMap.set(row.project_id, list);
      }
    }

    return recentLogMap;
  }

  private async getOwnedProjectLog(
    logId: string,
    projectId: string,
    tenantId?: string | null,
  ) {
    const log = await customerSelfServiceService.findOwnedProjectLog({
      logId,
      projectId,
      tenantId,
    });
    if (!log?.id) {
      throw Errors.notFound("项目日志不存在");
    }

    return log;
  }

  private async attachCustomerProjectLogCommentAuthors(
    rows: CustomerProjectLogCommentRow[],
  ) {
    if (rows.length === 0) {
      return [];
    }

    const employeeIds = Array.from(new Set(
      rows
        .filter((item) => item.author_type === "employee")
        .map((item) => item.author_id),
    ));
    const customerIds = Array.from(new Set(
      rows
        .filter((item) => item.author_type === "customer")
        .map((item) => item.author_id),
    ));

    const [employees, customers] = await Promise.all([
      customerSelfServiceService.listCommentAuthorEmployees(employeeIds),
      customerSelfServiceService.listCommentAuthorCustomers(customerIds),
    ]);

    const employeeMap = new Map<string, CustomerProjectLogCommentAuthor>(
      employees.map((item: CustomerProjectLogCommentAuthorEmployee) => [
        item.id,
        {
          id: item.id,
          name: item.name,
          avatar: item.avatar,
        },
      ]),
    );
    const customerMap = new Map<string, CustomerProjectLogCommentAuthor>(
      customers.map((item: CustomerProjectLogCommentAuthorCustomer) => [
        item.id,
        {
          id: item.id,
          name: item.name,
          avatar: null,
        },
      ]),
    );

    return rows.map((row) => ({
      id: row.id,
      log_id: row.log_id,
      parent_id: row.parent_id,
      content: row.content,
      rating: row.rating,
      images: this.normalizeProjectLogImageItems(row.images).map((item) => ({
        url: item.url,
        thumb_url: item.thumb_url,
      })),
      author_type: row.author_type,
      author: row.author_type === "employee"
        ? employeeMap.get(row.author_id) ?? null
        : customerMap.get(row.author_id) ?? null,
      created_at: row.created_at,
    }));
  }

  private serializeCustomerProjectMember(item: CustomerProjectMemberSummary) {
    return {
      id: item.id,
      project_id: item.project_id,
      employee_id: item.employee_id,
      role_code: item.role_code,
      role_name: item.role_name,
      is_primary: item.is_primary,
      sort_order: item.sort_order,
      created_at: item.created_at,
      updated_at: item.updated_at ?? null,
      employee: item.employee
        ? {
          id: item.employee.id,
          name: item.employee.name ?? null,
          avatar: item.employee.avatar ?? null,
          phone: item.employee.phone ?? null,
        }
        : null,
      ...(item.is_virtual ? { is_virtual: true } : {}),
    };
  }

  private async serializeCustomerProjectDetailItem(row: CustomerProjectListItem) {
    const projectId = typeof row.id === "string" ? row.id : "";
    const base = this.serializeCustomerProjectListItem(row);
    if (!projectId) {
      return {
        ...base,
        members: [] as ReturnType<typeof this.serializeCustomerProjectMember>[],
      };
    }

    const members = await projectMemberService.listProjectMembers(projectId);

    return {
      ...base,
      members: members.map((item) =>
        this.serializeCustomerProjectMember(item as CustomerProjectMemberSummary)
      ),
    };
  }

  private async getOwnedProject(
    projectId: string,
    customerId: string,
    tenantId?: string | null,
  ) {
    const project = await customerSelfServiceService.findOwnedProject({
      projectId,
      customerId,
      tenantId,
    });
    if (!project) {
      throw Errors.notFound("项目不存在");
    }

    return project;
  }

  @Get("/auth/me/customer-context")
  async getCustomerContext(request: FastifyRequest, reply: FastifyReply) {
    const authUserId = await this.getRequiredAuthUserId(request);
    const customer = await this.getCustomerProfileByAuthUserId(authUserId, {
      tenantId: request.user?.tenant_id ?? null,
      customerId: request.user?.customer_id ?? null,
    });
    if (!customer && (request.user?.customer_id || request.user?.tenant_id)) {
      throw Errors.business(
        403,
        "当前客户身份已失效，请重新登录",
        ErrorCodes.CUSTOMER_CONTEXT_MISSING,
      );
    }
    this.assertCustomerTenantAvailable(customer);
    const userProfile = await this.getUserProfileByAuthUserId(authUserId);

    return ResponseHandler.success(
      this.serializeCustomerContext(authUserId, customer, userProfile),
    );
  }

  @Get("/auth/me/profile")
  async getAuthMeProfile(request: FastifyRequest, reply: FastifyReply) {
    const authUserId = await this.getRequiredAuthUserId(request);
    const userProfile = await this.getUserProfileByAuthUserId(authUserId);
    const roles = Array.isArray(request.user?.roles)
      ? request.user.roles.filter((item): item is string => typeof item === "string")
      : [];

    return ResponseHandler.success(
      this.serializeAuthProfile(authUserId, userProfile, roles),
    );
  }

  @Patch("/auth/me/profile")
  async patchAuthMeProfile(request: FastifyRequest, reply: FastifyReply) {
    const authUserId = await this.getRequiredAuthUserId(request);
    const verify = AuthMeProfileUpdateSchema.safeParse(request.body);
    if (!verify.success) {
      throw Errors.fromZod(verify.error);
    }

    const userProfile = await this.saveAuthUserProfile(authUserId, verify.data);
    const roles = Array.isArray(request.user?.roles)
      ? request.user.roles.filter((item): item is string => typeof item === "string")
      : [];

    return ResponseHandler.success(
      this.serializeAuthProfile(authUserId, userProfile, roles),
    );
  }

  @Get("/customer/profile")
  async getCustomerProfile(request: FastifyRequest, reply: FastifyReply) {
    const authUserId = await this.getRequiredAuthUserId(request);
    const customer = await this.getCustomerProfileFromRequest(request, {
      required: true,
    });
    const userProfile = await this.getUserProfileByAuthUserId(authUserId);

    return ResponseHandler.success(
      this.serializeCustomerProfile(customer!, userProfile),
    );
  }

  @Get("/customer/bootstrap")
  async getCustomerBootstrap(request: FastifyRequest, reply: FastifyReply) {
    const startedAt = Date.now();
    const authUserId = await this.getRequiredAuthUserId(request);
    const customerStartedAt = Date.now();
    const customer = await this.getCustomerProfileFromRequest(request, {
      required: true,
    });
    request.log.info(
      {
        requestId: request.id,
        durationMs: Date.now() - customerStartedAt,
        authUserId,
        customerId: customer?.id ?? null,
        tenantId: customer?.tenant_id ?? null,
      },
      "[customer-bootstrap] customer context loaded",
    );
    const queryResult = CustomerBootstrapQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const { page, pageSize, include, projects_mode: projectsMode } = queryResult.data;
    const userProfileStartedAt = Date.now();
    const cachedUserProfile = customerSelfServiceService
      .getCachedUserProfileByAuthUserId(authUserId);
    if (!cachedUserProfile) {
      void this.getUserProfileByAuthUserId(authUserId);
    }
    request.log.info(
      {
        requestId: request.id,
        durationMs: Date.now() - userProfileStartedAt,
        authUserId,
        hasUserProfile: Boolean(cachedUserProfile),
        source: cachedUserProfile ? "cache" : "background",
      },
      "[customer-bootstrap] user profile loaded",
    );
    const projects = projectsMode === "inline"
      ? await this.buildCustomerProjectsPayload({
        customer: customer!,
        page,
        pageSize,
        include,
        request,
      })
      : null;
    if (projectsMode === "defer") {
      void customerSelfServiceService.prewarmCustomerHomeProjects({
        customerId: customer!.id,
        tenantId: customer!.tenant_id!,
        pageSize,
      });
      request.log.info(
        {
          requestId: request.id,
          durationMs: 0,
          customerId: customer!.id,
          tenantId: customer!.tenant_id,
          page,
          pageSize,
          source: "defer",
        },
        "[customer-bootstrap] owned projects deferred",
      );
    }

    const response = {
      context: this.serializeCustomerContext(authUserId, customer!, cachedUserProfile),
      customer_service: await customerServiceTicketService.getCustomerServiceConfig(
        customer!.tenant_id,
      ),
      projects,
      projects_mode: projectsMode,
    };
    request.log.info(
      {
        requestId: request.id,
        durationMs: Date.now() - startedAt,
        authUserId,
        customerId: customer?.id ?? null,
        projectCount: projects?.list.length ?? 0,
        projectsMode,
      },
      "[customer-bootstrap] bootstrap resolved",
    );
    return ResponseHandler.success(response);
  }

  @Get("/customer/projects")
  async listCustomerProjects(request: FastifyRequest, reply: FastifyReply) {
    const customer = await this.getCustomerProfileFromRequest(request, {
      required: true,
    });
    const queryResult = CustomerProjectListQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const { page, pageSize, include } = queryResult.data;
    return ResponseHandler.success(
      await this.buildCustomerProjectsPayload({
        customer: customer!,
        page,
        pageSize,
        include,
        request,
      }),
    );
  }

  @Get("/customer/service-tickets")
  async listCustomerServiceTickets(request: FastifyRequest, reply: FastifyReply) {
    const customer = await this.getCustomerProfileFromRequest(request, {
      required: true,
    });
    const queryResult = CustomerServiceTicketListQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    return ResponseHandler.success(
      await customerServiceTicketService.listCustomerTickets({
        customer: customer!,
        query: queryResult.data,
      }),
    );
  }

  @Post("/customer/service-tickets")
  async createCustomerServiceTicket(request: FastifyRequest, reply: FastifyReply) {
    const authUserId = await this.getRequiredAuthUserId(request);
    const customer = await this.getCustomerProfileFromRequest(request, {
      required: true,
    });
    const bodyResult = CreateCustomerServiceTicketSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    return ResponseHandler.success(
      await customerServiceTicketService.createCustomerTicket({
        authUserId,
        customer: customer!,
        payload: bodyResult.data,
      }),
    );
  }

  @Get("/customer/service-tickets/:id")
  async getCustomerServiceTicket(request: FastifyRequest, reply: FastifyReply) {
    const customer = await this.getCustomerProfileFromRequest(request, {
      required: true,
    });
    const params = CustomerServiceTicketParamsSchema.safeParse(request.params);
    if (!params.success) throw Errors.fromZod(params.error);

    return ResponseHandler.success(
      await customerServiceTicketService.getCustomerTicketDetail({
        customer: customer!,
        ticketId: params.data.id,
      }),
    );
  }

  @Get("/customer/projects/:id")
  async getCustomerProjectById(request: FastifyRequest, reply: FastifyReply) {
    const customer = await this.getCustomerProfileFromRequest(request, {
      required: true,
    });
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    return ResponseHandler.success(
      await this.serializeCustomerProjectDetailItem(
        await this.getOwnedProject(idVerify.data.id, customer!.id, customer!.tenant_id),
      ),
    );
  }

  @Get("/customer/projects/:id/construction-stages")
  async listCustomerProjectConstructionStages(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const customer = await this.getCustomerProfileFromRequest(request, {
      required: true,
    });
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const project = await this.getOwnedProject(
      idVerify.data.id,
      customer!.id,
      customer!.tenant_id,
    );

    return ResponseHandler.success(
      await constructionStageStatusService.listProjectConstructionStagesForProject({
        projectId: project.id,
        tenantId: project.tenant_id,
      }),
    );
  }

  @Get("/customer/project-acceptances")
  async listCustomerProjectAcceptances(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const authUserId = await this.getRequiredAuthUserId(request);
    const queryResult = CustomerProjectAcceptanceListQuerySchema.safeParse(
      request.query,
    );
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    return ResponseHandler.success(
      await projectAcceptanceService.listCustomerAcceptances(
        authUserId,
        queryResult.data,
        {
          tenantId: request.user?.tenant_id ?? null,
          customerId: request.user?.customer_id ?? null,
        },
      ),
    );
  }

  @Post("/customer/project-acceptances/open-ticket/verify")
  async verifyProjectAcceptanceOpenTicket(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const result = VerifyProjectAcceptanceOpenTicketSchema.safeParse(
      request.body,
    );
    if (!result.success) throw Errors.fromZod(result.error);

    return ResponseHandler.success(
      await projectAcceptanceService.verifyOpenTicket(result.data),
    );
  }

  @Get("/customer/project-acceptances/:id")
  async getCustomerProjectAcceptanceById(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);
    const queryResult = CustomerProjectAcceptanceOpenTicketQuerySchema.safeParse(
      request.query,
    );
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    return ResponseHandler.success(
      await projectAcceptanceService.getCustomerAcceptanceByAuthOrTicket({
        authUserId: request.user?.sub,
        tenantId: request.user?.tenant_id ?? null,
        customerId: request.user?.customer_id ?? null,
        id: idVerify.data.id,
        ticketQuery: queryResult.data,
      }),
    );
  }

  @Get("/customer/projects/:id/logs")
  async getCustomerProjectLogs(request: FastifyRequest, reply: FastifyReply) {
    const customer = await this.getCustomerProfileFromRequest(request, {
      required: true,
    });
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);
    const queryResult = CustomerProjectLogListQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const project = await this.getOwnedProject(
      idVerify.data.id,
      customer!.id,
      customer!.tenant_id,
    );
    const { page, pageSize } = queryResult.data;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const projectTenantId = project.tenant_id ?? null;

    const { list: logs, count } = await customerSelfServiceService.listProjectLogs({
      projectId: idVerify.data.id,
      tenantId: projectTenantId,
      from,
      to,
    });
    const logIds = logs.map((item) => item.id);
    let aggregateMap = new Map<string, {
      comment_count: number;
      rating_count: number;
      rating_sum: number;
      my_rating: number | null;
      my_rating_created_at: string | null;
    }>();

    aggregateMap = this.buildProjectLogAggregates(
      await customerSelfServiceService.listProjectLogCommentAggregates({
        logIds,
        tenantId: projectTenantId,
      }),
      customer!.id,
    );

    return ResponseHandler.success({
      list: logs.map((item) => {
        const base = this.serializeCustomerProjectLog(item);
        const aggregate = aggregateMap.get(item.id);

        return {
          ...base,
          comment_count: aggregate?.comment_count ?? 0,
          rating_count: aggregate?.rating_count ?? 0,
          average_rating: aggregate?.rating_count
            ? Number((aggregate.rating_sum / aggregate.rating_count).toFixed(1))
            : null,
          my_rating: aggregate?.my_rating ?? null,
        };
      }),
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: count ? Math.ceil(count / pageSize) : 0,
      },
    });
  }

  @Get("/customer/projects/:id/logs/:logId/comments")
  async getCustomerProjectLogComments(request: FastifyRequest, reply: FastifyReply) {
    const customer = await this.getCustomerProfileFromRequest(request, {
      required: true,
    });
    const paramsResult = CustomerProjectLogCommentParamSchema.safeParse(
      request.params,
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const queryResult = CustomerProjectLogCommentListQuerySchema.safeParse(
      request.query,
    );
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const project = await this.getOwnedProject(
      paramsResult.data.id,
      customer!.id,
      customer!.tenant_id,
    );
    await this.getOwnedProjectLog(
      paramsResult.data.logId,
      paramsResult.data.id,
      project.tenant_id,
    );

    const { page, pageSize } = queryResult.data;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { list, count } = await customerSelfServiceService.listProjectLogComments({
      logId: paramsResult.data.logId,
      tenantId: project.tenant_id ?? null,
      from,
      to,
    });

    return ResponseHandler.success({
      list: await this.attachCustomerProjectLogCommentAuthors(list),
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: count ? Math.ceil(count / pageSize) : 0,
      },
    });
  }
}

export default new CustomerSelfServiceController();
