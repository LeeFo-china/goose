import {
  customerSelfServiceRepository,
  type CustomerSelfServiceCustomerContextRow,
  type CustomerSelfServiceProjectLogCommentAggregateRow,
  type CustomerSelfServiceProjectLogCommentAuthorCustomer,
  type CustomerSelfServiceProjectLogCommentAuthorEmployee,
  type CustomerSelfServiceProjectLogCommentRow,
  type CustomerSelfServiceProjectLogRow,
  type CustomerSelfServiceProjectListItem,
  type CustomerSelfServiceRecentLogSummaryRow,
  type CustomerSelfServiceUserProfileRow,
} from "@/repositories/customer-self-service";
import type { AuthMeProfileUpdateInput } from "@/schema/user-profile";
import { projectMemberService } from "@/services/project-members";

const CUSTOMER_SELF_SERVICE_CACHE_TTL_MS = 10_000;
const MAX_CUSTOMER_SELF_SERVICE_CACHE_SIZE = 4_000;

class CustomerSelfServiceService {
  private customerProfilesByIdsCache = new Map<string, {
    expiresAt: number;
    value: CustomerSelfServiceCustomerContextRow[];
  }>();
  private customerProfilesByIdsInFlight = new Map<string, Promise<CustomerSelfServiceCustomerContextRow[]>>();
  private userProfileCache = new Map<string, {
    expiresAt: number;
    value: CustomerSelfServiceUserProfileRow | null;
  }>();
  private userProfileInFlight = new Map<string, Promise<CustomerSelfServiceUserProfileRow | null>>();
  private ownedProjectsCache = new Map<string, {
    expiresAt: number;
    value: Awaited<ReturnType<typeof customerSelfServiceRepository.listOwnedProjects>>;
  }>();
  private ownedProjectsInFlight = new Map<string, Promise<Awaited<ReturnType<typeof customerSelfServiceRepository.listOwnedProjects>>>>();
  private ownedProjectCache = new Map<string, {
    expiresAt: number;
    value: CustomerSelfServiceProjectListItem | null;
  }>();
  private ownedProjectInFlight = new Map<string, Promise<CustomerSelfServiceProjectListItem | null>>();
  private projectLogsCache = new Map<string, {
    expiresAt: number;
    value: Awaited<ReturnType<typeof customerSelfServiceRepository.listProjectLogs>>;
  }>();
  private projectLogsInFlight = new Map<string, Promise<Awaited<ReturnType<typeof customerSelfServiceRepository.listProjectLogs>>>>();
  private projectLogCommentAggregatesCache = new Map<string, {
    expiresAt: number;
    value: CustomerSelfServiceProjectLogCommentAggregateRow[];
  }>();
  private projectLogCommentAggregatesInFlight = new Map<string, Promise<CustomerSelfServiceProjectLogCommentAggregateRow[]>>();
  private recentLogSummariesCache = new Map<string, {
    expiresAt: number; value: CustomerSelfServiceRecentLogSummaryRow[];
  }>();
  private recentLogSummariesInFlight = new Map<string, Promise<CustomerSelfServiceRecentLogSummaryRow[]>>();

  private getCachedValue<T>(cache: Map<string, { expiresAt: number; value: T }>, key: string) {
    const item = cache.get(key);
    if (!item) {
      return null;
    }

    if (item.expiresAt <= Date.now()) {
      cache.delete(key);
      return null;
    }

    return item.value;
  }

  private getCachedEntry<T>(cache: Map<string, { expiresAt: number; value: T }>, key: string) {
    const item = cache.get(key);
    if (!item) {
      return null;
    }

    if (item.expiresAt <= Date.now()) {
      cache.delete(key);
      return null;
    }

    return item;
  }

  private setCachedValue<T>(cache: Map<string, { expiresAt: number; value: T }>, key: string, value: T) {
    const now = Date.now();
    if (cache.size >= MAX_CUSTOMER_SELF_SERVICE_CACHE_SIZE) {
      for (const [cacheKey, item] of cache.entries()) {
        if (item.expiresAt <= now) {
          cache.delete(cacheKey);
        }
      }

      if (cache.size >= MAX_CUSTOMER_SELF_SERVICE_CACHE_SIZE) {
        cache.clear();
      }
    }

    cache.set(key, {
      expiresAt: now + CUSTOMER_SELF_SERVICE_CACHE_TTL_MS,
      value,
    });
  }

