import {
    type CacheEntry,
    type EmployeeProjectBootstrapBundle,
    type ProjectListResult,
    type PublicProjectMembers,
    type StaleCacheEntry,
} from "./legacy/shared";
import {
    isPublicProjectVisible,
    normalizeRelation,
    buildAssigneeIndex,
    serializeAssignee,
    attachPrimaryAssignees,
    attachPrimaryAssigneesToProject,
} from "./legacy/base";
import {
    listProjects,
    projectListCacheKey,
    getProjectListCache,
    setProjectListCache,
    loadProjects,
    searchProjectsByName,
} from "./legacy/lists";
import {
    listPublicProjects,
    invalidatePublicProjectsCache,
    getCachedValue,
    setCachedValue,
    seedPublicProjectDetailCache,
    invalidatePublicProjectDetailCache,
    invalidatePublicProjectLogsCache,
    invalidatePublicProjectMembersCache,
    invalidateEmployeeProjectBootstrapCache,
    invalidatePublicProjectCache,
    getRequiredPublicProjectVisibility,
    getPublicProjectDetail,
    listPublicProjectLogs,
    listPublicProjectLogsPage,
    listPublicProjectMembers,
    prewarmPublicProjectDetailData,
} from "./legacy/public-cache";
import {
    listProjectCreateCustomers,
    listProjectCreateEmployees,
    listProjectCreateProperties,
    listProjectMemberCandidates,
    listEmployeeCandidates,
} from "./legacy/create-select";
import {
    getProjectDetail,
    getProjectDetailForEmployeeBootstrap,
    getEmployeeProjectBootstrapBundle,
    canAccessEmployeeBootstrapProject,
    loadEmployeeProjectBootstrapBundle,
    fetchEmployeeProjectBootstrapBundle,
    refreshEmployeeProjectBootstrapBundle,
    getEmployeeProjectBootstrapCache,
    setEmployeeProjectBootstrapCache,
    listProjectStoredMembers,
    serializeProjectStoredMembers,
    buildProjectMembersForDetail,
    listProjectMembersForDetail,
    buildProjectConstructionStagesForBootstrapData,
} from "./legacy/detail-bootstrap";
import {
    createProject,
    updateProject,
    updateProjectForTenant,
    applyProjectWorkflowEffectForTenant,
    listProjectConstructionStagesForTenant,
    deleteProject,
    deleteProjectForTenant,
    assertProjectRelationsInTenant,
} from "./legacy/mutations";

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
    private employeeProjectBootstrapCache = new Map<string, StaleCacheEntry<
        EmployeeProjectBootstrapBundle & { project: Record<string, unknown> }
    >>();
    private employeeProjectBootstrapInFlight = new Map<
        string,
        Promise<EmployeeProjectBootstrapBundle & { project: Record<string, unknown> }>
    >();

    private isPublicProjectVisible = isPublicProjectVisible;
    private normalizeRelation = normalizeRelation;
    private buildAssigneeIndex = buildAssigneeIndex;
    private serializeAssignee = serializeAssignee;
    private attachPrimaryAssignees = attachPrimaryAssignees;
    private attachPrimaryAssigneesToProject = attachPrimaryAssigneesToProject;
    listProjects = listProjects;
    private projectListCacheKey = projectListCacheKey;
    private getProjectListCache = getProjectListCache;
    private setProjectListCache = setProjectListCache;
    private loadProjects = loadProjects;
    searchProjectsByName = searchProjectsByName;
    listPublicProjects = listPublicProjects;
    private invalidatePublicProjectsCache = invalidatePublicProjectsCache;
    private getCachedValue = getCachedValue;
    private setCachedValue = setCachedValue;
    private seedPublicProjectDetailCache = seedPublicProjectDetailCache;
    invalidatePublicProjectDetailCache = invalidatePublicProjectDetailCache;
    invalidatePublicProjectLogsCache = invalidatePublicProjectLogsCache;
    invalidatePublicProjectMembersCache = invalidatePublicProjectMembersCache;
    invalidateEmployeeProjectBootstrapCache = invalidateEmployeeProjectBootstrapCache;
    invalidatePublicProjectCache = invalidatePublicProjectCache;
    getRequiredPublicProjectVisibility = getRequiredPublicProjectVisibility;
    getPublicProjectDetail = getPublicProjectDetail;
    listPublicProjectLogs = listPublicProjectLogs;
    listPublicProjectLogsPage = listPublicProjectLogsPage;
    listPublicProjectMembers = listPublicProjectMembers;
    prewarmPublicProjectDetailData = prewarmPublicProjectDetailData;
    listProjectCreateCustomers = listProjectCreateCustomers;
    listProjectCreateProperties = listProjectCreateProperties;
    listProjectCreateEmployees = listProjectCreateEmployees;
    listProjectMemberCandidates = listProjectMemberCandidates;
    private listEmployeeCandidates = listEmployeeCandidates;
    getProjectDetail = getProjectDetail;
    getProjectDetailForEmployeeBootstrap = getProjectDetailForEmployeeBootstrap;
    getEmployeeProjectBootstrapBundle = getEmployeeProjectBootstrapBundle;
    private canAccessEmployeeBootstrapProject = canAccessEmployeeBootstrapProject;
    private loadEmployeeProjectBootstrapBundle = loadEmployeeProjectBootstrapBundle;
    private fetchEmployeeProjectBootstrapBundle = fetchEmployeeProjectBootstrapBundle;
    private refreshEmployeeProjectBootstrapBundle = refreshEmployeeProjectBootstrapBundle;
    private getEmployeeProjectBootstrapCache = getEmployeeProjectBootstrapCache;
    private setEmployeeProjectBootstrapCache = setEmployeeProjectBootstrapCache;
    listProjectStoredMembers = listProjectStoredMembers;
    serializeProjectStoredMembers = serializeProjectStoredMembers;
    buildProjectMembersForDetail = buildProjectMembersForDetail;
    listProjectMembersForDetail = listProjectMembersForDetail;
    buildProjectConstructionStagesForBootstrapData = buildProjectConstructionStagesForBootstrapData;
    createProject = createProject;
    updateProject = updateProject;
    updateProjectForTenant = updateProjectForTenant;
    applyProjectWorkflowEffectForTenant = applyProjectWorkflowEffectForTenant;
    listProjectConstructionStagesForTenant = listProjectConstructionStagesForTenant;
    deleteProject = deleteProject;
    deleteProjectForTenant = deleteProjectForTenant;
    private assertProjectRelationsInTenant = assertProjectRelationsInTenant;
}

export const projectSer = new ProjectService();
