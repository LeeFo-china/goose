import {
  customerCoreRepository,
} from "@/repositories/customer-core";
import type {
  CustomerListQueryType,
} from "@/schema/customer";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import { customerFollowUpService } from "@/services/customer-follow-ups";
import type { CustomerListResult, LatestFollowUpSummary } from "./types";

const CUSTOMER_LIST_CACHE_TTL_MS = 60_000;

export class CustomerListManager {
  private listCache = new Map<string, {
    expiresAt: number;
    value: CustomerListResult;
  }>();
  private listInFlight = new Map<string, Promise<CustomerListResult>>();

  getFollowUpState(input: {
    nextFollowAt: string | null | undefined;
    customerStatus?: string | null | undefined;
  }) {
    if (input.customerStatus === "signed") {
      return "none";
    }

    const nextFollowAt = input.nextFollowAt;
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
    customerStatus: string | null | undefined,
    summary: LatestFollowUpSummary,
    followFilter: "due" | "overdue",
  ) {
    const state = this.getFollowUpState({
      nextFollowAt: summary?.next_follow_at,
      customerStatus,
    });
    if (followFilter === "overdue") {
      return state === "overdue";
    }

    return state === "due" || state === "overdue";
  }

  private buildListCacheKey(authContext: AuthContext, query: CustomerListQueryType) {
    const roleCodes = [...authContext.roleCodes].sort();
    const permissions = authContext.permissions
      .map((item) => `${item.code}:${item.scope}`)
      .sort();

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
      roleCodes,
      permissions,
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

  invalidateListCache() {
    this.listCache.clear();
    this.listInFlight.clear();
  }

  async listCustomers(input: {
    authContext: AuthContext;
    query: CustomerListQueryType;
  }): Promise<CustomerListResult> {
    const cacheKey = this.buildListCacheKey(input.authContext, input.query);
    const cached = this.getListCache(cacheKey);
    if (cached) {
      return {
        ...cached,
        debugTimings: {
          cache: "hit",
        },
      };
    }

    const inFlight = this.listInFlight.get(cacheKey);
    if (inFlight) {
      return inFlight.then((result) => ({
        ...result,
        debugTimings: {
          ...result.debugTimings,
          cache: "in_flight",
        },
      }));
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
    const startedAt = Date.now();
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
    const scopeStartedAt = Date.now();
    const [visibleOwnerIds, todayCustomerIds] = await Promise.all([
      accessPolicyService.getVisibleCustomerOwnerIds(
        input.authContext,
        "customer.read",
      ),
      workScope === "today"
        ? customerFollowUpService.getTodayWorkCustomerIds(tenantId)
        : Promise.resolve(null),
    ]);
    const scopeDurationMs = Date.now() - scopeStartedAt;
    const filters = {
      tenantId,
      visibleOwnerIds,
      status,
      source,
      customerOrigin,
      keyword: normalizedKeyword,
      customerIds: todayCustomerIds,
    };

    if ((mode === "home" || mode === "compact") && !follow) {
      const rowsStartedAt = Date.now();
      const rowsWithLookahead = await (
        mode === "compact"
          ? customerCoreRepository.listCompactRows({
            filters,
            from,
            to: from + pageSize,
          })
          : customerCoreRepository.listHomeRows({
            filters,
            from,
            to: from + pageSize,
          })
      );
      const rowsDurationMs = Date.now() - rowsStartedAt;
      const pagedRows = rowsWithLookahead.slice(0, pageSize);
      const hasMore = rowsWithLookahead.length > pageSize;
      const pageCustomerIds = pagedRows.map((item) => item.id);
      const signedCustomerIds = pagedRows
        .filter((item) => item.status === "signed")
        .map((item) => item.id);
      const followUpStartedAt = Date.now();
      const [followUpMap, latestProjectMap] = mode === "compact"
        ? await Promise.all([
          customerFollowUpService.getLatestFollowUpMap({
            customerIds: pageCustomerIds,
            tenantId,
          }),
          customerCoreRepository.listLatestProjectsByCustomerIds({
            customerIds: signedCustomerIds,
            tenantId,
          }),
        ])
        : [new Map(), new Map()];
      const followUpDurationMs = Date.now() - followUpStartedAt;

      return {
        rows: pagedRows,
        total: from + pagedRows.length + (hasMore ? 1 : 0),
        followUpMap,
        latestProjectMap,
        page,
        pageSize,
        debugTimings: {
          cache: "miss",
          scopeMs: scopeDurationMs,
          rowsMs: rowsDurationMs,
          followUpMs: followUpDurationMs,
          totalMs: Date.now() - startedAt,
          visibleOwnerCount: visibleOwnerIds?.length ?? null,
          todayCustomerCount: todayCustomerIds?.length ?? null,
          rowCount: pagedRows.length,
          hasMore: hasMore ? 1 : 0,
        },
      };
    }

    if (follow) {
      const customerIds = await customerCoreRepository.listIds(filters);
      const followUpMap = await customerFollowUpService.getLatestFollowUpMap({
        customerIds,
        tenantId,
      });
      const customerStatuses = await customerCoreRepository.listStatusesByIds({
        customerIds,
        tenantId,
      });
      const filteredCustomerIds = customerIds.filter((id) =>
        this.matchesFollowFilter(customerStatuses.get(id), followUpMap.get(id), follow)
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
        latestProjectMap: new Map(),
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
      latestProjectMap: new Map(),
      page,
      pageSize,
    };
  }
}
