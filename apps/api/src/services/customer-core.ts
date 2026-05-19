import { Errors } from "@/errors/error-factory";
import {
  customerCoreRepository,
  type CustomerCoreAccessRow,
  type CustomerCoreRow,
} from "@/repositories/customer-core";
import type { CustomerListQueryType } from "@/schema/customer";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import { customerFollowUpService } from "@/services/customer-follow-ups";

class CustomerCoreService {
  getFollowUpState(nextFollowAt: string | null | undefined) {
    if (!nextFollowAt) {
      return "none";
    }

    const nextTime = new Date(nextFollowAt).getTime();
    if (Number.isNaN(nextTime)) {
      return "none";
    }

    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ).getTime();

    if (nextTime < todayStart) {
      return "overdue";
    }

    if (nextTime <= now.getTime()) {
      return "due";
    }

    return "upcoming";
  }

  private matchesFollowFilter(
    summary: Awaited<ReturnType<typeof customerFollowUpService.getLatestFollowUpMap>> extends Map<string, infer T>
      ? T | undefined
      : never,
    followFilter: "due" | "overdue",
  ) {
    const state = this.getFollowUpState(summary?.next_follow_at);
    if (followFilter === "overdue") {
      return state === "overdue";
    }

    return state === "due" || state === "overdue";
  }

  async listCustomers(input: {
    authContext: AuthContext;
    query: CustomerListQueryType;
  }) {
    const tenantId = accessPolicyService.assertTenantContext(input.authContext);
    const {
      page,
      pageSize,
      status,
      source,
      customer_origin: customerOrigin,
      keyword,
      follow,
      work_scope: workScope,
    } = input.query;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const visibleOwnerIds = await accessPolicyService.getVisibleCustomerOwnerIds(
      input.authContext,
      "customer.read",
    );
    const normalizedKeyword = keyword?.trim();
    const todayCustomerIds = workScope === "today"
      ? await customerFollowUpService.getTodayWorkCustomerIds(tenantId)
      : null;
    const filters = {
      tenantId,
      visibleOwnerIds,
      status,
      source,
      customerOrigin,
      keyword: normalizedKeyword,
      customerIds: todayCustomerIds,
    };

    if (follow) {
      const customerIds = await customerCoreRepository.listIds(filters);
      const followUpMap = await customerFollowUpService.getLatestFollowUpMap({
        customerIds,
        tenantId,
      });
      const filteredCustomerIds = customerIds.filter((id) =>
        this.matchesFollowFilter(followUpMap.get(id), follow)
      );
      const total = filteredCustomerIds.length;
      const pageCustomerIds = filteredCustomerIds.slice(from, to + 1);
      const rows = await customerCoreRepository.listRowsByIds({
        customerIds: pageCustomerIds,
        tenantId,
      });

      return {
        rows,
        total,
        followUpMap,
        page,
        pageSize,
      };
    }

    const total = await customerCoreRepository.count(filters);
    const rows = from >= total
      ? []
      : await customerCoreRepository.listRows({ filters, from, to });
    const followUpMap = await customerFollowUpService.getLatestFollowUpMap({
      customerIds: rows.map((item) => item.id),
      tenantId,
    });

    return {
      rows,
      total,
      followUpMap,
      page,
      pageSize,
    };
  }

  async createCustomer(payload: Record<string, unknown>) {
    return customerCoreRepository.create(payload);
  }

  async getRequiredCustomerAccess(input: {
    authContext: AuthContext;
    customerId: string;
    message?: string;
  }) {
    const tenantId = accessPolicyService.assertTenantContext(input.authContext);
    const customer = await customerCoreRepository.findAccessById({
      customerId: input.customerId,
      tenantId,
    });

    if (!customer) {
      throw Errors.notFound(input.message ?? "客户不存在");
    }

    return customer;
  }

  async getRequiredCustomerForUpdate(input: {
    authContext: AuthContext;
    customerId: string;
  }) {
    const customer = await this.getRequiredCustomerAccess(input);
    return customer;
  }

  async updateCustomer(input: {
    authContext: AuthContext;
    customerId: string;
    payload: Record<string, unknown>;
  }) {
    const tenantId = accessPolicyService.assertTenantContext(input.authContext);
    if (Object.keys(input.payload).length === 0) {
      const customer = await customerCoreRepository.findById({
        customerId: input.customerId,
        tenantId,
      });

      if (!customer) {
        throw Errors.badRequest("客户不存在");
      }

      return customer;
    }

    return customerCoreRepository.updateById({
      customerId: input.customerId,
      tenantId,
      payload: input.payload,
    });
  }

  async getCustomerDetail(input: {
    authContext: AuthContext;
    customerId: string;
    notFoundAs?: "bad_request" | "not_found";
  }) {
    const tenantId = accessPolicyService.assertTenantContext(input.authContext);
    const customer = await customerCoreRepository.findById({
      customerId: input.customerId,
      tenantId,
    });

    if (!customer) {
      this.throwCustomerNotFound(input.notFoundAs);
    }

    await this.assertCanAccessCustomer(
      input.authContext,
      customer!,
      "customer.read",
    );

    return customer!;
  }

  async invalidateCustomer(input: {
    authContext: AuthContext;
    customerId: string;
  }) {
    const tenantId = accessPolicyService.assertTenantContext(input.authContext);
    const customer = await customerCoreRepository.findAccessById({
      customerId: input.customerId,
      tenantId,
    });

    if (!customer) {
      throw Errors.badRequest("客户不存在");
    }

    await this.assertCanAccessCustomer(
      input.authContext,
      customer,
      "customer.update",
    );

    return customerCoreRepository.markInvalid({
      customerId: input.customerId,
      tenantId,
    });
  }

  private async assertCanAccessCustomer(
    authContext: AuthContext,
    customer: CustomerCoreAccessRow,
    permissionCode: "customer.read" | "customer.update",
  ) {
    const canAccess = await accessPolicyService.canAccessCustomer(
      authContext,
      customer,
      permissionCode,
    );
    if (!canAccess) {
      throw Errors.forbidden();
    }
  }

  private throwCustomerNotFound(kind: "bad_request" | "not_found" = "bad_request"): never {
    if (kind === "not_found") {
      throw Errors.notFound("客户不存在");
    }

    throw Errors.badRequest("客户不存在");
  }
}

export const customerCoreService = new CustomerCoreService();
export type { CustomerCoreAccessRow, CustomerCoreRow };
