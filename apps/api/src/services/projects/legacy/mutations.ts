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

export async function createProject(this: any, input: {
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

export async function updateProject(this: any,
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

export async function updateProjectForTenant(this: any, input: {
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

export async function transitionProjectStatusForTenant(this: any, input: {
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

export async function listProjectStatusActionsForTenant(this: any, input: {
    authContext: AuthContext;
    projectId: string;
}) {
    return projectStatusService.listProjectStatusActions(input);
}

export async function listProjectConstructionStagesForTenant(this: any, input: {
    authContext: AuthContext;
    projectId: string;
}) {
    if (input.authContext.employeeId) {
        const bundle = await this.getEmployeeProjectBootstrapBundle({
            authContext: input.authContext,
            projectId: input.projectId,
            logPageSize: 1,
        });
        const [
            canReadAcceptance,
            hasCreateAcceptancePermission,
            canManageAcceptance,
        ] = await Promise.all([
            canAccessKnownProjectByOptionalPermission(this, {
                authContext: input.authContext,
                project: bundle.project,
                members: bundle.members,
                projectId: input.projectId,
                permissionCodes: ["project_acceptance.read", "project_acceptance.manage"],
            }),
            canAccessKnownProjectByOptionalPermission(this, {
                authContext: input.authContext,
                project: bundle.project,
                members: bundle.members,
                projectId: input.projectId,
                permissionCodes: ["project_acceptance.create"],
            }),
            canAccessKnownProjectByOptionalPermission(this, {
                authContext: input.authContext,
                project: bundle.project,
                members: bundle.members,
                projectId: input.projectId,
                permissionCodes: ["project_acceptance.manage"],
            }),
        ]);

        return this.buildProjectConstructionStagesForBootstrapData({
            authContext: input.authContext,
            project: bundle.project,
            acceptanceRows: bundle.acceptance_rows,
            logStageRows: bundle.log_stage_rows,
            latestLogRows: bundle.latest_log_rows,
            canReadAcceptance,
            canCreateAcceptance: canReadAcceptance && hasCreateAcceptancePermission,
            canManageAcceptance,
        });
    }

    return constructionStageStatusService.listProjectConstructionStages(input);
}

async function canAccessKnownProjectByOptionalPermission(projectService: any, input: {
    authContext: AuthContext;
    project: Record<string, unknown>;
    members: Array<Record<string, unknown>>;
    projectId: string;
    permissionCodes: string[];
}) {
    for (const permissionCode of input.permissionCodes) {
        if (!accessPolicyService.hasPermission(input.authContext, permissionCode)) {
            continue;
        }

        const localAccess = projectService.canAccessEmployeeBootstrapProject({
            authContext: input.authContext,
            project: input.project,
            members: input.members,
            permissionCode,
        });
        if (localAccess === true) {
            return true;
        }
        if (localAccess === false) {
            continue;
        }

        if (
            await accessPolicyService.canAccessProject(
                input.authContext,
                input.projectId,
                permissionCode,
            )
        ) {
            return true;
        }
    }

    return false;
}

export async function listProjectStatusTransitionsForTenant(this: any, input: {
    authContext: AuthContext;
    projectId: string;
    query: ProjectStatusTransitionListQuery;
}) {
    return projectStatusService.listProjectStatusTransitions(input);
}

export async function deleteProject(this: any, id: string, tenantId: string) {
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

export async function deleteProjectForTenant(this: any, input: {
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

export async function assertProjectRelationsInTenant(this: any,
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
