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
    type UpdateProjectInput,
} from "./shared";
import {
    appendProjectDisplayStatus,
    attachProjectDisplayStatuses,
    listFinalAcceptanceCompletedProjectIds,
} from "./display-status";
import {
    projectWorkflowProgressService,
    type ProjectWorkflowProgress,
} from "@/services/project-workflow-progress";
import {
    canAccessProjectByProcedureAssignment,
} from "@/services/project-procedure-assignments/project-access";

export async function getProjectDetail(this: any, input: {
    authContext: AuthContext;
    projectId: string;
}): Promise<Record<string, unknown>> {
    const tenantId = accessPolicyService.assertTenantContext(input.authContext);
    const hasAccess = await accessPolicyService.canAccessProject(
        input.authContext,
        input.projectId,
        "project.read",
    );
    if (!hasAccess) {
        throw Errors.forbidden();
    }

    const projectPromise = projectRepository.findDetailById(
        input.projectId,
        tenantId,
    );
    const primaryAssigneesPromise = projectMemberService.listPrimaryAssigneesByProjectIds([
        input.projectId,
    ]);
    const storedMembersPromise = this.listProjectStoredMembers(input.projectId);
    const completedProjectIdsPromise = listFinalAcceptanceCompletedProjectIds({
        tenantId,
        projectIds: [input.projectId],
    });
    const project = await projectPromise;
    if (!project) {
        throw Errors.dbError("查询记录不存在");
    }

    const primaryAssignees = await primaryAssigneesPromise;
    const assigneeIndex = this.buildAssigneeIndex(primaryAssignees);
    const assignees = assigneeIndex.get(input.projectId) || {};
    const projectWithDisplayStatus = appendProjectDisplayStatus(
        project,
        await completedProjectIdsPromise,
    );
    const detail = {
        ...projectWithDisplayStatus,
        designer: this.serializeAssignee(assignees.designer),
        supervisor: this.serializeAssignee(assignees.supervisor),
    };
    return {
        ...detail,
        __detail_members: this.buildProjectMembersForDetail(detail, await storedMembersPromise),
    };
}