  private ownedProjectCacheKey(input: {
    projectId: string;
    customerId: string;
    tenantId?: string | null;
  }) {
    return [input.customerId, input.tenantId ?? "", input.projectId].join(":");
  }

  private async attachDesigner<T extends CustomerSelfServiceProjectListItem>(
    projects: T[],
  ) {
    const projectIds = projects.map((project) => project.id);
    if (projectIds.length === 0) {
      return projects;
    }

    const assignees = await projectMemberService.listPrimaryAssigneesByProjectIds(
      projectIds,
    );
    const designers = new Map(
      assignees
        .filter((item) => item.role_code === "designer")
        .map((item) => [item.project_id, item]),
    );

    return projects.map((project) => {
      const designer = designers.get(project.id);
      return {
        ...project,
        designer: designer
          ? {
              id: designer.employee?.id ?? designer.employee_id,
              name: designer.employee?.name ?? null,
              avatar: designer.employee?.avatar ?? null,
            }
          : null,
      };
    });
  }

  private async attachDesignerToProject<T extends CustomerSelfServiceProjectListItem | null>(
    project: T,
  ) {
    if (!project) {
      return project;
    }

    const [item] = await this.attachDesigner([project]);
    return item as T;
  }

  listCustomerProfilesByIds(customerIds: string[]) {
    const normalizedIds = Array.from(new Set(customerIds)).sort();
    if (normalizedIds.length === 0) {
      return Promise.resolve([] as CustomerSelfServiceCustomerContextRow[]);
    }

    const cacheKey = normalizedIds.join(",");
    const cached = this.getCachedValue(this.customerProfilesByIdsCache, cacheKey);
    if (cached) {
      return Promise.resolve(cached);
    }

    const inFlight = this.customerProfilesByIdsInFlight.get(cacheKey);
    if (inFlight) {
      return inFlight;
    }

    const request = customerSelfServiceRepository.listCustomerProfilesByIds(normalizedIds)
      .then((result) => {
        this.setCachedValue(this.customerProfilesByIdsCache, cacheKey, result);
        return result;
      })
      .finally(() => {
        if (this.customerProfilesByIdsInFlight.get(cacheKey) === request) {
          this.customerProfilesByIdsInFlight.delete(cacheKey);
        }
      });
    this.customerProfilesByIdsInFlight.set(cacheKey, request);
    return request;
  }

  getUserProfileByAuthUserId(authUserId: string) {
    const cached = this.getCachedEntry(this.userProfileCache, authUserId);
    if (cached) {
      return Promise.resolve(cached.value);
    }

    const inFlight = this.userProfileInFlight.get(authUserId);
    if (inFlight) {
      return inFlight;
    }

    const request = customerSelfServiceRepository.getUserProfileByAuthUserId(authUserId)
      .then((result) => {
        this.setCachedValue(this.userProfileCache, authUserId, result);
        return result;
      })
      .finally(() => {
        if (this.userProfileInFlight.get(authUserId) === request) {
          this.userProfileInFlight.delete(authUserId);
        }
      });
    this.userProfileInFlight.set(authUserId, request);
    return request;
  }

  getCachedUserProfileByAuthUserId(authUserId: string) {
    return this.getCachedEntry(this.userProfileCache, authUserId)?.value ?? null;
  }

  getCachedUserProfileEntryByAuthUserId(authUserId: string) {
    const entry = this.getCachedEntry(this.userProfileCache, authUserId);
    return entry ? { value: entry.value } : null;
  }

  prewarmCustomerContext(input: {
    authUserId: string;
    customer: CustomerSelfServiceCustomerContextRow;
  }) {
    this.setCachedValue(this.customerProfilesByIdsCache, input.customer.id, [input.customer]);
    return this.getUserProfileByAuthUserId(input.authUserId);
  }

  prewarmCustomerHomeProjects(input: {
    customerId: string;
    tenantId: string;
    pageSize?: number;
  }) {
    return this.listOwnedProjects({
      customerId: input.customerId,
      tenantId: input.tenantId,
      from: 0,
      to: (input.pageSize ?? 20) - 1,
    });
  }

