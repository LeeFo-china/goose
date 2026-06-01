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
    type PublicProjectMembers,
    type ProjectStatusTransitionInput,
    type ProjectStatusTransitionListQuery,
    type UpdateProjectInput,
} from "./shared";

export async function listPublicProjects(this: any): Promise<Array<Record<string, unknown>>> {
    const now = Date.now();
    if (this.publicProjectsCache && this.publicProjectsCache.expiresAt > now) {
        return this.publicProjectsCache.rows;
    }

    if (!this.publicProjectsInFlight) {
        this.publicProjectsInFlight = projectRepository.listPublicProjects()
            .then((rows: Array<Record<string, unknown>>) => this.attachPrimaryAssignees(rows))
            .then((rows: Array<Record<string, unknown>>) => {
                rows.forEach((row: Record<string, unknown>) => this.seedPublicProjectDetailCache(row));
                this.publicProjectsCache = {
                    rows,
                    expiresAt: Date.now() + PUBLIC_PROJECTS_CACHE_TTL_MS,
                };
                return rows;
            })
            .finally(() => {
                this.publicProjectsInFlight = null;
            });
    }

    return this.publicProjectsInFlight;
}

export function invalidatePublicProjectsCache(this: any) {
    this.publicProjectsCache = null;
    this.publicProjectsInFlight = null;
}

export function getCachedValue<T>(this: any,
    cache: Map<string, CacheEntry<T>>,
    key: string,
): T | null {
    const cached = cache.get(key);
    if (!cached) {
        return null;
    }

    if (cached.expiresAt <= Date.now()) {
        cache.delete(key);
        return null;
    }

    return cached.value;
}

export function setCachedValue<T>(this: any,
    cache: Map<string, CacheEntry<T>>,
    key: string,
    value: T,
    ttlMs: number,
): void {
    if (cache.size >= 500) {
        const now = Date.now();
        for (const [cacheKey, item] of cache.entries()) {
            if (item.expiresAt <= now) {
                cache.delete(cacheKey);
            }
        }

        if (cache.size >= 500) {
            cache.clear();
        }
    }

    cache.set(key, {
        expiresAt: Date.now() + ttlMs,
        value,
    });
}

export function seedPublicProjectDetailCache(this: any, row: Record<string, unknown>) {
    if (!this.isPublicProjectVisible(row) || typeof row.id !== "string") {
        return;
    }

    this.setCachedValue(
        this.publicProjectDetailCache,
        row.id,
        row,
        PUBLIC_PROJECT_DETAIL_CACHE_TTL_MS,
    );
}

export function invalidatePublicProjectDetailCache(this: any, projectId?: string) {
    if (!projectId) {
        this.publicProjectDetailCache.clear();
        this.publicProjectDetailInFlight.clear();
        return;
    }

    this.publicProjectDetailCache.delete(projectId);
    this.publicProjectDetailInFlight.delete(projectId);
}

export function invalidatePublicProjectLogsCache(this: any, projectId?: string) {
    if (!projectId) {
        this.publicProjectLogsCache.clear();
        this.publicProjectLogsInFlight.clear();
        this.invalidateEmployeeProjectBootstrapCache();
        return;
    }

    this.publicProjectLogsCache.delete(projectId);
    this.publicProjectLogsInFlight.delete(projectId);
    this.invalidateEmployeeProjectBootstrapCache(projectId);
}

export function invalidatePublicProjectMembersCache(this: any, projectId?: string) {
    if (!projectId) {
        this.publicProjectMembersCache.clear();
        this.publicProjectMembersInFlight.clear();
        this.invalidateEmployeeProjectBootstrapCache();
        return;
    }

    this.publicProjectMembersCache.delete(projectId);
    this.publicProjectMembersInFlight.delete(projectId);
    this.invalidateEmployeeProjectBootstrapCache(projectId);
}

export function invalidateEmployeeProjectBootstrapCache(this: any, projectId?: string) {
    if (!projectId) {
        this.employeeProjectBootstrapCache.clear();
        this.employeeProjectBootstrapInFlight.clear();
        return;
    }

    for (const key of this.employeeProjectBootstrapCache.keys()) {
        if (key.includes(`"projectId":"${projectId}"`)) {
            this.employeeProjectBootstrapCache.delete(key);
        }
    }

    for (const key of this.employeeProjectBootstrapInFlight.keys()) {
        if (key.includes(`"projectId":"${projectId}"`)) {
            this.employeeProjectBootstrapInFlight.delete(key);
        }
    }
}

