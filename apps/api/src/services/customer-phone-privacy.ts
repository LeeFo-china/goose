import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import { permissionRepository } from "@/repositories/permissions";
import type { AuthContext, EffectivePermission } from "@/services/authorization";
import { SupabaseDB } from "@/utils/supabase";
import type { FastifyRequest } from "fastify";

export type CustomerPhoneCapabilityCode =
  | "customer.phone.view"
  | "customer.phone.call"
  | "customer.phone.copy";

export type CustomerPhoneAction = "reveal" | "call" | "copy";

export type CustomerPhoneTarget = {
  id: string;
  owner_id: string | null;
  tenant_id?: string | null;
  phone?: string | null;
};

export type CustomerPhonePrivacyContext = {
  authContext: AuthContext;
  departmentEmployeeIds: string[];
};

const actionConfig: Record<
  CustomerPhoneAction,
  {
    permissionCode: CustomerPhoneCapabilityCode;
    deniedCode: string;
    deniedMessage: string;
    expiresIn?: number;
  }
> = {
  reveal: {
    permissionCode: "customer.phone.view",
    deniedCode: ErrorCodes.CUSTOMER_PHONE_VIEW_DENIED,
    deniedMessage: "无权查看客户手机号",
    expiresIn: 30,
  },
  call: {
    permissionCode: "customer.phone.call",
    deniedCode: ErrorCodes.CUSTOMER_PHONE_CALL_DENIED,
    deniedMessage: "无权拨打客户手机号",
  },
  copy: {
    permissionCode: "customer.phone.copy",
    deniedCode: ErrorCodes.CUSTOMER_PHONE_COPY_DENIED,
    deniedMessage: "无权复制客户手机号",
  },
};

class CustomerPhonePrivacyService {
  maskPhone(phone: string | null | undefined) {
    const value = phone?.trim();
    if (!value) {
      return null;
    }

    if (value.length === 11) {
      return `${value.slice(0, 3)}****${value.slice(-4)}`;
    }

    if (value.length <= 4) {
      return value;
    }

    return `${value.slice(0, 2)}****${value.slice(-2)}`;
  }

  async createPrivacyContext(
    authContext: AuthContext,
  ): Promise<CustomerPhonePrivacyContext> {
    const scopes = [
      this.getPermissionScope(authContext, "customer.read"),
      this.getPermissionScope(authContext, "customer.phone.view"),
      this.getPermissionScope(authContext, "customer.phone.call"),
      this.getPermissionScope(authContext, "customer.phone.copy"),
    ];

    const needsDepartmentScope = scopes.includes("department");
    const departmentEmployeeIds =
      needsDepartmentScope && authContext.tenantDepartmentId
        ? await permissionRepository.listEmployeeIdsByDepartmentId(
          authContext.tenantDepartmentId,
          authContext.tenantId,
        )
        : [];

    return {
      authContext,
      departmentEmployeeIds,
    };
  }

  serializeCustomerPhoneFields(
    context: CustomerPhonePrivacyContext,
    customer: CustomerPhoneTarget,
  ) {
    const phone = customer.phone ?? null;
    const canViewPhone = this.canUsePermission(
      context,
      customer,
      "customer.phone.view",
    );
    const canCallPhone = this.canUsePermission(
      context,
      customer,
      "customer.phone.call",
    );
    const canCopyPhone = this.canUsePermission(
      context,
      customer,
      "customer.phone.copy",
    );

    return {
      phone: canViewPhone ? phone : null,
      phone_masked: this.maskPhone(phone),
      can_view_phone: canViewPhone,
      can_call_phone: canCallPhone,
      can_copy_phone: canCopyPhone,
    };
  }

  serializeMaskedPhoneOnly(phone: string | null | undefined) {
    return {
      phone: null,
      phone_masked: this.maskPhone(phone),
    };
  }

  private getPermissionScope(
    authContext: AuthContext,
    permissionCode: string,
  ) {
    return authContext.permissions.find((item) => item.code === permissionCode)
      ?.scope ?? null;
  }

