import { BaseController } from "@/controllers/BaseController";
import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import { projectMemberService } from "@/services/project-members";
import { projectAcceptanceService } from "@/services/project-acceptances";
import {
  CustomerProjectAcceptanceOpenTicketQuerySchema,
  VerifyProjectAcceptanceOpenTicketSchema,
} from "@/schema/project-acceptances";
import { Get, Patch, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import { SupabaseDB } from "@/utils/supabase";
import { userIdentityService } from "@/services/user-identities";
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
import type { Tables } from "@/types/database";

type CustomerContextRow = {
  id: string;
  name: string | null;
  phone: string | null;
  user_id: string | null;
  tenant_id: string | null;
  tenant:
    | {
      id: string | null;
      name: string | null;
      slug: string | null;
      status: string | null;
    }
    | Array<{
      id: string | null;
      name: string | null;
      slug: string | null;
      status: string | null;
    }>
    | null;
};

type AuthIdentitySource = "legacy" | "dual" | "membership";

type UserProfileRow = {
  auth_user_id: string;
  nickname: string | null;
  avatar_path: string | null;
  profile_completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type CustomerProjectListItem = {
  id: string;
  tenant_id?: string | null;
  name: string | null;
  status: string | null;
  budget: number | null;
  address: string | null;
  start_date: string | null;
  style_tags: unknown;
  designer: {
    id: string;
    name: string | null;
    avatar?: string | null;
  } | {
    id: string;
    name: string | null;
    avatar?: string | null;
  }[] | null;
  property: {
    id: string;
    community: string | null;
    building_info: string | null;
    layout?: string | null;
    area?: number | null;
    latitude?: number | null;
    longitude?: number | null;
  } | {
    id: string;
    community: string | null;
    building_info: string | null;
    layout?: string | null;
    area?: number | null;
    latitude?: number | null;
    longitude?: number | null;
  }[] | null;
};

type CustomerProjectLogRow = {
  id: string;
  project_id: string;
  employee_id: string | null;
  stage_code: string | null;
  node_name: string | null;
  content: string | null;
  images: unknown;
  created_at: string | null;
  employee:
    | {
      id: string | null;
      name: string | null;
      avatar?: string | null;
    }
    | {
      id: string | null;
      name: string | null;
      avatar?: string | null;
    }[]
    | null;
};

type CustomerProjectRecentLogSummaryRow = {
  project_id: string;
  id: string;
  employee_id: string | null;
  employee_name: string | null;
  employee_avatar: string | null;
  stage_code: string | null;
  node_name: string | null;
  created_at: string | null;
  image_count: number | null;
  cover_image_path: string | null;
  comment_count: number | null;
  rating_count: number | null;
  average_rating: number | null;
};

type ProjectLogCommentAggregateRow = {
  id: string;
  log_id: string;
  parent_id: string | null;
  author_type: string;
  author_id: string;
  rating: number | null;
  created_at: string | null;
};

type CustomerProjectLogCommentRow = {
  id: string;
  log_id: string;
  parent_id: string | null;
  author_type: string;
  author_id: string;
  content: string;
  rating: number | null;
  images: unknown;
  created_at: string | null;
};

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

const PROJECT_LOGS_BUCKET = "project-logs";

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

  private getAuthIdentitySource(): AuthIdentitySource {
    const value = (process.env.AUTH_IDENTITY_SOURCE || "dual").trim().toLowerCase();
    if (value === "legacy" || value === "membership") {
      return value;
    }

    return "dual";
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
    if (!path) {
      return null;
    }

    if (/^https?:\/\//i.test(path)) {
      return path;
    }

    return SupabaseDB.getAdminClient()
      .storage
      .from(PROJECT_LOGS_BUCKET)
      .getPublicUrl(path)
      .data.publicUrl;
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
    const identitySource = this.getAuthIdentitySource();
    if (identitySource === "membership") {
      return this.getCustomerProfileByMembership(authUserId, options);
    }

    let query = SupabaseDB.getAdminClient()
      .from("customers")
      .select(`
        id,
        name,
        phone,
        user_id,
        tenant_id,
        tenant:tenants!customers_tenant_id_fkey(
          id,
          name,
          slug,
          status
        )
      `)
      .eq("user_id", authUserId);

    if (options?.tenantId) {
      query = query.eq("tenant_id", options.tenantId);
    }

    if (options?.customerId) {
      query = query.eq("id", options.customerId);
    }

    const { data, error } = await query.limit(2);

    if (error) {
      throw Errors.dbError("查询客户身份失败", error);
    }

    let list = (data || []) as CustomerContextRow[];
    if (identitySource === "dual") {
      const membershipCustomers = await this.listCustomerProfilesByMembership(
        authUserId,
        options,
      );
      const customerMap = new Map<string, CustomerContextRow>();
      for (const customer of [...membershipCustomers, ...list]) {
        customerMap.set(customer.id, customer);
      }
      list = Array.from(customerMap.values());
    }

    if (list.length > 1) {
      throw Errors.badRequest("当前账号绑定了多个客户档案，请先选择装修公司");
    }

    const customer = list[0] || null;
    if (!customer && options?.required) {
      throw Errors.forbidden();
    }

    return customer;
  }

  private async getCustomerProfileByMembership(
    authUserId: string,
    options?: {
      required?: boolean;
      tenantId?: string | null;
      customerId?: string | null;
    },
  ) {
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

    const { data, error } = await SupabaseDB.getAdminClient()
      .from("customers")
      .select(`
        id,
        name,
        phone,
        user_id,
        tenant_id,
        tenant:tenants!customers_tenant_id_fkey(
          id,
          name,
          slug,
          status
        )
      `)
      .in("id", customerIds);

    if (error) {
      throw Errors.dbError("查询客户业务身份失败", error);
    }

    const membershipTenantMap = new Map(
      memberships.map((item) => [item.identity_id, item.tenant_id]),
    );

    return ((data || []) as CustomerContextRow[]).filter((item) => {
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
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("user_profiles")
      .select("auth_user_id, nickname, avatar_path, profile_completed_at, created_at, updated_at")
      .eq("auth_user_id", authUserId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询用户资料失败", error);
    }

    return (data as UserProfileRow | null) || null;
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

  private async saveAuthUserProfile(
    authUserId: string,
    input: AuthMeProfileUpdateInput,
  ) {
    const current = await this.getUserProfileByAuthUserId(authUserId);
    const nickname = input.nickname !== undefined
      ? input.nickname
      : current?.nickname ?? null;
    const avatarPath = input.avatar_path !== undefined
      ? input.avatar_path
      : current?.avatar_path ?? null;
    const shouldMarkCompleted = Boolean(nickname || avatarPath);
    const profileCompletedAt = shouldMarkCompleted
      ? current?.profile_completed_at ?? new Date().toISOString()
      : null;

    if (!current && !shouldMarkCompleted) {
      return null;
    }

    const { data, error } = await SupabaseDB.getAdminClient()
      .from("user_profiles")
      .upsert({
        auth_user_id: authUserId,
        nickname,
        avatar_path: avatarPath,
        profile_completed_at: profileCompletedAt,
      }, {
        onConflict: "auth_user_id",
      })
      .select("auth_user_id, nickname, avatar_path, profile_completed_at, created_at, updated_at")
      .single();

    if (error) {
      throw Errors.dbError("保存用户资料失败", error);
    }

    return data as UserProfileRow;
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
    rows: ProjectLogCommentAggregateRow[],
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

    const { data, error } = await SupabaseDB.getAdminClient().rpc(
      "get_customer_project_recent_log_summaries",
      {
        p_customer_id: customerId,
        p_project_ids: projectIds,
        p_per_project: 2,
      },
    );

    if (error) {
      throw Errors.dbError("查询客户项目最近日志摘要失败", error);
    }

    const recentLogMap = new Map<
      string,
      ReturnType<typeof this.serializeCustomerProjectRecentLog>[]
    >();

    for (const row of (data || []) as CustomerProjectRecentLogSummaryRow[]) {
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
    let query = SupabaseDB.getAdminClient()
      .from("project_logs")
      .select("id, project_id")
      .eq("id", logId)
      .eq("project_id", projectId);

    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    const { data, error } = await query.maybeSingle<{ id: string; project_id: string }>();

    if (error) {
      throw Errors.dbError("查询客户项目日志失败", error);
    }

    if (!data?.id) {
      throw Errors.notFound("项目日志不存在");
    }

    return data;
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

    const adminClient = SupabaseDB.getAdminClient();
    const [{ data: employees }, { data: customers }] = await Promise.all([
      employeeIds.length > 0
        ? adminClient.from("employees").select("id, name, avatar").in("id", employeeIds)
        : Promise.resolve({
          data: [] as Array<Pick<Tables<"employees">, "id" | "name" | "avatar">>,
        }),
      customerIds.length > 0
        ? adminClient.from("customers").select("id, name").in("id", customerIds)
        : Promise.resolve({
          data: [] as Array<Pick<Tables<"customers">, "id" | "name">>,
        }),
    ]);

    const employeeMap = new Map<string, CustomerProjectLogCommentAuthor>(
      (employees || []).map((item) => [
        item.id,
        {
          id: item.id,
          name: item.name,
          avatar: item.avatar,
        },
      ]),
    );
    const customerMap = new Map<string, CustomerProjectLogCommentAuthor>(
      (customers || []).map((item) => [
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

  private async getOwnedProject(projectId: string, customerId: string) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("projects")
      .select(`
        id,
        tenant_id,
        name,
        status,
        budget,
        address,
        start_date,
        style_tags,
        designer:employees!projects_designer_id_fkey(
          id,
          name,
          avatar
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
      `)
      .eq("id", projectId)
      .eq("customer_id", customerId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询客户项目详情失败", error);
    }

    if (!data) {
      throw Errors.notFound("项目不存在");
    }

    return data as unknown as CustomerProjectListItem;
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
    const tenant = customer ? this.normalizeTenantRelation(customer.tenant) : null;

    return ResponseHandler.success({
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
    });
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

  @Get("/customer/projects")
  async listCustomerProjects(request: FastifyRequest, reply: FastifyReply) {
    const customer = await this.getCustomerProfileFromRequest(request, {
      required: true,
    });
    const queryResult = CustomerProjectListQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const { page, pageSize, include } = queryResult.data;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await SupabaseDB.getAdminClient()
      .from("projects")
      .select(`
        id,
        tenant_id,
        name,
        status,
        budget,
        address,
        start_date,
        style_tags,
        designer:employees!projects_designer_id_fkey(
          id,
          name,
          avatar
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
      `, { count: "exact" })
      .eq("customer_id", customer!.id)
      .eq("tenant_id", customer!.tenant_id)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      throw Errors.dbError("查询客户项目列表失败", error);
    }

    const list = ((data || []) as unknown as CustomerProjectListItem[]).map((item) =>
      this.serializeCustomerProjectListItem(item)
    );

    const recentLogMap = include === "home_summary"
      ? await this.listRecentLogSummariesForProjects(
        customer!.id,
        list.map((item) => item.id),
      )
      : null;

    return ResponseHandler.success({
      list: list.map((item) => ({
        ...item,
        ...(recentLogMap
          ? { recent_logs: recentLogMap.get(item.id) || [] }
          : {}),
      })),
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: count ? Math.ceil(count / pageSize) : 0,
      },
    });
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
        await this.getOwnedProject(idVerify.data.id, customer!.id),
      ),
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

    const project = await this.getOwnedProject(idVerify.data.id, customer!.id);
    const { page, pageSize } = queryResult.data;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await SupabaseDB.getAdminClient()
      .from("project_logs")
      .select(`
        id,
        project_id,
        employee_id,
        stage_code,
        node_name,
        content,
        images,
        created_at,
        employee:employees!project_logs_employee_id_fkey(
          id,
          name,
          avatar
        )
      `, { count: "exact" })
      .eq("project_id", idVerify.data.id)
      .eq("tenant_id", project.tenant_id)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      throw Errors.dbError("查询客户项目日志失败", error);
    }

    const logs = (data || []) as unknown as CustomerProjectLogRow[];
    const logIds = logs.map((item) => item.id);
    let aggregateMap = new Map<string, {
      comment_count: number;
      rating_count: number;
      rating_sum: number;
      my_rating: number | null;
      my_rating_created_at: string | null;
    }>();

    if (logIds.length > 0) {
      const { data: comments, error: commentsError } = await SupabaseDB.from(
        "project_log_comments",
      )
        .select("id, log_id, parent_id, author_type, author_id, rating, created_at")
        .in("log_id", logIds)
        .eq("tenant_id", project.tenant_id)
        .is("deleted_at", null);

      if (commentsError) {
        throw Errors.dbError("查询日志评论聚合失败", commentsError);
      }

      aggregateMap = this.buildProjectLogAggregates(
        (comments || []) as ProjectLogCommentAggregateRow[],
        customer!.id,
      );
    }

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

    const project = await this.getOwnedProject(paramsResult.data.id, customer!.id);
    await this.getOwnedProjectLog(
      paramsResult.data.logId,
      paramsResult.data.id,
      project.tenant_id,
    );

    const { page, pageSize } = queryResult.data;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await SupabaseDB.getAdminClient()
      .from("project_log_comments")
      .select(
        "id, log_id, parent_id, author_type, author_id, content, rating, images, created_at",
        { count: "exact" },
      )
      .eq("log_id", paramsResult.data.logId)
      .eq("tenant_id", project.tenant_id)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .range(from, to);

    if (error) {
      throw Errors.dbError("查询日志评论失败", error);
    }

    return ResponseHandler.success({
      list: await this.attachCustomerProjectLogCommentAuthors(
        (data || []) as unknown as CustomerProjectLogCommentRow[],
      ),
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
