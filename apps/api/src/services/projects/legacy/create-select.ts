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
    type ProjectCreateSelectPropertyQueryType,
    type ProjectDetailMembers,
    type ProjectListQuery,
    type ProjectListResult,
    type ProjectMemberCandidateQueryType,
    type ProjectPrimaryAssignee,
    type ProjectSelectResult,
    type ProjectStatusTransitionInput,
    type ProjectStatusTransitionListQuery,
    type UpdateProjectInput,
} from "./shared";

export async function listProjectCreateCustomers(this: any, input: {
    authContext: AuthContext;
    query: ProjectCreateSelectCustomerQueryType;
}): Promise<ProjectSelectResult> {
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

export async function listProjectCreateProperties(this: any, input: {
    authContext: AuthContext;
    query: ProjectCreateSelectPropertyQueryType;
}): Promise<ProjectSelectResult> {
    const tenantId = accessPolicyService.assertTenantContext(input.authContext);
    accessPolicyService.assertPermission(input.authContext, "project.create");
    const { page, pageSize, keyword, customer_id } = input.query;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const result = await projectRepository.listCreateProperties({
        filters: {
            tenantId,
            customerId: customer_id,
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

export async function listProjectCreateEmployees(this: any, input: {
    authContext: AuthContext;
    query: ProjectCreateSelectEmployeeQueryType;
}): Promise<ProjectSelectResult> {
    const tenantId = accessPolicyService.assertTenantContext(input.authContext);
    accessPolicyService.assertPermission(input.authContext, "project.create");
    return this.listEmployeeCandidates({
        tenantId,
        query: input.query,
    });
}

export async function listProjectMemberCandidates(this: any, input: {
    authContext: AuthContext;
    projectId: string;
    query: ProjectMemberCandidateQueryType;
}): Promise<ProjectSelectResult> {
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

export async function listEmployeeCandidates(this: any, input: {
    tenantId: string;
    query: ProjectCreateSelectEmployeeQueryType | ProjectMemberCandidateQueryType;
}): Promise<ProjectSelectResult> {
    const { page, pageSize, keyword } = input.query;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const roleCode = "role_code" in input.query ? input.query.role_code : undefined;
    const departmentCodes = "scene" in input.query
        ? PROJECT_CREATE_EMPLOYEE_SCENE_DEPARTMENTS[input.query.scene]
        : roleCode
            ? PROJECT_MEMBER_ROLE_CANDIDATE_DEPARTMENTS[roleCode]
            : undefined;

    const result = await projectRepository.listCreateEmployees({
        filters: {
            tenantId: input.tenantId,
            keyword,
            departmentCodes,
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
