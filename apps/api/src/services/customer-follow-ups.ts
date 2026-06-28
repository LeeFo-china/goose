import { Errors } from "@/errors/error-factory";
import {
  customerFollowUpRepository,
  type CustomerFollowUpAccessCustomer,
  type CustomerFollowUpRow,
} from "@/repositories/customer-follow-ups";
import type { FollowUpInsert } from "@/schema/customer";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import { customerFollowUpCommentService } from "@/services/customer-follow-up-comments";
import { getAsiaShanghaiTodayRange } from "@/utils/date-ranges";

export type CustomerFollowUpSummary = CustomerFollowUpRow & {
  customer_id: string;
};

class CustomerFollowUpService {
  private normalizeEmployee(employee: unknown) {
    if (Array.isArray(employee)) {
      return employee[0] ?? null;
    }

    return employee ?? null;
  }

  private serializeFollowUp<T extends { employee?: unknown; employee_id: string | null }>(
    row: T,
  ) {
    const employee = this.normalizeEmployee(row.employee) as
      | { id: string; name: string | null; phone: string | null; avatar?: string | null }
      | null;

    return {
      ...row,
      employee,
      employee_name: employee?.name ?? null,
    };
  }

  private async getAccessibleCustomer(
    authContext: AuthContext,
    customerId: string,
    permissionCode: "customer.read" | "customer.update",
  ) {
    const tenantId = accessPolicyService.assertTenantContext(authContext);
    const customer = await customerFollowUpRepository.findCustomerAccess({
      customerId,
      tenantId,
    });

    if (!customer) {
      throw Errors.badRequest("客户不存在");
    }

    const canAccess = await accessPolicyService.canAccessCustomer(
      authContext,
      customer,
      permissionCode,
    );
    if (!canAccess) {
      throw Errors.forbidden();
    }

    return customer;
  }

  async listCustomerFollowUps(input: {
    authContext: AuthContext;
    customerId: string;
    page: number;
    pageSize: number;
  }) {
    const customer = await this.getAccessibleCustomer(
      input.authContext,
      input.customerId,
      "customer.read",
    );
    const from = (input.page - 1) * input.pageSize;
    const to = from + input.pageSize - 1;
    const result = await customerFollowUpRepository.listByCustomer({
      customerId: input.customerId,
      from,
      to,
    });

    return {
      list: await this.enrichFollowUpsWithComments(
        input.authContext,
        customer,
        result.list,
      ),
      pagination: {
        page: input.page,
        pageSize: input.pageSize,
        total: result.count,
        totalPages: result.count ? Math.ceil(result.count / input.pageSize) : 0,
      },
    };
  }

  async listAccessibleCustomerFollowUps(input: {
    authContext: AuthContext;
    customer: CustomerFollowUpAccessCustomer;
    page: number;
    pageSize: number;
  }) {
    const from = (input.page - 1) * input.pageSize;
    const to = from + input.pageSize - 1;
    const result = await customerFollowUpRepository.listByCustomer({
      customerId: input.customer.id,
      from,
      to,
    });

    return {
      list: await this.enrichFollowUpsWithComments(
        input.authContext,
        input.customer,
        result.list,
      ),
      pagination: {
        page: input.page,
        pageSize: input.pageSize,
        total: result.count,
        totalPages: result.count ? Math.ceil(result.count / input.pageSize) : 0,
      },
    };
  }

  async createCustomerFollowUp(input: {
    authContext: AuthContext;
    customerId: string;
    payload: FollowUpInsert;
  }) {
    await this.getAccessibleCustomer(
      input.authContext,
      input.customerId,
      "customer.update",
    );

    const followUpPayload = {
      ...input.payload,
      employee_id: input.payload.employee_id ?? input.authContext.employeeId ?? null,
      customer_id: input.customerId,
    };

    const scope = accessPolicyService.getScope(input.authContext, "customer.update");
    if (
      followUpPayload.employee_id &&
      followUpPayload.employee_id !== input.authContext.employeeId
    ) {
      if (scope !== "all") {
        throw Errors.forbidden();
      }

      const tenantId = accessPolicyService.assertTenantContext(input.authContext);
      const targetEmployee = await customerFollowUpRepository.findEmployee({
        employeeId: followUpPayload.employee_id,
        tenantId,
      });
      if (!targetEmployee || targetEmployee.status !== "active") {
        throw Errors.badRequest("跟进员工不存在或不可用");
      }
    }

    return this.serializeFollowUp(
      await customerFollowUpRepository.create(followUpPayload),
    );
  }

  async getLatestFollowUpMap(input: {
    customerIds: string[];
    tenantId: string;
  }) {
    const uniqueCustomerIds = Array.from(new Set(input.customerIds.filter(Boolean)));
    if (uniqueCustomerIds.length === 0) {
      return new Map<string, CustomerFollowUpSummary>();
    }

    const tenantCustomerIds = await customerFollowUpRepository.listTenantCustomerIds({
      customerIds: uniqueCustomerIds,
      tenantId: input.tenantId,
    });
    if (tenantCustomerIds.length === 0) {
      return new Map<string, CustomerFollowUpSummary>();
    }

    const rows = await customerFollowUpRepository.listLatestByCustomerIds(
      tenantCustomerIds,
    );
    const summaryMap = new Map<string, CustomerFollowUpSummary>();
    for (const item of rows) {
      if (!item.customer_id || summaryMap.has(item.customer_id)) {
        continue;
      }

      const summary = item as CustomerFollowUpSummary;
      summaryMap.set(summary.customer_id, summary);
    }

    return summaryMap;
  }

  async getTodayWorkCustomerIds(tenantId: string) {
    const { startIso, endIso } = getAsiaShanghaiTodayRange();
    const [
      createdCustomerIds,
      updatedCustomerIds,
      createdFollowUpCustomerIds,
      plannedFollowUpCustomerIds,
    ] = await Promise.all([
      customerFollowUpRepository.listCustomerIdsByDateField({
        tenantId,
        field: "created_at",
        startIso,
        endIso,
      }),
      customerFollowUpRepository.listCustomerIdsByDateField({
        tenantId,
        field: "updated_at",
        startIso,
        endIso,
      }),
      customerFollowUpRepository.listFollowUpCustomerIdsByDateField({
        field: "created_at",
        startIso,
        endIso,
      }),
      customerFollowUpRepository.listFollowUpCustomerIdsByDateField({
        field: "next_follow_at",
        startIso,
        endIso,
      }),
    ]);

    const tenantFollowUpCustomerIds = await customerFollowUpRepository
      .listTenantCustomerIds({
        customerIds: [
          ...createdFollowUpCustomerIds,
          ...plannedFollowUpCustomerIds,
        ],
        tenantId,
      });

    return Array.from(
      new Set([
        ...createdCustomerIds,
        ...updatedCustomerIds,
        ...tenantFollowUpCustomerIds,
      ]),
    );
  }

  private async enrichFollowUpsWithComments(
    authContext: AuthContext,
    customer: CustomerFollowUpAccessCustomer,
    followUps: CustomerFollowUpRow[],
  ) {
    return customerFollowUpCommentService.enrichFollowUpsWithCommentSummaries(
      authContext,
      customer,
      followUps.map((item) => this.serializeFollowUp(item)),
    );
  }
}

export const customerFollowUpService = new CustomerFollowUpService();
