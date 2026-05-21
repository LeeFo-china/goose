import {
    type CreateProjectInput,
    type ProjectListQuery,
    type UpdateProjectInput,
} from "@/schema/projects";
import type {
    ProjectCreateSelectCustomerQueryType,
    ProjectCreateSelectEmployeeQueryType,
    ProjectMemberCandidateQueryType,
} from "@/schema/project-create-select";
import { Errors } from "@/errors/error-factory";
import { projectRepository } from "@/repositories/projects";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import { projectMemberService } from "@/services/project-members";

const PUBLIC_PROJECTS_CACHE_TTL_MS = 60_000;
const PROJECT_LIST_CACHE_TTL_MS = 10_000;

type ProjectListResult = {
    rows: Array<Record<string, unknown>>;
    pagination: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
    };
};

class ProjectService {
    private publicProjectVisibleStatuses = ["signed", "constructing", "completed"] as const;
    private publicProjectsCache: {
        expiresAt: number;
        rows: Array<Record<string, unknown>>;
    } | null = null;
    private publicProjectsInFlight: Promise<Array<Record<string, unknown>>> | null = null;
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

    async listProjects(input: {
        authContext: AuthContext;
        query: ProjectListQuery;
    }) {
        const tenantId = accessPolicyService.assertTenantContext(input.authContext);
        const cacheKey = this.projectListCacheKey(input.authContext, input.query);
        const cached = this.getProjectListCache(cacheKey);
        if (cached) {
            return cached;
        }

        const inFlight = this.projectListInFlight.get(cacheKey);
        if (inFlight) {
            return inFlight;
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

    private async loadProjects(input: {
        tenantId: string;
        authContext: AuthContext;
        query: ProjectListQuery;
    }): Promise<ProjectListResult> {
        const tenantId = input.tenantId;
        const { page, pageSize, status, keyword, work_scope: workScope, mode } = input.query;
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;
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
        const filters = {
            tenantId,
            visibleProjectIds,
            status,
            keyword: keyword?.trim(),
            projectIds: todayProjectIds,
        };
        if (mode === "home") {
            const rowsWithLookahead = await projectRepository.listRows({
                filters,
                from,
                to: from + pageSize,
            });
            const rows = rowsWithLookahead.slice(0, pageSize);
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
            };
        }

        const [total, rows] = await Promise.all([
            projectRepository.count(filters),
            projectRepository.listRows({ filters, from, to }),
        ]);

        return {
            rows: from >= total ? [] : rows,
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
                .then((rows) => {
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

    async getRequiredPublicProjectVisibility(projectId: string) {
        const project = await projectRepository.findPublicVisibilityById(projectId);
        if (!project || !this.isPublicProjectVisible(project)) {
            throw Errors.notFound("项目不存在");
        }

        return project;
    }

    async getPublicProjectDetail(projectId: string) {
        const project = await projectRepository.findPublicDetailById(projectId);
        if (!project || !this.isPublicProjectVisible(project)) {
            throw Errors.notFound("项目不存在");
        }

        return project;
    }

    async listPublicProjectLogs(projectId: string) {
        await this.getRequiredPublicProjectVisibility(projectId);
        return projectRepository.listPublicProjectLogs(projectId);
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

        return project;
    }

    async createProject(input: {
        authContext: AuthContext;
        payload: CreateProjectInput;
    }) {
        const tenantId = accessPolicyService.assertTenantContext(input.authContext);
        accessPolicyService.assertPermission(input.authContext, "project.create");
        await this.assertProjectRelationsInTenant(input.payload, tenantId);

        const project = await projectRepository.create({
            ...input.payload,
            tenant_id: tenantId,
        });
        await projectMemberService.createInitialLegacyProjectMembers(
            String(project.id),
            {
                designer_id: input.payload.designer_id,
                supervisor_id: input.payload.supervisor_id,
            },
            tenantId,
        );
        this.invalidatePublicProjectsCache();

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
        const project = await this.updateProject(
            input.projectId,
            input.payload,
            tenantId,
        );
        await projectMemberService.syncLegacyProjectMembers(input.projectId, {
            designer_id: input.payload.designer_id,
            supervisor_id: input.payload.supervisor_id,
        }, tenantId);

        return project;
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

        const employeeIds = [input.designer_id, input.supervisor_id]
            .filter((item): item is string => Boolean(item));
        const uniqueEmployeeIds = Array.from(new Set(employeeIds));
        const employeeCount = await projectRepository.countEmployeesInTenant({
            employeeIds: uniqueEmployeeIds,
            tenantId,
        });
        if (employeeCount !== uniqueEmployeeIds.length) {
            throw Errors.badRequest("设计师或监理不存在或不属于当前租户");
        }
    }

    private async listEmployeeCandidates(input: {
        tenantId: string;
        query: ProjectCreateSelectEmployeeQueryType | ProjectMemberCandidateQueryType;
    }) {
        const { page, pageSize, keyword } = input.query;
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;
        const result = await projectRepository.listCreateEmployees({
            filters: {
                tenantId: input.tenantId,
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
}

export const projectSer = new ProjectService();
