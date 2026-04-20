import type { FastifyReply, FastifyRequest } from "fastify";
import { SupabaseDB } from "@/utils/supabase/index";
import { Errors } from "@/errors/error-factory";
import {
  CreateCustomerSchema,
  UpdateCustomerSchema,
} from "@/schema/customer";
import { BaseController } from "@/controllers/BaseController";
import { Get, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FollowUpInsert } from "@/schema/customer";
import { PaginationQuerySchema } from "@/schema/request";
import { authorizationService } from "@/services/authorization";
import { accessPolicyService } from "@/services/access-policy";

// 继承基类
class CustomerController extends BaseController<
  typeof CreateCustomerSchema,
  typeof UpdateCustomerSchema
> {
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
    const queryResult = this.paginationQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const { page, pageSize } = queryResult.data;
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

    const payload = {
      ...result.data,
      owner_id: result.data.owner_id ?? authContext.employeeId ?? null,
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
    return ResponseHandler.success(
      this.serializeCustomer((data as unknown) as { owner?: unknown; owner_id: string | null }),
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

    const payload = result.data;
    const hasOwnerUpdate = payload.owner_id !== undefined;
    const ownerChanged = hasOwnerUpdate && payload.owner_id !== existing.data.owner_id;
    const hasNonOwnerUpdates = Object.keys(payload).some((key) => key !== "owner_id");

    if (hasNonOwnerUpdates) {
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

    const { data, error } = await SupabaseDB.getAdminClient()
      .from("customers")
      .update(payload)
      .eq("id", idVerify.data.id)
      .select(this.customerSelect)
      .single();

    if (error) throw Errors.dbError("更新失败", error);
    return ResponseHandler.success(
      this.serializeCustomer((data as unknown) as { owner?: unknown; owner_id: string | null }),
    );
  };

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
      this.serializeCustomer((data as unknown) as { owner?: unknown; owner_id: string | null }),
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
      list: (((data || []) as unknown) as Array<{
        employee?: unknown;
        employee_id: string | null;
      }>).map((item) => this.serializeFollowUp(item)),
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
