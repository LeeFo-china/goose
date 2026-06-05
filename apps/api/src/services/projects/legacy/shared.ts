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
    ProjectCreateSelectPropertyQueryType,
    ProjectMemberCandidateQueryType,
} from "@/schema/project-create-select";
import { Errors } from "@/errors/error-factory";
import { ErrorCodes } from "@/errors/error-codes";
import {
    projectRepository,
    type EmployeeProjectBootstrapBundle,
} from "@/repositories/projects";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import { constructionStageStatusService } from "@/services/construction-stage-status";
import {
    type ProjectPrimaryAssignee,
    projectMemberService,
} from "@/services/project-members";
import { projectStatusService } from "@/services/project-status";
import type { DepartmentCode, ProjectMemberRoleCode } from "@gooes/domain";

export const PUBLIC_PROJECTS_CACHE_TTL_MS = 5 * 60_000;
export const PUBLIC_PROJECT_DETAIL_CACHE_TTL_MS = 5 * 60_000;
export const PUBLIC_PROJECT_LOGS_CACHE_TTL_MS = 5 * 60_000;
export const PUBLIC_PROJECT_MEMBERS_CACHE_TTL_MS = 5 * 60_000;
export const PUBLIC_PROJECT_DETAIL_PREWARM_LIMIT = 3;
export const PROJECT_LIST_CACHE_TTL_MS = 60_000;
export const EMPLOYEE_PROJECT_BOOTSTRAP_CACHE_TTL_MS = 10_000;
export const EMPLOYEE_PROJECT_BOOTSTRAP_STALE_TTL_MS = 5 * 60_000;

export const PROJECT_CREATE_EMPLOYEE_SCENE_DEPARTMENTS: Record<
    ProjectCreateSelectEmployeeScene,
    DepartmentCode[]
> = {
    project_designer: ["DESIGN"],
    project_supervisor: ["PROJECT"],
    project_construction_manager: ["PROJECT"],
};

export const PROJECT_MEMBER_ROLE_CANDIDATE_DEPARTMENTS: Partial<
    Record<ProjectMemberRoleCode, DepartmentCode[]>
> = {
    designer: ["DESIGN"],
    supervisor: ["PROJECT"],
    construction_manager: ["PROJECT"],
};

export type CacheEntry<T> = {
    expiresAt: number;
    value: T;
};

export type StaleCacheEntry<T> = CacheEntry<T> & {
    staleAt: number;
};

export type PublicProjectMembers = Awaited<ReturnType<typeof projectMemberService.listProjectMembers>>;
export type ProjectDetailMembers = Awaited<ReturnType<typeof projectMemberService.listProjectMembers>>;

export type ProjectListResult = {
    rows: Array<Record<string, unknown>>;
    pagination: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
    };
    debugTimings?: Record<string, number | string | null>;
};

export type ProjectSelectResult = {
    rows: Array<Record<string, unknown>>;
    pagination: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
    };
};

export {
    Errors,
    ErrorCodes,
    projectRepository,
    accessPolicyService,
    constructionStageStatusService,
    projectMemberService,
    projectStatusService,
};

export type {
    AuthContext,
    CreateProjectInput,
    ProjectStatusTransitionInput,
    ProjectStatusTransitionListQuery,
    ProjectListQuery,
    UpdateProjectInput,
    ProjectCreateSelectCustomerQueryType,
    ProjectCreateSelectEmployeeQueryType,
    ProjectCreateSelectEmployeeScene,
    ProjectCreateSelectPropertyQueryType,
    ProjectMemberCandidateQueryType,
    EmployeeProjectBootstrapBundle,
    ProjectPrimaryAssignee,
    DepartmentCode,
    ProjectMemberRoleCode,
};