export async function getProjectDetailForEmployeeBootstrap(this: any, input: {
    authContext: AuthContext;
    projectId: string;
}): Promise<Record<string, unknown>> {
    const tenantId = accessPolicyService.assertTenantContext(input.authContext);
    if (!accessPolicyService.hasPermission(input.authContext, "project.read")) {
        throw Errors.business(
            403,
            "无权查看该项目",
            ErrorCodes.PROJECT_ACCESS_DENIED,
        );
    }

    const project = await projectRepository.findEmployeeBootstrapDetailById(
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
    if (accessPolicyService.getScope(input.authContext, "project.read") !== "all") {
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
    }

    const projectWithAssignees = await this.attachPrimaryAssigneesToProject(project);
    const [projectWithDisplayStatus] = await attachProjectDisplayStatuses({
        rows: [projectWithAssignees],
        tenantId,
    });

    return projectWithDisplayStatus ?? projectWithAssignees;
}

export async function getEmployeeProjectBootstrapBundle(this: any, input: {
    authContext: AuthContext;
    projectId: string;
    logPageSize: number;
}): Promise<EmployeeProjectBootstrapBundle & { project: Record<string, unknown> }> {
    const tenantId = accessPolicyService.assertTenantContext(input.authContext);
    if (!accessPolicyService.hasPermission(input.authContext, "project.read")) {
        throw Errors.business(
            403,
            "无权查看该项目",
            ErrorCodes.PROJECT_ACCESS_DENIED,
        );
    }

    const bundle = await this.loadEmployeeProjectBootstrapBundle({
        projectId: input.projectId,
        tenantId,
        logPageSize: input.logPageSize,
    });
    if (!bundle.project) {
        throw Errors.business(
            404,
            "项目不存在",
            ErrorCodes.PROJECT_NOT_FOUND,
        );
    }

    if (accessPolicyService.getScope(input.authContext, "project.read") !== "all") {
        const localAccess = this.canAccessEmployeeBootstrapProject({
            authContext: input.authContext,
            project: bundle.project,
            members: bundle.members,
            permissionCode: "project.read",
        });
        const hasProcedureAssignmentAccess =
            await canAccessProjectByProcedureAssignment({
                authContext: input.authContext,
                projectId: input.projectId,
            });
        const hasAccess = Boolean(localAccess) ||
            hasProcedureAssignmentAccess ||
            (localAccess === null
                ? await accessPolicyService.canAccessProject(
                    input.authContext,
                    input.projectId,
                    "project.read",
                )
                : false);
        if (!hasAccess) {
            throw Errors.business(
                403,
                "无权查看该项目",
                ErrorCodes.PROJECT_ACCESS_DENIED,
            );
        }
    }

    return {
        ...bundle,
        project: bundle.project as Record<string, unknown>,
    };
}

export function canAccessEmployeeBootstrapProject(this: any, input: {
    authContext: AuthContext;
    project: Record<string, unknown> | null;
    members: Array<Record<string, unknown>>;
    permissionCode: string;
}) {
    const scope = accessPolicyService.getScope(
        input.authContext,
        input.permissionCode,
    );
    if (!scope || !input.authContext.employeeId || !input.project) {
        return false;
    }

    if (scope === "all") {
        return true;
    }

    if (scope === "department" && input.authContext.tenantDepartmentId) {
        if (input.members.some((member) => {
            const employee = this.normalizeRelation(member.employee, {
                tenant_department: null,
            });
            const tenantDepartment = this.normalizeRelation(
                employee.tenant_department,
                { id: null },
            );
            return tenantDepartment.id === input.authContext.tenantDepartmentId;
        })) {
            return true;
        }

        return null;
    }

    if (input.members.some((member) =>
        member.employee_id === input.authContext.employeeId &&
        !member.deleted_at
    )) {
        return true;
    }

    const customer = this.normalizeRelation(input.project.customer, {
        owner_id: null,
    });
    return customer.owner_id === input.authContext.employeeId;
}

export async function loadEmployeeProjectBootstrapBundle(this: any, input: {
    projectId: string;
    tenantId: string;
    logPageSize: number;
}): Promise<EmployeeProjectBootstrapBundle & { project: Record<string, unknown> }> {
    const cacheKey = JSON.stringify(input);
    const cached = this.getEmployeeProjectBootstrapCache(cacheKey);
    if (cached) {
        if (cached.stale) {
            void this.refreshEmployeeProjectBootstrapBundle(cacheKey, input);
        }

        return cached.value;
    }

    const inFlight = this.employeeProjectBootstrapInFlight.get(cacheKey);
    if (inFlight) {
        return inFlight;
    }

    const request = this.fetchEmployeeProjectBootstrapBundle(input)
        .finally(() => {
            if (this.employeeProjectBootstrapInFlight.get(cacheKey) === request) {
                this.employeeProjectBootstrapInFlight.delete(cacheKey);
            }
        });

    this.employeeProjectBootstrapInFlight.set(cacheKey, request);
    return request;
}

export async function fetchEmployeeProjectBootstrapBundle(this: any, input: {
    projectId: string;
    tenantId: string;
    logPageSize: number;
}): Promise<EmployeeProjectBootstrapBundle & { project: Record<string, unknown> }> {
    const bundle = await projectRepository.getEmployeeBootstrapBundle({
        projectId: input.projectId,
        tenantId: input.tenantId,
        logLimit: input.logPageSize,
    });
    if (!bundle.project) {
        return bundle as EmployeeProjectBootstrapBundle & {
            project: Record<string, unknown>;
        };
    }

    const value = {
        ...bundle,
        project: bundle.project,
    };
    this.setEmployeeProjectBootstrapCache(JSON.stringify(input), value);
    return value;
}

export function refreshEmployeeProjectBootstrapBundle(this: any,
    cacheKey: string,
    input: {
        projectId: string;
        tenantId: string;
        logPageSize: number;
    },
): Promise<EmployeeProjectBootstrapBundle & { project: Record<string, unknown> }> | undefined {
    if (this.employeeProjectBootstrapInFlight.has(cacheKey)) {
        return this.employeeProjectBootstrapInFlight.get(cacheKey);
    }

    const request = this.fetchEmployeeProjectBootstrapBundle(input)
        .finally(() => {
            if (this.employeeProjectBootstrapInFlight.get(cacheKey) === request) {
                this.employeeProjectBootstrapInFlight.delete(cacheKey);
            }
        });
    this.employeeProjectBootstrapInFlight.set(cacheKey, request);
    return request;
}

export function getEmployeeProjectBootstrapCache(this: any, cacheKey: string): {
    value: EmployeeProjectBootstrapBundle & { project: Record<string, unknown> };
    stale: boolean;
} | null {
    const cached = this.employeeProjectBootstrapCache.get(cacheKey);
    if (!cached) {
        return null;
    }

    if (cached.expiresAt <= Date.now()) {
        this.employeeProjectBootstrapCache.delete(cacheKey);
        this.employeeProjectBootstrapInFlight.delete(cacheKey);
        return null;
    }

    return {
        value: cached.value,
        stale: cached.staleAt <= Date.now(),
    };
}

export function setEmployeeProjectBootstrapCache(this: any,
    cacheKey: string,
    value: EmployeeProjectBootstrapBundle & { project: Record<string, unknown> },
) {
    const now = Date.now();
    if (this.employeeProjectBootstrapCache.size >= 500) {
        for (const [key, item] of this.employeeProjectBootstrapCache.entries()) {
            if (item.expiresAt <= now) {
                this.employeeProjectBootstrapCache.delete(key);
            }
        }

        if (this.employeeProjectBootstrapCache.size >= 500) {
            this.employeeProjectBootstrapCache.clear();
        }
    }

    this.employeeProjectBootstrapCache.set(cacheKey, {
        expiresAt: now + EMPLOYEE_PROJECT_BOOTSTRAP_STALE_TTL_MS,
        staleAt: now + EMPLOYEE_PROJECT_BOOTSTRAP_CACHE_TTL_MS,
        value,
    });
}

export async function listProjectStoredMembers(this: any, projectId: string): Promise<ProjectDetailMembers> {
    if (!projectId) {
        return [] as ProjectDetailMembers;
    }

    return projectMemberService.listProjectMembers(projectId);
}

export function serializeProjectStoredMembers(this: any, rows: Array<Record<string, unknown>>): ProjectDetailMembers {
    return projectMemberService.serializeProjectMemberRows(rows.map((item) => ({
        id: String(item.id ?? ""),
        project_id: String(item.project_id ?? ""),
        employee_id: String(item.employee_id ?? ""),
        role_code: String(item.role_code ?? ""),
        role_name: typeof item.role_name === "string" ? item.role_name : null,
        is_primary: typeof item.is_primary === "boolean" ? item.is_primary : null,
        sort_order: typeof item.sort_order === "number" ? item.sort_order : null,
        created_at: typeof item.created_at === "string" ? item.created_at : null,
        updated_at: typeof item.updated_at === "string" ? item.updated_at : null,
        deleted_at: typeof item.deleted_at === "string" ? item.deleted_at : null,
        employee: item.employee,
    })));
}

export function buildProjectMembersForDetail(this: any,
    project: Record<string, unknown>,
    members: ProjectDetailMembers,
): ProjectDetailMembers {
    const projectId = typeof project.id === "string" ? project.id : "";
    if (!projectId) {
        return [] as ProjectDetailMembers;
    }

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

export async function listProjectMembersForDetail(this: any, project: Record<string, unknown>): Promise<ProjectDetailMembers> {
    const projectId = typeof project.id === "string" ? project.id : "";
    const members = await this.listProjectStoredMembers(projectId);
    return this.buildProjectMembersForDetail(project, members);
}

export async function buildProjectConstructionStagesForBootstrapData(this: any, input: {
    authContext: AuthContext;
    project: Record<string, unknown>;
    acceptanceRows: Array<Record<string, unknown>>;
    logStageRows: Array<Record<string, unknown>>;
    latestLogRows: Array<Record<string, unknown>>;
    canReadAcceptance: boolean;
    canCreateAcceptance: boolean;
    canManageAcceptance: boolean;
    workflowProgress?: ProjectWorkflowProgress | null;
}) {
    const projectId = typeof input.project.id === "string" ? input.project.id : "";
    const tenantId = typeof input.project.tenant_id === "string"
        ? input.project.tenant_id
        : input.authContext.tenantId;
    const workflowProgress = input.workflowProgress ?? (tenantId && projectId
        ? await projectWorkflowProgressService.getProjectProgress({
            tenantId,
            projectId,
        })
        : null);

    return constructionStageStatusService.buildProjectConstructionStagesFromRows({
        authContext: input.authContext,
        project: {
            id: projectId,
            tenant_id: typeof input.project.tenant_id === "string"
                ? input.project.tenant_id
                : null,
            name: typeof input.project.name === "string" ? input.project.name : null,
            customer_id: typeof input.project.customer_id === "string"
                ? input.project.customer_id
                : null,
            status: typeof input.project.status === "string" ? input.project.status : null,
        },
        acceptanceRows: input.acceptanceRows as never,
        logRows: input.logStageRows as never,
        latestLogRows: input.latestLogRows as never,
        canReadAcceptance: input.canReadAcceptance,
        canCreateAcceptance: input.canCreateAcceptance,
        canManageAcceptance: input.canManageAcceptance,
        workflowProgress,
        sourceMode: "workflow_runtime",
    });
}
