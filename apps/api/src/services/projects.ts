import {
    type CreateProjectInput,
    type ProjectStatusTransitionInput,
    type ProjectStatusTransitionListQuery,
    type ProjectListQuery,
    type UpdateProjectInput,
} from "@/schema/projects";
import type {
    ProjectCreateSelectCustomerQueryType,
    ProjectCreateSelectEmployeeQueryType,
    ProjectCreateSelectEmployeeScene,
    ProjectMemberCandidateQueryType,
} from "@/schema/project-create-select";
import { Errors } from "@/errors/error-factory";
import { ErrorCodes } from "@/errors/error-codes";
import { projectRepository } from "@/repositories/projects";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import { constructionStageStatusService } from "@/services/construction-stage-status";
import {
    type ProjectPrimaryAssignee,
    projectMemberService,
} from "@/services/project-members";
import { projectStatusService } from "@/services/project-status";
import type { DepartmentCode, ProjectMemberRoleCode } from "@gooes/domain";

const PUBLIC_PROJECTS_CACHE_TTL_MS = 5 * 60_000;
const PUBLIC_PROJECT_DETAIL_CACHE_TTL_MS = 5 * 60_000;
const PUBLIC_PROJECT_LOGS_CACHE_TTL_MS = 5 * 60_000;
const PUBLIC_PROJECT_MEMBERS_CACHE_TTL_MS = 5 * 60_000;
const PUBLIC_PROJECT_DETAIL_PREWARM_LIMIT = 3;
const PROJECT_LIST_CACHE_TTL_MS = 60_000;

const PROJECT_CREATE_EMPLOYEE_SCENE_DEPARTMENTS: Record<
    ProjectCreateSelectEmployeeScene,
    DepartmentCode[]
> = {
    project_designer: ["DESIGN"],
    project_supervisor: ["PROJECT"],
    project_construction_manager: ["PROJECT"],
};

const PROJECT_MEMBER_ROLE_DEPARTMENTS: Partial<Record<ProjectMemberRoleCode, DepartmentCode[]>> = {
    designer: ["DESIGN"],
    supervisor: ["PROJECT"],
    construction_manager: ["PROJECT"],
};

type CacheEntry<T> = {
    expiresAt: number;
    value: T;
};

type PublicProjectMembers = Awaited<ReturnType<typeof projectMemberService.listProjectMembers>>;
type ProjectDetailMembers = Awaited<ReturnType<typeof projectMemberService.listProjectMembers>>;

type ProjectListResult = {
    rows: Array<Record<string, unknown>>;
    pagination: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
    };
    debugTimings?: Record<string, number | string | null>;
};

class ProjectService {
    private publicProjectVisibleStatuses = [
        "signed",
        "design_finalized",
        "pending_start",
        "started",
        "constructing",
        "acceptance",
    ] as const;
    private publicProjectsCache: {
        expiresAt: number;
        rows: Array<Record<string, unknown>>;
    } | null = null;
    private publicProjectsInFlight: Promise<Array<Record<string, unknown>>> | null = null;
    private publicProjectDetailCache = new Map<string, CacheEntry<Record<string, unknown>>>();
    private publicProjectDetailInFlight = new Map<string, Promise<Record<string, unknown>>>();
    private publicProjectLogsCache = new Map<string, CacheEntry<Array<Record<string, unknown>>>>();
    private publicProjectLogsInFlight = new Map<string, Promise<Array<Record<string, unknown>>>>();
    private publicProjectMembersCache = new Map<string, CacheEntry<PublicProjectMembers>>();
    private publicProjectMembersInFlight = new Map<string, Promise<PublicProjectMembers>>();
    private projectListCache = new Map<string, {
        expiresAt: number;
        value: ProjectListResult;
    }>();
    private projectListInFlight = new Map<string, Promise<ProjectListResult>>();

    private isPublicProjectVisible(row: Record<string, unknown>) {
        const visibilityStatus =
            typeof row.visibility_status === "string" ? row.visibility_status : "inherit";
        const status = typeof row.status === "string" ? row.status : null;

        if (visibilityStatus === "hidden") {
            return false;
        }

        if (visibilityStatus === "public") {
            return true;
        }

        return status
            ? this.publicProjectVisibleStatuses.includes(
                status as (typeof this.publicProjectVisibleStatuses)[number],
            )
            : false;
    }

