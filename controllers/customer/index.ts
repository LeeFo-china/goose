import type { FastifyReply, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { SupabaseDB } from "@/utils/supabase/index";
import { Errors } from "@/errors/error-factory";
import {
  BatchAssignCustomerOwnerSchema,
  CreateCustomerSchema,
  CustomerListQuerySchema,
  UpdateCustomerSchema,
} from "@/schema/customer";
import { BaseController } from "@/controllers/BaseController";
import { Get, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type {
  BatchAssignCustomerOwnerInput,
  CreateCustomerSchemaType,
  FollowUpInsert,
  UpdateCustomerSchemaType,
} from "@/schema/customer";
import { PaginationQuerySchema } from "@/schema/request";
import { authorizationService } from "@/services/authorization";
import { accessPolicyService } from "@/services/access-policy";
import { customerFollowUpCommentService } from "@/services/customer-follow-up-comments";

type CustomerPropertyPayload =
  | CreateCustomerSchemaType["property"]
  | UpdateCustomerSchemaType["property"];

type PrimaryPropertySummary = {
  id: string;
  community: string;
  building_info: string | null;
  layout: string | null;
  area: number | null;
};

// 继承基类
class CustomerController extends BaseController<
  typeof CreateCustomerSchema,
  typeof UpdateCustomerSchema
> {
  private propertySummarySelect = `
    id,
    community,
    building_info,
    layout,
    area
  `;

  private customerSelect = `
    *,
    owner:employees!customers_owner_id_fkey(
      id,
      name,
      phone
    )
  `;

  private followUpSelect = `
    *,
    employee:employees!customer_follow_ups_employee_id_fkey(
      id,
      name,
      phone,
      avatar
    )
  `;

  constructor() {
    super("customers", CreateCustomerSchema, UpdateCustomerSchema);
  }

  private async getRequiredAuthContext(request: FastifyRequest) {
    const authContext = await authorizationService.getRequiredAuthContext(
      request.user?.sub,
    );
    request.authContext = authContext;
    return authContext;
  }

  private normalizeOwner(owner: unknown) {
    if (Array.isArray(owner)) {
      return owner[0] ?? null;
    }

    return owner ?? null;
  }

  private serializeCustomer<T extends { owner?: unknown; owner_id: string | null }>(
    row: T,
  ) {
    const owner = this.normalizeOwner(row.owner) as
      | { id: string; name: string | null; phone: string | null }
      | null;

    return {
      ...row,
      owner,
      owner_name: owner?.name ?? null,
    };
  }

  private splitCustomerPayload<T extends { property?: CustomerPropertyPayload }>(
    payload: T,
  ) {
    const { property, ...customerPayload } = payload;
    return {
      customerPayload,
      propertyPayload: property,
    };
  }

  private async getAssignableTargetEmployee(
    ownerId: string,
  ) {
    const { data: targetEmployee, error: targetEmployeeError } = await SupabaseDB
      .getAdminClient()
      .from("employees")
      .select("id, name, department_id, status")
      .eq("id", ownerId)
      .maybeSingle();

    if (targetEmployeeError) {
      throw Errors.dbError("查询目标负责人失败", targetEmployeeError);
    }

    return targetEmployee;
  }

  private async getPrimaryCustomerPropertySummary(customerId: string) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("properties")
      .select(this.propertySummarySelect)
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询客户主房产失败", error);
    }

    return (data as PrimaryPropertySummary | null) ?? null;
  }

  private async getCustomerPropertySummaries(customerId: string) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("properties")
      .select(this.propertySummarySelect)
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false });

    if (error) {
      throw Errors.dbError("查询客户房产摘要失败", error);
    }

    return data || [];
  }

  private async upsertCustomerPrimaryProperty(
    customerId: string,
    propertyPayload: CustomerPropertyPayload | undefined,
  ) {
    if (!propertyPayload) {
      return this.getPrimaryCustomerPropertySummary(customerId);
    }

    const primaryProperty = await this.getPrimaryCustomerPropertySummary(customerId);

    if (primaryProperty?.id) {
      const { error } = await SupabaseDB.getAdminClient()
        .from("properties")
        .update(propertyPayload)
        .eq("id", primaryProperty.id);

      if (error) {
        throw Errors.dbError("更新客户主房产失败", error);
      }
    } else {
      const { error } = await SupabaseDB.getAdminClient()
        .from("properties")
        .insert({
          id: randomUUID(),
          customer_id: customerId,
          ...propertyPayload,
        });

      if (error) {
        throw Errors.dbError("创建客户主房产失败", error);
      }
    }

    return this.getPrimaryCustomerPropertySummary(customerId);
  }

  private async buildCustomerDetailResponse(
    customer: { owner?: unknown; owner_id: string | null; id: string },
    options?: {
      primaryProperty?: PrimaryPropertySummary | null;
      includeProperties?: boolean;
    },
  ) {
    const primaryProperty = options?.primaryProperty ?? await this.getPrimaryCustomerPropertySummary(
      customer.id,
    );
    const properties = options?.includeProperties
      ? await this.getCustomerPropertySummaries(customer.id)
      : undefined;

    return {
      ...this.serializeCustomer(customer),
      property_id: primaryProperty?.id ?? null,
      community: primaryProperty?.community ?? null,
      building_info: primaryProperty?.building_info ?? null,
      layout: primaryProperty?.layout ?? null,
      area: primaryProperty?.area ?? null,
      ...(options?.includeProperties
        ? {
          properties: properties || [],
          property_count: (properties || []).length,
        }
        : {}),
    };
  }

  private serializeFollowUp<T extends { employee?: unknown; employee_id: string | null }>(
    row: T,
  ) {
    const employee = this.normalizeOwner(row.employee) as
      | { id: string; name: string | null; phone: string | null; avatar?: string | null }
      | null;

    return {
      ...row,
      employee,
      employee_name: employee?.name ?? null,
    };
  }

  override list = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredAuthContext(request);
    const queryResult = CustomerListQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const { page, pageSize, status, keyword } = queryResult.data;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const visibleOwnerIds = await accessPolicyService.getVisibleCustomerOwnerIds(
      authContext,
      "customer.read",
    );

    let query = SupabaseDB.getAdminClient()
      .from("customers")
      .select(this.customerSelect, { count: "exact" })
      .order("created_at", { ascending: false });

    if (visibleOwnerIds !== null) {
      if (visibleOwnerIds.length === 0) {
        query = query.eq("id", "00000000-0000-0000-0000-000000000000");
      } else {
        query = query.in("owner_id", visibleOwnerIds);
      }
    }

    if (status) {
      query = query.eq("status", status);
    }

    const normalizedKeyword = keyword?.trim();
    if (normalizedKeyword) {
      query = query.or(
        `name.ilike.%${normalizedKeyword}%,phone.ilike.%${normalizedKeyword}%`,
      );
    }

    const { data, error, count } = await query.range(from, to);

    if (error) throw Errors.dbError("列表查询失败", error);
    return ResponseHandler.success({
      list: (((data || []) as unknown) as Array<{ owner?: unknown; owner_id: string | null }>).map((item) => this.serializeCustomer(item)),
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

    const { data, error } = await SupabaseDB.getAdminClient()
      .from("customers")
      .select(this.customerSelect)
      .eq("id", idVerify.data.id)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询客户失败", error);
    }

    if (!data) {
      throw Errors.badRequest("客户不存在");
    }

    const canAccess = await accessPolicyService.canAccessCustomer(
      authContext,
      (data as unknown) as { owner_id: string | null },
      "customer.read",
    );
    if (!canAccess) {
      throw Errors.forbidden();
    }

    return ResponseHandler.success(
      this.serializeCustomer((data as unknown) as { owner?: unknown; owner_id: string | null }),
    );
  };

  override create = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredAuthContext(request);
    const scope = accessPolicyService.assertPermission(authContext, "customer.create");

    if (!this.createSchema) {
      throw Errors.badRequest("缺少参数类型：createSchema");
    }

    const result = this.createSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const { customerPayload, propertyPayload } = this.splitCustomerPayload(result.data);
    const payload = {
      ...customerPayload,
      owner_id: customerPayload.owner_id ?? authContext.employeeId ?? null,
    };

    if (
      scope !== "all" &&
      payload.owner_id &&
      payload.owner_id !== authContext.employeeId
    ) {
      throw Errors.forbidden();
    }

    const { data, error } = await SupabaseDB.getAdminClient()
      .from("customers")
      .insert(payload)
      .select(this.customerSelect)
      .single();

    if (error) throw Errors.dbError("创建失败", error);
    const customer = (data as unknown) as { owner?: unknown; owner_id: string | null; id: string };
    const primaryProperty = await this.upsertCustomerPrimaryProperty(
      customer.id,
      propertyPayload,
    );
    return ResponseHandler.success(
      await this.buildCustomerDetailResponse(customer, {
        primaryProperty,
      }),
    );
  };

  override update = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredAuthContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    if (!this.updateSchema) {
      throw Errors.badRequest("缺少参数类型：updateSchema");
    }

    const result = this.updateSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const existing = await SupabaseDB.getAdminClient()
      .from("customers")
      .select("id, owner_id")
      .eq("id", idVerify.data.id)
      .maybeSingle();

    if (existing.error) {
      throw Errors.dbError("查询客户失败", existing.error);
    }

    if (!existing.data) {
      throw Errors.badRequest("客户不存在");
    }

    const { customerPayload, propertyPayload } = this.splitCustomerPayload(result.data);
    const payload = customerPayload;
    const hasPropertyUpdate = propertyPayload !== undefined;
    const hasOwnerUpdate = payload.owner_id !== undefined;
    const ownerChanged = hasOwnerUpdate && payload.owner_id !== existing.data.owner_id;
    const hasNonOwnerUpdates = Object.keys(payload).some((key) => key !== "owner_id");

    if (hasNonOwnerUpdates || hasPropertyUpdate) {
      const canAccess = await accessPolicyService.canAccessCustomer(
        authContext,
        (existing.data as unknown) as { owner_id: string | null },
        "customer.update",
      );
      if (!canAccess) {
        throw Errors.forbidden();
      }
    }

    if (ownerChanged) {
      if (!payload.owner_id) {
        throw Errors.badRequest("目标负责人不能为空");
      }

      const { data: targetEmployee, error: targetEmployeeError } = await SupabaseDB
        .getAdminClient()
        .from("employees")
        .select("id, department_id, status")
        .eq("id", payload.owner_id)
        .maybeSingle();

      if (targetEmployeeError) {
        throw Errors.dbError("查询目标负责人失败", targetEmployeeError);
      }

      if (!targetEmployee) {
        throw Errors.badRequest("目标负责人不存在或不可用");
      }

      const canAssign = await accessPolicyService.canAssignCustomerOwner(
        authContext,
        (existing.data as unknown) as { owner_id: string | null },
        targetEmployee,
      );
      if (!canAssign) {
        throw Errors.forbidden();
      }
    }

    let customer: { owner?: unknown; owner_id: string | null; id: string } | null = null;

    if (Object.keys(payload).length > 0) {
      const { data, error } = await SupabaseDB.getAdminClient()
        .from("customers")
        .update(payload)
        .eq("id", idVerify.data.id)
        .select(this.customerSelect)
        .single();

      if (error) throw Errors.dbError("更新失败", error);
      customer = (data as unknown) as { owner?: unknown; owner_id: string | null; id: string };
    } else {
      const current = await SupabaseDB.getAdminClient()
        .from("customers")
        .select(this.customerSelect)
        .eq("id", idVerify.data.id)
        .maybeSingle();

      if (current.error) throw Errors.dbError("查询客户失败", current.error);
      if (!current.data) throw Errors.badRequest("客户不存在");
      customer = (current.data as unknown) as { owner?: unknown; owner_id: string | null; id: string };
    }

    const primaryProperty = await this.upsertCustomerPrimaryProperty(
      customer.id,
      propertyPayload,
    );
    return ResponseHandler.success(
      await this.buildCustomerDetailResponse(customer, {
        primaryProperty,
      }),
    );
  };

  @Post("/customers/assign-owner/batch")
  async batchAssignOwner(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredAuthContext(request);
    if (!accessPolicyService.hasPermission(authContext, "customer.assign_owner")) {
      throw Errors.business(403, "无权批量分配客户负责人", "FORBIDDEN");
    }

    const result = BatchAssignCustomerOwnerSchema.safeParse(request.body);
    if (!result.success) {
      throw Errors.fromZod(result.error);
    }

    const payload: BatchAssignCustomerOwnerInput = result.data;
    const targetEmployee = await this.getAssignableTargetEmployee(payload.owner_id);

    if (!targetEmployee) {
      throw Errors.badRequest("目标负责人不存在或不可用");
    }

    if (targetEmployee.status !== "active") {
      throw Errors.badRequest("目标负责人不存在或不可用");
    }

    if (!accessPolicyService.canAssignCustomerOwnerTarget(authContext, targetEmployee)) {
      throw Errors.badRequest("目标负责人不在你的可分配范围内");
    }

    const customerIds = Array.from(new Set(payload.customer_ids));
    const { data: customers, error: customerQueryError } = await SupabaseDB
      .getAdminClient()
      .from("customers")
      .select("id, owner_id")
      .in("id", customerIds);

    if (customerQueryError) {
      throw Errors.dbError("查询客户失败", customerQueryError);
    }

    const customerMap = new Map(
      (((customers || []) as Array<{ id: string; owner_id: string | null }>)).map((item) => [
        item.id,
        item,
      ]),
    );

    const failedItems: Array<{
      customer_id: string;
      reason:
        | "out_of_scope"
        | "customer_not_found"
        | "customer_already_assigned"
        | "target_owner_not_found"
        | "target_owner_inactive"
        | "target_owner_out_of_scope";
      message: string;
    }> = [];
    const successCustomerIds: string[] = [];

    for (const customerId of customerIds) {
      const customer = customerMap.get(customerId);
      if (!customer) {
        failedItems.push({
          customer_id: customerId,
          reason: "customer_not_found",
          message: "客户不存在",
        });
        continue;
      }

      const canAssign = await accessPolicyService.canAssignCustomerOwner(
        authContext,
        customer,
        targetEmployee,
      );
      if (!canAssign) {
        failedItems.push({
          customer_id: customerId,
          reason: "out_of_scope",
          message: "当前客户不在你的可分配范围内",
        });
        continue;
      }

      if (
        payload.mode === "only_unassigned" &&
        customer.owner_id &&
        customer.owner_id !== payload.owner_id
      ) {
        failedItems.push({
          customer_id: customerId,
          reason: "customer_already_assigned",
          message: "当前客户已分配负责人",
        });
        continue;
      }

      if (customer.owner_id === payload.owner_id) {
        failedItems.push({
          customer_id: customerId,
          reason: "customer_already_assigned",
          message: "当前客户已分配给该负责人",
        });
        continue;
      }

      successCustomerIds.push(customerId);
    }

    if (successCustomerIds.length > 0) {
      const { error: updateError } = await SupabaseDB.getAdminClient()
        .from("customers")
        .update({ owner_id: payload.owner_id })
        .in("id", successCustomerIds);

      if (updateError) {
        throw Errors.dbError("批量分配负责人失败", updateError);
      }
    }

    return ResponseHandler.success({
      success_count: successCustomerIds.length,
      failed_count: failedItems.length,
      target_owner: {
        id: targetEmployee.id,
        name: targetEmployee.name ?? null,
      },
      failed_items: failedItems,
    });
  }

  @Get("/customers/:id/detail")
  async getCustomerById(
    request: FastifyRequest<{ Params: { id: string } }>,
  ) {
    const authContext = await this.getRequiredAuthContext(request);
    const { id } = request.params; // ← 这里拿到 UUID
    const { data, error } = await SupabaseDB.getAdminClient().from("customers").select(this.customerSelect).eq(
      "id",
      id,
    ).single();

    if (error) {
      throw Errors.dbError("get customers data by id error", error);
    }

    const canAccess = await accessPolicyService.canAccessCustomer(
      authContext,
      (data as unknown) as { owner_id: string | null },
      "customer.read",
    );
    if (!canAccess) {
      throw Errors.forbidden();
    }

    return ResponseHandler.success(
      await this.buildCustomerDetailResponse(
        (data as unknown) as { owner?: unknown; owner_id: string | null; id: string },
        {
          includeProperties: true,
        },
      ),
    );
  }

  @Get("/customers/:id/follow_ups")
  async getCustomerFollowUpById(
    request: FastifyRequest<{ Params: { id: string }; Querystring: { page?: string; pageSize?: string } }>,
  ) {
    const authContext = await this.getRequiredAuthContext(request);
    const { id } = request.params; // ← 这里拿到 UUID
    const queryResult = PaginationQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      throw Errors.fromZod(queryResult.error);
    }

    const customer = await SupabaseDB.getAdminClient()
      .from("customers")
      .select("id, owner_id")
      .eq("id", id)
      .maybeSingle();

    if (customer.error) {
      throw Errors.dbError("查询客户失败", customer.error);
    }

    if (!customer.data) {
      throw Errors.badRequest("客户不存在");
    }

    const canAccess = await accessPolicyService.canAccessCustomer(
      authContext,
      (customer.data as unknown) as { owner_id: string | null },
      "customer.read",
    );
    if (!canAccess) {
      throw Errors.forbidden();
    }

    const { page, pageSize } = queryResult.data;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await SupabaseDB.getAdminClient().from("customer_follow_ups")
      .select(this.followUpSelect, { count: "exact" }).eq(
        "customer_id",
        id,
      )
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      throw Errors.dbError("get customers data by id error", error);
    }

    return ResponseHandler.success({
      list: await customerFollowUpCommentService.enrichFollowUpsWithCommentSummaries(
        authContext,
        customer.data,
        (((data || []) as unknown) as Array<{
          id: string;
          employee?: unknown;
          employee_id: string | null;
        }>).map((item) => this.serializeFollowUp(item)),
      ),
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: count ? Math.ceil(count / pageSize) : 0,
      },
    });
  }

  @Post("/customers/:id/follow_ups")
  async createCustomerFollowUpById(
    request: FastifyRequest<{
      Params: { id: string };
      Body: FollowUpInsert;
    }>,
  ) {
    const authContext = await this.getRequiredAuthContext(request);
    const { id } = request.params;
    const customer = await SupabaseDB.getAdminClient()
      .from("customers")
      .select("id, owner_id")
      .eq("id", id)
      .maybeSingle();

    if (customer.error) {
      throw Errors.dbError("查询客户失败", customer.error);
    }

    if (!customer.data) {
      throw Errors.badRequest("客户不存在");
    }

    const canAccess = await accessPolicyService.canAccessCustomer(
      authContext,
      customer.data,
      "customer.update",
    );
    if (!canAccess) {
      throw Errors.forbidden();
    }

    const followUpData = request.body;
    const followUpPayload = {
      ...followUpData,
      employee_id: followUpData.employee_id ?? authContext.employeeId ?? null,
      customer_id: id,
    };

    const scope = accessPolicyService.getScope(authContext, "customer.update");
    if (
      scope !== "all" &&
      followUpPayload.employee_id &&
      followUpPayload.employee_id !== authContext.employeeId
    ) {
      throw Errors.forbidden();
    }

    const { data, error } = await SupabaseDB.getAdminClient().from("customer_follow_ups")
      .insert({
        ...followUpPayload,
      })
      .select(this.followUpSelect)
      .single();

    if (error) {
      throw Errors.dbError("create follow up data error", error);
    }
    return ResponseHandler.success(
      this.serializeFollowUp((data as unknown) as {
        employee?: unknown;
        employee_id: string | null;
      }),
    );
  }
}

export default new CustomerController(); // 导出实例
