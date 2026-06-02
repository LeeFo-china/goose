import {
    Errors,
    ErrorCodes,
    projectRepository,
    accessPolicyService,
    constructionStageStatusService,
    projectMemberService,
    projectStatusService,
    PUBLIC_PROJECTS_CACHE_TTL_MS,
    PUBLIC_PROJECT_DETAIL_CACHE_TTL_MS,
    PUBLIC_PROJECT_LOGS_CACHE_TTL_MS,
    PUBLIC_PROJECT_MEMBERS_CACHE_TTL_MS,
    PUBLIC_PROJECT_DETAIL_PREWARM_LIMIT,
    PROJECT_LIST_CACHE_TTL_MS,
    EMPLOYEE_PROJECT_BOOTSTRAP_CACHE_TTL_MS,
    EMPLOYEE_PROJECT_BOOTSTRAP_STALE_TTL_MS,
    PROJECT_CREATE_EMPLOYEE_SCENE_DEPARTMENTS,
    PROJECT_MEMBER_ROLE_CANDIDATE_DEPARTMENTS,
    type AuthContext,
    type CacheEntry,
    type CreateProjectInput,
    type EmployeeProjectBootstrapBundle,
    type ProjectCreateSelectCustomerQueryType,
    type ProjectCreateSelectEmployeeQueryType,
    type ProjectDetailMembers,
    type ProjectListQuery,
    type ProjectListResult,
    type ProjectMemberCandidateQueryType,
    type ProjectPrimaryAssignee,
    type ProjectStatusTransitionInput,
    type ProjectStatusTransitionListQuery,
    type UpdateProjectInput,
} from "./shared";

export async function listProjects(this: any, input: {
    authContext: AuthContext;
    query: ProjectListQuery;
}): Promise<ProjectListResult> {
    const tenantId = accessPolicyService.assertTenantContext(input.authContext);
    const cacheKey = this.projectListCacheKey(input.authContext, input.query);
    const cached = this.getProjectListCache(cacheKey);
    if (cached) {
        return {
            ...cached,
            debugTimings: {
                cache: "hit",
            },
        };
    }

    const inFlight = this.projectListInFlight.get(cacheKey);
    if (inFlight) {
        return inFlight.then((result: ProjectListResult) => ({
            ...result,
            debugTimings: {
                ...result.debugTimings,
                cache: "in_flight",
            },
        }));
    }

    const request = this.loadProjects({ tenantId, ...input })
        .then((result: ProjectListResult) => {
            this.setProjectListCache(cacheKey, result);
            return result;
        })
        .finally(() => {
            if (this.projectListInFlight.get(cacheKey) === request) {
                this.projectListInFlight.delete(cacheKey);
            }
        });
    this.projectListInFlight.set(cacheKey, request);
    return request;
}

export function projectListCacheKey(this: any, authContext: AuthContext, query: ProjectListQuery): string {
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
        keyword: query.keyword?.trim() ?? null,
        ownership: query.ownership ?? null,
        work_scope: query.work_scope ?? null,
        mode: query.mode ?? null,
        roleCodes,
        permissions,
    });
}

export function getProjectListCache(this: any, cacheKey: string): ProjectListResult | null {
    const cached = this.projectListCache.get(cacheKey);
    if (!cached) {
        return null;
    }

    if (cached.expiresAt <= Date.now()) {
        this.projectListCache.delete(cacheKey);
        this.projectListInFlight.delete(cacheKey);
        return null;
    }

    return cached.value;
}

export function setProjectListCache(this: any, cacheKey: string, value: ProjectListResult) {
    const now = Date.now();
    if (this.projectListCache.size >= 500) {
        for (const [key, item] of this.projectListCache.entries()) {
            if (item.expiresAt <= now) {
                this.projectListCache.delete(key);
            }
        }

        if (this.projectListCache.size >= 500) {
            this.projectListCache.clear();
        }
    }

    this.projectListCache.set(cacheKey, {
        expiresAt: now + PROJECT_LIST_CACHE_TTL_MS,
        value,
    });
}

export async function loadProjects(this: any, input: {
    tenantId: string;
    authContext: AuthContext;
    query: ProjectListQuery;
}): Promise<ProjectListResult> {
    const startedAt = Date.now();
    const tenantId = input.tenantId;
    const { page, pageSize, status, keyword, work_scope: workScope, mode } = input.query;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const scopeStartedAt = Date.now();
    const [visibleProjectIds, todayProjectIds] = await Promise.all([
        accessPolicyService.getVisibleProjectIdsByOwnership(
            input.authContext,
            "project.read",
            input.query.ownership,
        ),
        workScope === "today"
            ? projectRepository.listTodayWorkProjectIds(tenantId)
            : Promise.resolve(null),
    ]);
    const scopeDurationMs = Date.now() - scopeStartedAt;
    const filters = {
        tenantId,
        visibleProjectIds,
        status,
        keyword: keyword?.trim(),
        projectIds: todayProjectIds,
    };
    if (mode === "home") {
        const rowsStartedAt = Date.now();
        const rowsWithLookahead = await projectRepository.listRows({
            filters,
            from,
            to: from + pageSize,
        });
        const rowsDurationMs = Date.now() - rowsStartedAt;
        const rows = await this.attachPrimaryAssignees(
            rowsWithLookahead.slice(0, pageSize),
        );
        const hasMore = rowsWithLookahead.length > pageSize;
        const total = from + rows.length + (hasMore ? 1 : 0);

        return {
            rows,
            pagination: {
                page,
                pageSize,
                total,
                totalPages: total ? Math.ceil(total / pageSize) : 0,
            },
            debugTimings: {
                cache: "miss",
                scopeMs: scopeDurationMs,
                rowsMs: rowsDurationMs,
                totalMs: Date.now() - startedAt,
                visibleProjectCount: visibleProjectIds?.length ?? null,
                todayProjectCount: todayProjectIds?.length ?? null,
                rowCount: rows.length,
                hasMore: hasMore ? 1 : 0,
            },
        };
    }

    const [total, rawRows] = await Promise.all([
        projectRepository.count(filters),
        projectRepository.listRows({ filters, from, to }),
    ]);
    const rows = from >= total ? [] : await this.attachPrimaryAssignees(rawRows);

    return {
        rows,
        pagination: {
            page,
            pageSize,
            total,
            totalPages: total ? Math.ceil(total / pageSize) : 0,
        },
    };
}

export async function searchProjectsByName(this: any): Promise<void> {
}
