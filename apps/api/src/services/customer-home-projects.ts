import type {
  CustomerSelfServiceProjectListItem,
  CustomerSelfServiceRecentLogSummaryRow,
} from "@/repositories/customer-self-service";
import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";
import {
  measureCustomerProjectDetailStep,
  type CustomerProjectDetailTimingSteps,
} from "@/utils/customer-project-detail-timing";

const CUSTOMER_HOME_PROJECTS_CACHE_TTL_MS = 10_000;
const MAX_CUSTOMER_HOME_PROJECTS_CACHE_SIZE = 1_000;

export type CustomerHomeProjectListItem = CustomerSelfServiceProjectListItem & {
  recent_logs: CustomerSelfServiceRecentLogSummaryRow[];
};

type CustomerHomeProjectRpcRow = Omit<CustomerSelfServiceProjectListItem, "designer"> & {
  designer?: null;
  property: CustomerSelfServiceProjectListItem["property"];
  recent_logs: CustomerSelfServiceRecentLogSummaryRow[] | unknown;
};

class CustomerHomeProjectsService {
  private cache = new Map<string, {
    expiresAt: number;
    value: { list: CustomerHomeProjectListItem[]; count: number };
  }>();

  private getCacheKey(input: {
    tenantId: string;
    customerId: string;
    page: number;
    pageSize: number;
    recentLogsPerProject: number;
  }) {
    return [
      input.tenantId,
      input.customerId,
      input.page,
      input.pageSize,
      input.recentLogsPerProject,
    ].join(":");
  }

  private getCachedValue(key: string) {
    const cached = this.cache.get(key);
    if (!cached) return null;
    if (cached.expiresAt <= Date.now()) {
      this.cache.delete(key);
      return null;
    }
    return cached.value;
  }

  private setCachedValue(key: string, value: { list: CustomerHomeProjectListItem[]; count: number }) {
    if (this.cache.size >= MAX_CUSTOMER_HOME_PROJECTS_CACHE_SIZE) {
      this.cache.clear();
    }
    this.cache.set(key, {
      expiresAt: Date.now() + CUSTOMER_HOME_PROJECTS_CACHE_TTL_MS,
      value,
    });
  }

  async listHomeProjects(input: {
    tenantId: string;
    customerId: string;
    page: number;
    pageSize: number;
    recentLogsPerProject?: number;
  }) {
    const recentLogsPerProject = input.recentLogsPerProject ?? 2;
    const cacheKey = this.getCacheKey({ ...input, recentLogsPerProject });
    const cached = this.getCachedValue(cacheKey);
    if (cached) return cached;

    const { data, error } = await SupabaseDB.getAdminClient().rpc(
      "list_customer_home_projects",
      {
        p_tenant_id: input.tenantId,
        p_customer_id: input.customerId,
        p_page: input.page,
        p_page_size: input.pageSize,
        p_recent_logs_per_project: recentLogsPerProject,
      },
    );

    if (error) throw Errors.dbError("查询客户首页项目列表失败", error);
    const list = ((data || []) as CustomerHomeProjectRpcRow[]).map((row) => ({
      ...row,
      designer: null,
      recent_logs: Array.isArray(row.recent_logs)
        ? row.recent_logs as CustomerSelfServiceRecentLogSummaryRow[]
        : [],
    }));
    const value = { list, count: 0 };
    this.setCachedValue(cacheKey, value);
    return value;
  }
}

export const customerHomeProjectsService = new CustomerHomeProjectsService();

export async function buildCustomerHomeProjectsPayload(input: {
  customerId: string;
  tenantId: string;
  page: number;
  pageSize: number;
  timingSteps?: CustomerProjectDetailTimingSteps;
  serializeProject: (row: CustomerHomeProjectListItem) => Record<string, unknown>;
  serializeRecentLog: (row: CustomerSelfServiceRecentLogSummaryRow) => Record<string, unknown>;
}) {
  const startedAt = Date.now();
  const load = () => customerHomeProjectsService.listHomeProjects({
    customerId: input.customerId,
    tenantId: input.tenantId,
    page: input.page,
    pageSize: input.pageSize,
  });
  const { list, count } = input.timingSteps
    ? await measureCustomerProjectDetailStep(input.timingSteps, "projects_query_ms", load)
    : await load();
  if (input.timingSteps) input.timingSteps.projects_ms += Date.now() - startedAt;
  return {
    list: list.map((row) => ({
      ...input.serializeProject(row),
      recent_logs: row.recent_logs.map(input.serializeRecentLog),
    })),
    pagination: {
      page: input.page,
      pageSize: input.pageSize,
      total: count,
      totalPages: 0,
    },
  };
}