    private normalizeRelation<T extends Record<string, unknown>>(
        value: unknown,
        fallback: T,
    ): T {
        if (Array.isArray(value)) {
            const first = value[0];
            if (first && typeof first === "object") {
                return { ...fallback, ...(first as T) };
            }

            return fallback;
        }

        if (value && typeof value === "object") {
            return { ...fallback, ...(value as T) };
        }

        return fallback;
    }

    async listProjects(input: {
        authContext: AuthContext;
        query: ProjectListQuery;
    }) {
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
            return inFlight.then((result) => ({
                ...result,
                debugTimings: {
                    ...result.debugTimings,
                    cache: "in_flight",
                },
            }));
        }

        const request = this.loadProjects({ tenantId, ...input })
            .then((result) => {
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

    private projectListCacheKey(authContext: AuthContext, query: ProjectListQuery) {
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

    private getProjectListCache(cacheKey: string) {
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

    private setProjectListCache(cacheKey: string, value: ProjectListResult) {
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

    private buildAssigneeIndex(assignees: ProjectPrimaryAssignee[]) {
        const index = new Map<string, Partial<Record<"designer" | "supervisor", ProjectPrimaryAssignee>>>();
        for (const assignee of assignees) {
            const item = index.get(assignee.project_id) || {};
            if (!item[assignee.role_code]) {
                item[assignee.role_code] = assignee;
                index.set(assignee.project_id, item);
            }
        }

        return index;
    }

    private serializeAssignee(assignee?: ProjectPrimaryAssignee) {
        if (!assignee) {
            return null;
        }

        return {
            id: assignee.employee?.id ?? assignee.employee_id,
            name: assignee.employee?.name ?? null,
            avatar: assignee.employee?.avatar ?? null,
            phone: assignee.employee?.phone ?? null,
        };
    }

    private async attachPrimaryAssignees<T extends Record<string, unknown>>(
        rows: T[],
    ): Promise<T[]> {
        const projectIds = rows
            .map((row) => typeof row.id === "string" ? row.id : null)
            .filter((item): item is string => Boolean(item));

        if (projectIds.length === 0) {
            return rows;
        }

        const assigneeIndex = this.buildAssigneeIndex(
            await projectMemberService.listPrimaryAssigneesByProjectIds(projectIds),
        );

        return rows.map((row) => {
            if (typeof row.id !== "string") {
                return row;
            }

            const assignees = assigneeIndex.get(row.id) || {};
            return {
                ...row,
                designer: this.serializeAssignee(assignees.designer),
                supervisor: this.serializeAssignee(assignees.supervisor),
            };
        });
    }

    private async attachPrimaryAssigneesToProject<T extends Record<string, unknown> | null>(
        row: T,
    ): Promise<T> {
        if (!row) {
            return row;
        }

        const [project] = await this.attachPrimaryAssignees([row]);
        return project as T;
    }

    private async loadProjects(input: {
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

    async searchProjectsByName() {
    }

    async listPublicProjects() {
        const now = Date.now();
        if (this.publicProjectsCache && this.publicProjectsCache.expiresAt > now) {
            return this.publicProjectsCache.rows;
        }

        if (!this.publicProjectsInFlight) {
            this.publicProjectsInFlight = projectRepository.listPublicProjects()
                .then((rows) => this.attachPrimaryAssignees(rows))
                .then((rows) => {
                    rows.forEach((row) => this.seedPublicProjectDetailCache(row));
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

    private invalidatePublicProjectsCache() {
        this.publicProjectsCache = null;
        this.publicProjectsInFlight = null;
    }

    private getCachedValue<T>(
        cache: Map<string, CacheEntry<T>>,
        key: string,
    ) {
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

    private setCachedValue<T>(
        cache: Map<string, CacheEntry<T>>,
        key: string,
        value: T,
        ttlMs: number,
    ) {
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

    private seedPublicProjectDetailCache(row: Record<string, unknown>) {
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

    invalidatePublicProjectDetailCache(projectId?: string) {
        if (!projectId) {
            this.publicProjectDetailCache.clear();
            this.publicProjectDetailInFlight.clear();
            return;
        }

        this.publicProjectDetailCache.delete(projectId);
        this.publicProjectDetailInFlight.delete(projectId);
    }

    invalidatePublicProjectLogsCache(projectId?: string) {
        if (!projectId) {
            this.publicProjectLogsCache.clear();
            this.publicProjectLogsInFlight.clear();
            return;
        }

        this.publicProjectLogsCache.delete(projectId);
        this.publicProjectLogsInFlight.delete(projectId);
    }

    invalidatePublicProjectMembersCache(projectId?: string) {
        if (!projectId) {
            this.publicProjectMembersCache.clear();
            this.publicProjectMembersInFlight.clear();
            return;
        }

        this.publicProjectMembersCache.delete(projectId);
        this.publicProjectMembersInFlight.delete(projectId);
    }

    invalidatePublicProjectCache(projectId?: string) {
        this.invalidatePublicProjectDetailCache(projectId);
        this.invalidatePublicProjectLogsCache(projectId);
        this.invalidatePublicProjectMembersCache(projectId);
    }

    async getRequiredPublicProjectVisibility(projectId: string) {
        const project = await projectRepository.findPublicVisibilityById(projectId);
        if (!project || !this.isPublicProjectVisible(project)) {
            throw Errors.notFound("项目不存在");
        }

        return project;
    }

    async getPublicProjectDetail(projectId: string) {
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
            .then((project) => this.attachPrimaryAssigneesToProject(project))
            .then((project) => {
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

    async listPublicProjectLogs(projectId: string) {
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
            .then((rows) => {
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

    async listPublicProjectMembers(projectId: string) {
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
            .then((members) => {
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

    async prewarmPublicProjectDetailData(input?: {
        projects?: Array<Record<string, unknown>>;
        limit?: number;
    }) {
        const projects = input?.projects ?? await this.listPublicProjects();
        const projectIds = projects
            .map((item) => typeof item.id === "string" ? item.id : null)
            .filter((item): item is string => Boolean(item))
            .slice(0, input?.limit ?? PUBLIC_PROJECT_DETAIL_PREWARM_LIMIT);

        await Promise.allSettled(
            projectIds.map(async (projectId) => {
                await this.getPublicProjectDetail(projectId);
                await Promise.allSettled([
                    this.listPublicProjectLogs(projectId),
                    this.listPublicProjectMembers(projectId),
                ]);
            }),
        );
    }

    async listProjectCreateCustomers(input: {
        authContext: AuthContext;
        query: ProjectCreateSelectCustomerQueryType;
    }) {
        const tenantId = accessPolicyService.assertTenantContext(input.authContext);
        accessPolicyService.assertPermission(input.authContext, "project.create");
        const { page, pageSize, keyword } = input.query;
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;
        const result = await projectRepository.listCreateCustomers({
            filters: {
                tenantId,
                keyword,
            },
            from,
            to,
        });

        return {
            rows: result.rows,
            pagination: {
                page,
                pageSize,
                total: result.total,
                totalPages: result.total ? Math.ceil(result.total / pageSize) : 0,
            },
        };
    }

    async listProjectCreateEmployees(input: {
        authContext: AuthContext;
        query: ProjectCreateSelectEmployeeQueryType;
    }) {
        const tenantId = accessPolicyService.assertTenantContext(input.authContext);
        accessPolicyService.assertPermission(input.authContext, "project.create");
        return this.listEmployeeCandidates({
            tenantId,
            query: input.query,
        });
    }

    async listProjectMemberCandidates(input: {
        authContext: AuthContext;
        projectId: string;
        query: ProjectMemberCandidateQueryType;
    }) {
        const tenantId = accessPolicyService.assertTenantContext(input.authContext);
        const hasAccess = await accessPolicyService.canAccessProject(
            input.authContext,
            input.projectId,
            "project.update",
        );
        if (!hasAccess) {
            throw Errors.forbidden();
        }

        return this.listEmployeeCandidates({
            tenantId,
            query: input.query,
        });
    }

    async getProjectDetail(input: {
        authContext: AuthContext;
        projectId: string;
    }) {
        const tenantId = accessPolicyService.assertTenantContext(input.authContext);
        const hasAccess = await accessPolicyService.canAccessProject(
            input.authContext,
            input.projectId,
            "project.read",
        );
        if (!hasAccess) {
            throw Errors.forbidden();
        }

        const project = await projectRepository.findDetailById(
            input.projectId,
            tenantId,
        );
        if (!project) {
            throw Errors.dbError("查询记录不存在");
        }

        return this.attachPrimaryAssigneesToProject(project);
    }

    async getProjectDetailForEmployeeBootstrap(input: {
        authContext: AuthContext;
        projectId: string;
    }) {
        const tenantId = accessPolicyService.assertTenantContext(input.authContext);
        const existing = await projectRepository.findById(input.projectId, tenantId);
        if (!existing) {
            throw Errors.business(
                404,
                "项目不存在",
                ErrorCodes.PROJECT_NOT_FOUND,
            );
        }

        if (!accessPolicyService.hasPermission(input.authContext, "project.read")) {
            throw Errors.business(
                403,
                "无权查看该项目",
                ErrorCodes.PROJECT_ACCESS_DENIED,
            );
        }
        const hasAccess = await accessPolicyService.canAccessProject(
            input.authContext,
            input.projectId,
            "project.read",
        );
        if (!hasAccess) {
            throw Errors.business(
                403,
                "无权查看该项目",
                ErrorCodes.PROJECT_ACCESS_DENIED,
            );
        }

        const project = await projectRepository.findDetailById(
            input.projectId,
            tenantId,
        );
        if (!project) {
            throw Errors.business(
                404,
                "项目不存在",
                ErrorCodes.PROJECT_NOT_FOUND,
            );
        }

        return this.attachPrimaryAssigneesToProject(project);
    }

    async listProjectMembersForDetail(project: Record<string, unknown>) {
        const projectId = typeof project.id === "string" ? project.id : "";
        if (!projectId) {
            return [] as ProjectDetailMembers;
        }

        const members = await projectMemberService.listProjectMembers(projectId);
        const customer = this.normalizeRelation(project.customer, {
            id: null,
            name: null,
            phone: null,
            owner_id: null,
            owner: null,
        });
        const customerOwnerRelation = this.normalizeRelation(customer.owner, {
            id: "",
            name: null,
            avatar: null,
            phone: null,
            department_name: null,
            post_name: null,
        });
        const customerOwner = projectMemberService.buildDerivedCustomerOwnerMember({
            projectId,
            employee: customerOwnerRelation.id ? customerOwnerRelation : null,
        });

        return [
            ...(customerOwner ? [customerOwner] : []),
            ...members,
        ].sort((a, b) => {
            const sortOrderA = a.sort_order ?? 0;
            const sortOrderB = b.sort_order ?? 0;
            if (sortOrderA !== sortOrderB) {
                return sortOrderA - sortOrderB;
            }

            const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
            const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
            if (timeA !== timeB) {
                return timeA - timeB;
            }

            return (a.role_name ?? "").localeCompare(b.role_name ?? "", "zh-CN");
        });
    }

    async createProject(input: {
        authContext: AuthContext;
        payload: CreateProjectInput;
    }) {
        const tenantId = accessPolicyService.assertTenantContext(input.authContext);
        accessPolicyService.assertPermission(input.authContext, "project.create");
        await this.assertProjectRelationsInTenant(input.payload, tenantId);

        if (input.payload.customer_id && input.payload.property_id) {
            const existingProject = await projectRepository.findActiveByCustomerProperty({
                customerId: input.payload.customer_id,
                propertyId: input.payload.property_id,
                tenantId,
            });
            if (existingProject) {
                return existingProject;
            }
        }

        const project = await projectRepository.create({
            ...input.payload,
            tenant_id: tenantId,
        });
        this.invalidatePublicProjectsCache();
        this.invalidatePublicProjectCache(String(project.id));

        return project;
    }

    async updateProject(
        id: string,
        input: UpdateProjectInput,
        tenantId: string,
    ) {
        const existing = await projectRepository.findById(id, tenantId);

        if (!existing) {
            throw Errors.badRequest("项目不存在");
        }

        const nextStatus = input.status ?? existing.status;
        const nextSignedAmount = input.signed_amount ?? existing.signed_amount;

        if (nextStatus === "signed") {
            if (nextSignedAmount == null || Number(nextSignedAmount) <= 0) {
                throw Errors.badRequest("项目签约时必须提供有效的 signed_amount");
            }
        }

        const project = await projectRepository.update(id, input, tenantId);
        this.invalidatePublicProjectsCache();
        this.invalidatePublicProjectCache(id);
        return project;
    }

    async updateProjectForTenant(input: {
        authContext: AuthContext;
        projectId: string;
        payload: UpdateProjectInput;
    }) {
        const tenantId = accessPolicyService.assertTenantContext(input.authContext);
        const hasAccess = await accessPolicyService.canAccessProject(
            input.authContext,
            input.projectId,
            "project.update",
        );
        if (!hasAccess) {
            throw Errors.forbidden();
        }

        await this.assertProjectRelationsInTenant(input.payload, tenantId);
        const existing = await projectRepository.findById(input.projectId, tenantId);
        if (!existing) {
            throw Errors.badRequest("项目不存在");
        }

        const hasStatusChange = Object.prototype.hasOwnProperty.call(
            input.payload,
            "status",
        );
        const transitionPayload = hasStatusChange
            ? projectStatusService.buildTransitionPayloadFromStatus({
                existing,
                nextStatus: input.payload.status,
                signedAmount: input.payload.signed_amount ?? null,
            })
            : null;

        const project = transitionPayload
            ? await projectStatusService.transitionProjectStatus({
                authContext: input.authContext,
                projectId: input.projectId,
                payload: transitionPayload,
                patch: input.payload,
                existing,
            })
            : await this.updateProject(
                input.projectId,
                input.payload,
                tenantId,
            );
        this.invalidatePublicProjectsCache();
        this.invalidatePublicProjectCache(input.projectId);
        this.invalidatePublicProjectMembersCache(input.projectId);

        return project;
    }

    async transitionProjectStatusForTenant(input: {
        authContext: AuthContext;
        projectId: string;
        payload: ProjectStatusTransitionInput;
    }) {
        const project = await projectStatusService.transitionProjectStatus(input);
        this.invalidatePublicProjectsCache();
        this.invalidatePublicProjectCache(input.projectId);
        this.invalidatePublicProjectMembersCache(input.projectId);
        return project;
    }

    async listProjectStatusActionsForTenant(input: {
        authContext: AuthContext;
        projectId: string;
    }) {
        return projectStatusService.listProjectStatusActions(input);
    }

    async listProjectConstructionStagesForTenant(input: {
        authContext: AuthContext;
        projectId: string;
    }) {
        return constructionStageStatusService.listProjectConstructionStages(input);
    }

    async listProjectStatusTransitionsForTenant(input: {
        authContext: AuthContext;
        projectId: string;
        query: ProjectStatusTransitionListQuery;
    }) {
        return projectStatusService.listProjectStatusTransitions(input);
    }

    async deleteProject(id: string, tenantId: string) {
        const existing = await projectRepository.findById(id, tenantId);

        if (!existing) {
            throw Errors.badRequest("项目不存在");
        }

        const project = await projectRepository.update(id, {
            status: "invalid",
        }, tenantId);
        this.invalidatePublicProjectsCache();
        this.invalidatePublicProjectCache(id);
        return project;
    }

    async deleteProjectForTenant(input: {
        authContext: AuthContext;
        projectId: string;
    }) {
        const tenantId = accessPolicyService.assertTenantContext(input.authContext);
        const hasAccess = await accessPolicyService.canAccessProject(
            input.authContext,
            input.projectId,
            "project.delete",
        );
        if (!hasAccess) {
            throw Errors.forbidden();
        }

        return this.deleteProject(input.projectId, tenantId);
    }

    private async assertProjectRelationsInTenant(
        input:
            | Partial<CreateProjectInput>
            | Partial<UpdateProjectInput>,
        tenantId: string,
    ) {
        if (input.customer_id) {
            const customer = await projectRepository.findCustomerInTenant({
                customerId: input.customer_id,
                tenantId,
            });
            if (!customer) {
                throw Errors.badRequest("客户不存在或不属于当前租户");
            }
        }

        if (input.property_id) {
            const property = await projectRepository.findPropertyInTenant({
                propertyId: input.property_id,
                tenantId,
            });
            if (!property) {
                throw Errors.badRequest("房产不存在或不属于当前租户");
            }
        }

    }

    private async listEmployeeCandidates(input: {
        tenantId: string;
        query: ProjectCreateSelectEmployeeQueryType | ProjectMemberCandidateQueryType;
    }) {
        const { page, pageSize, keyword } = input.query;
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;
        const roleCode = "role_code" in input.query ? input.query.role_code : undefined;
        const departmentCodes = "scene" in input.query
            ? PROJECT_CREATE_EMPLOYEE_SCENE_DEPARTMENTS[input.query.scene]
            : roleCode
                ? PROJECT_MEMBER_ROLE_DEPARTMENTS[roleCode]
                : undefined;
        const postIds = roleCode
            ? await projectRepository.listProjectMemberRolePostIds({
                tenantId: input.tenantId,
                roleCode,
            })
            : undefined;

        if (roleCode && postIds?.length === 0) {
            return {
                rows: [],
                pagination: {
                    page,
                    pageSize,
                    total: 0,
                    totalPages: 0,
                },
            };
        }

        const result = await projectRepository.listCreateEmployees({
            filters: {
                tenantId: input.tenantId,
                keyword,
                departmentCodes,
                postIds,
            },
            from,
            to,
        });

        return {
            rows: result.rows,
            pagination: {
                page,
                pageSize,
                total: result.total,
                totalPages: result.total ? Math.ceil(result.total / pageSize) : 0,
            },
        };
    }
}

export const projectSer = new ProjectService();