  private canUsePermission(
    context: CustomerPhonePrivacyContext,
    customer: CustomerPhoneTarget,
    permissionCode: CustomerPhoneCapabilityCode,
  ) {
    const readScope = this.getPermissionScope(context.authContext, "customer.read");
    const permissionScope = this.getPermissionScope(
      context.authContext,
      permissionCode,
    );

    return (
      this.scopeCoversCustomer(context, readScope, customer) &&
      this.scopeCoversCustomer(context, permissionScope, customer)
    );
  }

  private scopeCoversCustomer(
    context: CustomerPhonePrivacyContext,
    scope: EffectivePermission["scope"] | null,
    customer: CustomerPhoneTarget,
  ) {
    const employeeId = context.authContext.employeeId;
    if (!scope || !employeeId) {
      return false;
    }

    if (scope === "all") {
      return true;
    }

    if (!customer.owner_id) {
      return false;
    }

    if (scope === "department") {
      return context.departmentEmployeeIds.includes(customer.owner_id);
    }

    return customer.owner_id === employeeId;
  }

  async handlePhoneAction(input: {
    action: CustomerPhoneAction;
    authContext: AuthContext;
    customerId: string;
    scene?: string | null;
    reason?: string | null;
    request: FastifyRequest;
  }) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("customers")
      .select("id, owner_id, tenant_id, phone")
      .eq("id", input.customerId)
      .eq("tenant_id", input.authContext.tenantId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询客户手机号失败", error);
    }

    if (!data) {
      throw Errors.business(404, "客户不存在", ErrorCodes.CUSTOMER_NOT_FOUND);
    }

    const customer = data as CustomerPhoneTarget;
    const context = await this.createPrivacyContext(input.authContext);
    const readScope = this.getPermissionScope(input.authContext, "customer.read");
    if (!this.scopeCoversCustomer(context, readScope, customer)) {
      throw Errors.business(
        403,
        "无权访问该客户",
        ErrorCodes.CUSTOMER_ACCESS_DENIED,
      );
    }

    const config = actionConfig[input.action];
    if (!this.canUsePermission(context, customer, config.permissionCode)) {
      throw Errors.business(403, config.deniedMessage, config.deniedCode);
    }

    const phone = customer.phone?.trim();
    if (!phone) {
      throw Errors.business(
        404,
        "当前客户暂无手机号",
        ErrorCodes.CUSTOMER_PHONE_NOT_FOUND,
      );
    }

    const permissionScope = this.getPermissionScope(
      input.authContext,
      config.permissionCode,
    );
    const phoneMasked = this.maskPhone(phone);
    const auditId = await this.createAuditLog({
      customerId: customer.id,
      employeeId: input.authContext.employeeId,
      authUserId: input.authContext.authUserId,
      action: input.action,
      scene: input.scene,
      reason: input.reason,
      phoneMasked,
      permissionCode: config.permissionCode,
      permissionScope,
      request: input.request,
    });

    return {
      phone,
      phone_masked: phoneMasked,
      ...(config.expiresIn ? { expires_in: config.expiresIn } : {}),
      audit_id: auditId,
    };
  }

  private async createAuditLog(input: {
    customerId: string;
    employeeId: string | null;
    authUserId: string;
    action: CustomerPhoneAction;
    scene?: string | null;
    reason?: string | null;
    phoneMasked: string | null;
    permissionCode: string;
    permissionScope: string | null;
    request: FastifyRequest;
  }) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("customer_phone_access_logs")
      .insert({
        customer_id: input.customerId,
        employee_id: input.employeeId,
        auth_user_id: input.authUserId,
        action: input.action,
        scene: input.scene ?? null,
        reason: input.reason ?? null,
        phone_masked: input.phoneMasked,
        permission_code: input.permissionCode,
        permission_scope: input.permissionScope,
        ip_address: input.request.ip,
        user_agent: input.request.headers["user-agent"] ?? null,
        openid: input.request.user?.openid ?? null,
        request_id: input.request.id,
      })
      .select("id")
      .single();

    if (error) {
      throw Errors.dbError("记录客户手机号访问日志失败", error);
    }

    return (data as { id: string }).id;
  }
}

export const customerPhonePrivacyService = new CustomerPhonePrivacyService();