  async saveAuthUserProfile(
    authUserId: string,
    input: AuthMeProfileUpdateInput,
  ) {
    this.userProfileCache.delete(authUserId);
    this.userProfileInFlight.delete(authUserId);
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

    const saved = await customerSelfServiceRepository.upsertUserProfile({
      authUserId,
      nickname,
      avatarPath,
      profileCompletedAt,
    });
    this.setCachedValue(this.userProfileCache, authUserId, saved);
    return saved;
  }

  listOwnedProjects(input: {
    customerId: string; tenantId: string; from: number; to: number;
    includeDesigner?: boolean; includeCount?: boolean;
  }) {
    const cacheKey = [
      input.customerId, input.tenantId, input.from, input.to,
      input.includeDesigner === false ? "no_designer" : "designer",
      input.includeCount === false ? "no_count" : "count",
    ].join(":");
    const cached = this.getCachedValue(this.ownedProjectsCache, cacheKey);
    if (cached) {
      return Promise.resolve(cached);
    }

    const inFlight = this.ownedProjectsInFlight.get(cacheKey);
    if (inFlight) {
      return inFlight;
    }

    const request = customerSelfServiceRepository.listOwnedProjects(input)
      .then(async (result) => ({
        ...result,
        list: input.includeDesigner === false
          ? result.list
          : await this.attachDesigner(result.list),
      }))
      .then((result) => {
        this.setCachedValue(this.ownedProjectsCache, cacheKey, result);
        for (const project of result.list) {
          this.setCachedValue(
            this.ownedProjectCache,
            this.ownedProjectCacheKey({
              projectId: project.id,
              customerId: input.customerId,
              tenantId: input.tenantId,
            }),
            project,
          );
        }
        return result;
      })
      .finally(() => {
        if (this.ownedProjectsInFlight.get(cacheKey) === request) {
          this.ownedProjectsInFlight.delete(cacheKey);
        }
      });
    this.ownedProjectsInFlight.set(cacheKey, request);
    return request;
  }

  findOwnedProject(input: {
    projectId: string;
    customerId: string;
    tenantId?: string | null;
  }) {
    const cacheKey = this.ownedProjectCacheKey(input);
    const cached = this.getCachedEntry(this.ownedProjectCache, cacheKey);
    if (cached) {
      return Promise.resolve(cached.value);
    }

    const inFlight = this.ownedProjectInFlight.get(cacheKey);
    if (inFlight) {
      return inFlight;
    }

    const request = customerSelfServiceRepository.findOwnedProject(input)
      .then((result) => this.attachDesignerToProject(result))
      .then((result) => {
        this.setCachedValue(this.ownedProjectCache, cacheKey, result);
        return result;
      })
      .finally(() => {
        if (this.ownedProjectInFlight.get(cacheKey) === request) {
          this.ownedProjectInFlight.delete(cacheKey);
        }
      });
    this.ownedProjectInFlight.set(cacheKey, request);
    return request;
  }

  listRecentLogSummariesForProjects(input: {
    customerId: string;
    projectIds: string[];
    perProject: number;
  }) {
    const normalizedProjectIds = Array.from(new Set(input.projectIds)).sort();
    if (normalizedProjectIds.length === 0) {
      return Promise.resolve([] as CustomerSelfServiceRecentLogSummaryRow[]);
    }

    const cacheKey = [
      input.customerId, normalizedProjectIds.join(","), input.perProject,
    ].join(":");
    const cached = this.getCachedValue(this.recentLogSummariesCache, cacheKey);
    if (cached) {
      return Promise.resolve(cached);
    }

    const inFlight = this.recentLogSummariesInFlight.get(cacheKey);
    if (inFlight) {
      return inFlight;
    }

    const request = customerSelfServiceRepository.listRecentLogSummariesForProjects({
      ...input, projectIds: normalizedProjectIds,
    })
      .then((result) => {
        this.setCachedValue(this.recentLogSummariesCache, cacheKey, result);
        return result;
      })
      .finally(() => {
        if (this.recentLogSummariesInFlight.get(cacheKey) === request) {
          this.recentLogSummariesInFlight.delete(cacheKey);
        }
      });
    this.recentLogSummariesInFlight.set(cacheKey, request);
    return request;
  }

