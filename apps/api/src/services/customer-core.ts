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

const CUSTOMER_LIST_CACHE_TTL_MS = 10_000;

type CustomerListResult = {
  rows: CustomerCoreRow[];
  total: number;
  followUpMap: Awaited<ReturnType<typeof customerFollowUpService.getLatestFollowUpMap>>;
  page: number;
  pageSize: number;
};

class CustomerCoreService {
  private listCache = new Map<string, {
    expiresAt: number;
    value: CustomerListResult;
  }>();
  private listInFlight = new Map<string, Promise<CustomerListResult>>();

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

  private buildListCacheKey(authContext: AuthContext, query: CustomerListQueryType) {
    return JSON.stringify({
      tenantId: authContext.tenantId,
      authUserId: authContext.authUserId,
      employeeId: authContext.employeeId,
      page: query.page,
      pageSize: query.pageSize,
      status: query.status ?? null,
      source: query.source ?? null,
      customer_origin: query.customer_origin ?? null,
      keyword: query.keyword?.trim() ?? null,
      follow: query.follow ?? null,
      work_scope: query.work_scope ?? null,
      mode: query.mode ?? null,
      roleCodes: authContext.roleCodes,
      permissions: authContext.permissions,
    });
  }

  private getListCache(cacheKey: string) {
    const cached = this.listCache.get(cacheKey);
    if (!cached) {
      return null;
    }

    if (cached.expiresAt <= Date.now()) {
      this.listCache.delete(cacheKey);
      this.listInFlight.delete(cacheKey);
      return null;
    }

    return cached.value;
  }

  private setListCache(cacheKey: string, value: CustomerListResult) {
    const now = Date.now();
    if (this.listCache.size >= 500) {
      for (const [key, item] of this.listCache.entries()) {
        if (item.expiresAt <= now) {
          this.listCache.delete(key);
        }
      }

      if (this.listCache.size >= 500) {
        this.listCache.clear();
      }
    }

    this.listCache.set(cacheKey, {
      expiresAt: now + CUSTOMER_LIST_CACHE_TTL_MS,
      value,
    });
  }

  async listCustomers(input: {
    authContext: AuthContext;
    query: CustomerListQueryType;
  }): Promise<CustomerListResult> {
    const cacheKey = this.buildListCacheKey(input.authContext, input.query);
    const cached = this.getListCache(cacheKey);
    if (cached) {
      return cached;
    }

    const inFlight = this.listInFlight.get(cacheKey);
    if (inFlight) {
      return inFlight;
    }

    const request = this.loadCustomers(input)
      .then((result) => {
        this.setListCache(cacheKey, result);
        return result;
      })
      .finally(() => {
        if (this.listInFlight.get(cacheKey) === request) {
          this.listInFlight.delete(cacheKey);
        }
      });
    this.listInFlight.set(cacheKey, request);
    return request;
  }

  private async loadCustomers(input: {
    authContext: AuthContext;
    query: CustomerListQueryType;
  }): Promise<CustomerListResult> {
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
      mode,
    } = input.query;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const normalizedKeyword = keyword?.trim();
    const [visibleOwnerIds, todayCustomerIds] = await Promise.all([
      accessPolicyService.getVisibleCustomerOwnerIds(
        input.authContext,
        "customer.read",
      ),
      workScope === "today"
        ? customerFollowUpService.getTodayWorkCustomerIds(tenantId)
        : Promise.resolve(null),
    ]);
    const filters = {
      tenantId,
      visibleOwnerIds,
      status,
      source,
      customerOrigin,
      keyword: normalizedKeyword,
      customerIds: todayCustomerIds,
    };

    if (mode === "home" && !follow) {
      const rowsWithLookahead = await customerCoreRepository.listHomeRows({
        filters,
        from,
        to: from + pageSize,
      });
      const pagedRows = rowsWithLookahead.slice(0, pageSize);
      const hasMore = rowsWithLookahead.length > pageSize;

      return {
        rows: pagedRows,
        total: from + pagedRows.length + (hasMore ? 1 : 0),
        followUpMap: new Map(),
        page,
        pageSize,
      };
    }

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

    const [total, rows] = await Promise.all([
      customerCoreRepository.count(filters),
      customerCoreRepository.listRows({ filters, from, to }),
    ]);
    const pagedRows = from >= total ? [] : rows;
    const followUpMap = await customerFollowUpService.getLatestFollowUpMap({
      customerIds: pagedRows.map((item) => item.id),
      tenantId,
    });

    return {
      rows: pagedRows,
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
