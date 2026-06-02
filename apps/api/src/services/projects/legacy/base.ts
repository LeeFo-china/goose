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

export function isPublicProjectVisible(this: any, row: Record<string, unknown>) {
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

export function normalizeRelation<T extends Record<string, unknown>>(this: any,
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

export function buildAssigneeIndex(this: any, assignees: ProjectPrimaryAssignee[]) {
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

export function serializeAssignee(this: any, assignee?: ProjectPrimaryAssignee) {
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

export async function attachPrimaryAssignees<T extends Record<string, unknown>>(this: any,
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

export async function attachPrimaryAssigneesToProject<T extends Record<string, unknown> | null>(this: any,
    row: T,
): Promise<T> {
    if (!row) {
        return row;
    }

    const [project] = await this.attachPrimaryAssignees([row]);
    return project as T;
}