export function invalidatePublicProjectCache(this: any, projectId?: string) {
    this.invalidatePublicProjectDetailCache(projectId);
    this.invalidatePublicProjectLogsCache(projectId);
    this.invalidatePublicProjectMembersCache(projectId);
    this.invalidateEmployeeProjectBootstrapCache(projectId);
}

export async function getRequiredPublicProjectVisibility(this: any, projectId: string): Promise<Record<string, unknown>> {
    const project = await projectRepository.findPublicVisibilityById(projectId);
    if (!project || !this.isPublicProjectVisible(project)) {
        throw Errors.notFound("项目不存在");
    }

    return project;
}

export async function getPublicProjectDetail(this: any, projectId: string): Promise<Record<string, unknown>> {
    const cached = this.getCachedValue(
        this.publicProjectDetailCache,
        projectId,
    );
    if (cached) {
        return cached;
    }

    const inFlight = this.publicProjectDetailInFlight.get(projectId);
    if (inFlight) {
        return inFlight;
    }

    const request = projectRepository.findPublicDetailById(projectId)
        .then((project: Record<string, unknown> | null) => this.attachPrimaryAssigneesToProject(project))
        .then((project: Record<string, unknown> | null) => {
            if (!project || !this.isPublicProjectVisible(project)) {
                throw Errors.notFound("项目不存在");
            }

            this.setCachedValue(
                this.publicProjectDetailCache,
                projectId,
                project,
                PUBLIC_PROJECT_DETAIL_CACHE_TTL_MS,
            );
            return project;
        })
        .finally(() => {
            if (this.publicProjectDetailInFlight.get(projectId) === request) {
                this.publicProjectDetailInFlight.delete(projectId);
            }
        });
    this.publicProjectDetailInFlight.set(projectId, request);
    return request;
}

export async function listPublicProjectLogs(this: any, projectId: string): Promise<Array<Record<string, unknown>>> {
    await this.getPublicProjectDetail(projectId);

    const cached = this.getCachedValue(
        this.publicProjectLogsCache,
        projectId,
    );
    if (cached) {
        return cached;
    }

    const inFlight = this.publicProjectLogsInFlight.get(projectId);
    if (inFlight) {
        return inFlight;
    }

    const request = projectRepository.listPublicProjectLogs(projectId)
        .then((rows: Array<Record<string, unknown>>) => {
            this.setCachedValue(
                this.publicProjectLogsCache,
                projectId,
                rows,
                PUBLIC_PROJECT_LOGS_CACHE_TTL_MS,
            );
            return rows;
        })
        .finally(() => {
            if (this.publicProjectLogsInFlight.get(projectId) === request) {
                this.publicProjectLogsInFlight.delete(projectId);
            }
        });
    this.publicProjectLogsInFlight.set(projectId, request);
    return request;
}

export async function listPublicProjectMembers(this: any, projectId: string): Promise<PublicProjectMembers> {
    await this.getPublicProjectDetail(projectId);

    const cached = this.getCachedValue(
        this.publicProjectMembersCache,
        projectId,
    );
    if (cached) {
        return cached;
    }

    const inFlight = this.publicProjectMembersInFlight.get(projectId);
    if (inFlight) {
        return inFlight;
    }

    const request = projectMemberService.listProjectMembers(projectId)
        .then((members: PublicProjectMembers) => {
            this.setCachedValue(
                this.publicProjectMembersCache,
                projectId,
                members,
                PUBLIC_PROJECT_MEMBERS_CACHE_TTL_MS,
            );
            return members;
        })
        .finally(() => {
            if (this.publicProjectMembersInFlight.get(projectId) === request) {
                this.publicProjectMembersInFlight.delete(projectId);
            }
        });
    this.publicProjectMembersInFlight.set(projectId, request);
    return request;
}

export async function prewarmPublicProjectDetailData(this: any, input?: {
    projects?: Array<Record<string, unknown>>;
    limit?: number;
}): Promise<void> {
    const projects: Array<Record<string, unknown>> = input?.projects ?? await this.listPublicProjects();
    const projectIds = projects
        .map((item) => typeof item.id === "string" ? item.id : null)
        .filter((item): item is string => Boolean(item))
        .slice(0, input?.limit ?? PUBLIC_PROJECT_DETAIL_PREWARM_LIMIT);

    await Promise.allSettled(
        projectIds.map(async (projectId: string) => {
            await this.getPublicProjectDetail(projectId);
            await Promise.allSettled([
                this.listPublicProjectLogs(projectId),
                this.listPublicProjectMembers(projectId),
            ]);
        }),
    );
}
