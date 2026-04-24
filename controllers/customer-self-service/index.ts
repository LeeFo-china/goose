import { BaseController } from "@/controllers/BaseController";
import { Errors } from "@/errors/error-factory";
import { Get } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import { SupabaseDB } from "@/utils/supabase";
import type { FastifyRequest, FastifyReply } from "fastify";
import { authorizationService } from "@/services/authorization";
import { PaginationQuerySchema } from "@/schema/request";
import {
  PROJECT_LOG_STAGE_CONFIG,
  ProjectStatusConfig,
  isProjectLogStageCode,
  isProjectStatus,
  type ProjectLogStageCode,
} from "@gooes/domain";
import type { Tables } from "@/types/database";

type CustomerContextRow = Pick<Tables<"customers">, "id" | "name" | "user_id">;

type CustomerProjectListItem = {
  id: string;
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
  stage_code: string | null;
  node_name: string | null;
  content: string | null;
  images: unknown;
  created_at: string | null;
};

const PROJECT_LOGS_BUCKET = "project-logs";

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
          .from(PROJECT_LOGS_BUCKET)
          .getPublicUrl(item)
          .data.publicUrl;
      });
  }

  private async getCustomerProfileByAuthUserId(
    authUserId: string,
    options?: { required?: boolean },
  ) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("customers")
      .select("id, name, user_id")
      .eq("user_id", authUserId)
      .limit(2);

    if (error) {
      throw Errors.dbError("查询客户身份失败", error);
    }

    const list = (data || []) as CustomerContextRow[];
    if (list.length > 1) {
      throw Errors.badRequest("当前账号绑定了多个客户档案，请联系管理员处理");
    }

    const customer = list[0] || null;
    if (!customer && options?.required) {
      throw Errors.forbidden();
    }

    return customer;
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

  private serializeCustomerProjectLog(row: CustomerProjectLogRow) {
    const stageCode: ProjectLogStageCode | null = isProjectLogStageCode(row.stage_code)
      ? row.stage_code
      : null;

    return {
      id: row.id,
      project_id: row.project_id,
      stage_code: stageCode,
      stage_label: stageCode ? PROJECT_LOG_STAGE_CONFIG[stageCode].label : null,
      node_name: row.node_name,
      content: row.content,
      images: this.normalizeProjectLogImages(row.images),
      created_at: row.created_at,
    };
  }

  private async getOwnedProject(projectId: string, customerId: string) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("projects")
      .select(`
        id,
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
    const customer = await this.getCustomerProfileByAuthUserId(authUserId);

    return ResponseHandler.success({
      auth_user_id: authUserId,
      customer_id: customer?.id ?? null,
      customer_name: customer?.name ?? null,
      has_customer_profile: Boolean(customer),
    });
  }

  @Get("/customer/projects")
  async listCustomerProjects(request: FastifyRequest, reply: FastifyReply) {
    const authUserId = await this.getRequiredAuthUserId(request);
    const customer = await this.getCustomerProfileByAuthUserId(authUserId, {
      required: true,
    });
    const queryResult = PaginationQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const { page, pageSize } = queryResult.data;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await SupabaseDB.getAdminClient()
      .from("projects")
      .select(`
        id,
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
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      throw Errors.dbError("查询客户项目列表失败", error);
    }

    return ResponseHandler.success({
      list: ((data || []) as unknown as CustomerProjectListItem[]).map((item) =>
        this.serializeCustomerProjectListItem(item)
      ),
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
    const authUserId = await this.getRequiredAuthUserId(request);
    const customer = await this.getCustomerProfileByAuthUserId(authUserId, {
      required: true,
    });
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    return ResponseHandler.success(
      this.serializeCustomerProjectListItem(
        await this.getOwnedProject(idVerify.data.id, customer!.id),
      ),
    );
  }

  @Get("/customer/projects/:id/logs")
  async getCustomerProjectLogs(request: FastifyRequest, reply: FastifyReply) {
    const authUserId = await this.getRequiredAuthUserId(request);
    const customer = await this.getCustomerProfileByAuthUserId(authUserId, {
      required: true,
    });
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    await this.getOwnedProject(idVerify.data.id, customer!.id);

    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_logs")
      .select("id, project_id, stage_code, node_name, content, images, created_at")
      .eq("project_id", idVerify.data.id)
      .order("created_at", { ascending: false });

    if (error) {
      throw Errors.dbError("查询客户项目日志失败", error);
    }

    return ResponseHandler.success({
      list: ((data || []) as unknown as CustomerProjectLogRow[]).map((item) =>
        this.serializeCustomerProjectLog(item)
      ),
    });
  }
}

export default new CustomerSelfServiceController();