  findOwnedProjectLog(input: {
    logId: string;
    projectId: string;
    tenantId?: string | null;
  }) {
    return customerSelfServiceRepository.findOwnedProjectLog(input);
  }

  listProjectLogs(input: {
    projectId: string;
    tenantId: string | null;
    from: number;
    to: number;
    includeCount?: boolean;
  }) {
    const cacheKey = [
      input.projectId, input.tenantId ?? "", input.from, input.to,
      input.includeCount === false ? "no_count" : "count",
    ].join(":");
    const cached = this.getCachedValue(this.projectLogsCache, cacheKey);
    if (cached) {
      return Promise.resolve(cached);
    }

    const inFlight = this.projectLogsInFlight.get(cacheKey);
    if (inFlight) {
      return inFlight;
    }

    const request = customerSelfServiceRepository.listProjectLogs(input)
      .then((result) => {
        this.setCachedValue(this.projectLogsCache, cacheKey, result);
        return result;
      })
      .finally(() => {
        if (this.projectLogsInFlight.get(cacheKey) === request) {
          this.projectLogsInFlight.delete(cacheKey);
        }
      });
    this.projectLogsInFlight.set(cacheKey, request);
    return request;
  }

  listProjectLogCommentAggregates(input: {
    logIds: string[];
    tenantId: string | null;
  }) {
    const normalizedLogIds = Array.from(new Set(input.logIds)).sort();
    if (normalizedLogIds.length === 0) {
      return Promise.resolve([] as CustomerSelfServiceProjectLogCommentAggregateRow[]);
    }

    const cacheKey = [input.tenantId ?? "", normalizedLogIds.join(",")].join(":");
    const cached = this.getCachedValue(this.projectLogCommentAggregatesCache, cacheKey);
    if (cached) {
      return Promise.resolve(cached);
    }

    const inFlight = this.projectLogCommentAggregatesInFlight.get(cacheKey);
    if (inFlight) {
      return inFlight;
    }

    const request = customerSelfServiceRepository.listProjectLogCommentAggregates({
      ...input,
      logIds: normalizedLogIds,
    })
      .then((result) => {
        this.setCachedValue(this.projectLogCommentAggregatesCache, cacheKey, result);
        return result;
      })
      .finally(() => {
        if (this.projectLogCommentAggregatesInFlight.get(cacheKey) === request) {
          this.projectLogCommentAggregatesInFlight.delete(cacheKey);
        }
      });
    this.projectLogCommentAggregatesInFlight.set(cacheKey, request);
    return request;
  }

  listProjectLogComments(input: {
    logId: string;
    tenantId: string | null;
    from: number;
    to: number;
  }) {
    return customerSelfServiceRepository.listProjectLogComments(input);
  }

  listCommentAuthorEmployees(employeeIds: string[]) {
    return customerSelfServiceRepository.listCommentAuthorEmployees(employeeIds);
  }

  listCommentAuthorCustomers(customerIds: string[]) {
    return customerSelfServiceRepository.listCommentAuthorCustomers(customerIds);
  }
}

export type CustomerContextRow = CustomerSelfServiceCustomerContextRow;
export type CustomerProjectLogCommentAggregateRow = CustomerSelfServiceProjectLogCommentAggregateRow;
export type CustomerProjectLogCommentAuthorCustomer = CustomerSelfServiceProjectLogCommentAuthorCustomer;
export type CustomerProjectLogCommentAuthorEmployee = CustomerSelfServiceProjectLogCommentAuthorEmployee;
export type CustomerProjectLogCommentRow = CustomerSelfServiceProjectLogCommentRow;
export type CustomerProjectLogRow = CustomerSelfServiceProjectLogRow;
export type CustomerProjectListItem = CustomerSelfServiceProjectListItem;
export type CustomerProjectRecentLogSummaryRow = CustomerSelfServiceRecentLogSummaryRow;
export type UserProfileRow = CustomerSelfServiceUserProfileRow;
export const customerSelfServiceService = new CustomerSelfServiceService();
