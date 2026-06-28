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
import { attachCurrentConstructionStages } from "./current-stage";
import { attachProjectDisplayStatuses } from "./display-status";
import {
    attachProjectWorkflowSummaries,
    type ProjectWorkflowSummaryMode,
} from "./workflow-summary";
import {
    mergeProjectListEnrichmentRows,
    mergeProjectListWorkflowRows,
} from "./list-enrichment-rows";
import { workflowSubjectStateRepository } from "@/repositories/workflow-subject-states";

export async function listProjects(this: any, input: {
    authContext: AuthContext;
    query: ProjectListQuery;
}): Promise<ProjectListResult> {
    const tenantId = accessPolicyService.assertTenantContext(input.authContext);
    const workflowSummaryMode = resolveProjectWorkflowSummaryMode(
        input.query.workflow_summary,
    );
    const cacheKey = this.projectListCacheKey(input.authContext, input.query);
    const cached = this.getProjectListCache(cacheKey);
    if (cached) {
        return attachLiveWorkflowSummaries({
            result: {
                ...cached,
                debugTimings: {
                    cache: "hit",
                },
            },
            tenantId,
            authContext: input.authContext,
            workflowSummaryMode,
        });
    }

    const inFlight = this.projectListInFlight.get(cacheKey);
    if (inFlight) {
        return inFlight.then((result: ProjectListResult) =>
            attachLiveWorkflowSummaries({
                result: {
                    ...result,
                    debugTimings: {
                        ...result.debugTimings,
                        cache: "in_flight",
                    },
                },
                tenantId,
                authContext: input.authContext,
                workflowSummaryMode,
            })
        );
    }

    const loadStartedAt = Date.now();
    const rawRequest = this.loadProjects({ tenantId, ...input });
    const request = rawRequest
        .then((result: ProjectListResult) =>
            attachProjectListBaseResult({
                result,
                tenantId,
                projectService: this,
                startedAt: loadStartedAt,
            })
        )
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
    if (workflowSummaryMode === "list") {
        return rawRequest.then(async (rawResult: ProjectListResult) => {
            const [baseResult, workflowResult] = await Promise.all([
                request,
                attachLiveWorkflowSummaries({
                    result: rawResult,
                    tenantId,
                    authContext: input.authContext,
                    workflowSummaryMode,
                }),
            ]);

            return mergeProjectListResultWithWorkflowSummary({
                baseResult,
                workflowResult,
                startedAt: loadStartedAt,
            });
        });
    }

    return request.then((result: ProjectListResult) =>
        attachLiveWorkflowSummaries({
            result,
            tenantId,
            authContext: input.authContext,
            workflowSummaryMode,
        })
    );
}

async function attachLiveWorkflowSummaries(input: {
    result: ProjectListResult;
    tenantId: string;
    authContext: AuthContext;
    workflowSummaryMode: ProjectWorkflowSummaryMode;
}): Promise<ProjectListResult> {
    const startedAt = Date.now();
    const rows = await attachProjectWorkflowSummaries({
        rows: input.result.rows,
        tenantId: input.tenantId,
        authContext: input.authContext,
        workflowSummaryMode: input.workflowSummaryMode,
    });

    const workflowSummaryMs = Date.now() - startedAt;
    const baseTotalMs = typeof input.result.debugTimings?.totalMs === "number"
        ? input.result.debugTimings.totalMs
        : null;

    return {
        ...input.result,
        rows,
        debugTimings: {
            ...input.result.debugTimings,
            workflowSummaryMs,
            totalMs: baseTotalMs === null
                ? workflowSummaryMs
                : baseTotalMs + workflowSummaryMs,
        },
    };
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
        workflow_group_key: query.workflow_group_key ?? null,
        workflow_node_key: query.workflow_node_key ?? null,
        workflow_instance_status: query.workflow_instance_status ?? null,
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

function resolveProjectWorkflowSummaryMode(
    value: ProjectListQuery["workflow_summary"],
): ProjectWorkflowSummaryMode {
    if (value === "list" || value === "compact") return value;
    return "full";
}

export async function loadProjects(this: any, input: {
    tenantId: string;
    authContext: AuthContext;
    query: ProjectListQuery;
}): Promise<ProjectListResult> {
    const startedAt = Date.now();
    const tenantId = input.tenantId;
    const {
        page,
        pageSize,
        status,
        keyword,
        work_scope: workScope,
        mode,
        workflow_group_key: workflowGroupKey,
        workflow_node_key: workflowNodeKey,
        workflow_instance_status: workflowInstanceStatus,
    } = input.query;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const scopeStartedAt = Date.now();
    const hasWorkflowFilters = Boolean(
        workflowGroupKey || workflowNodeKey || workflowInstanceStatus,
    );
    let workflowFiltersDurationMs: number | null = null;
    const workflowProjectIdsPromise = hasWorkflowFilters
        ? (async () => {
            const workflowFiltersStartedAt = Date.now();
            try {
                return await workflowSubjectStateRepository.listProjectIdsByWorkflowFilters({
                    tenantId,
                    workflowGroupKey,
                    workflowNodeKey,
                    workflowInstanceStatus,
                });
            } finally {
                workflowFiltersDurationMs = Date.now() - workflowFiltersStartedAt;
            }
        })()
        : Promise.resolve(null);
    const [visibleProjectIds, todayProjectIds, workflowProjectIds] = await Promise.all([
        accessPolicyService.getVisibleProjectIdsByOwnership(
            input.authContext,
            "project.read",
            input.query.ownership,
        ),
        workScope === "today"
            ? projectRepository.listTodayWorkProjectIds(tenantId)
            : Promise.resolve(null),
        workflowProjectIdsPromise,
    ]);
    const scopeDurationMs = Date.now() - scopeStartedAt;
    const filters = {
        tenantId,
        visibleProjectIds,
        status,
        keyword: keyword?.trim(),
        projectIds: intersectProjectIdFilters(todayProjectIds, workflowProjectIds),
    };
    if (mode === "home") {
        const rowsStartedAt = Date.now();
        const rowsWithLookahead = await projectRepository.listRows({
            filters,
            from,
            to: from + pageSize,
        });
        const rowsDurationMs = Date.now() - rowsStartedAt;
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
            debugTimings: {
                cache: "miss",
                scopeMs: scopeDurationMs,
                workflowFiltersMs: workflowFiltersDurationMs,
                rowsMs: rowsDurationMs,
                assigneesMs: null,
                stagesMs: null,
                displayStatusMs: null,
                totalMs: Date.now() - startedAt,
                visibleProjectCount: visibleProjectIds?.length ?? null,
                todayProjectCount: todayProjectIds?.length ?? null,
                workflowProjectCount: workflowProjectIds?.length ?? null,
                rowCount: rows.length,
                hasMore: hasMore ? 1 : 0,
            },
        };
    }

    const rowsStartedAt = Date.now();
    const [total, rawRows] = await Promise.all([
        projectRepository.count(filters),
        projectRepository.listRows({ filters, from, to }),
    ]);
    const rowsDurationMs = Date.now() - rowsStartedAt;
    const rows = from >= total ? [] : rawRows;

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
            workflowFiltersMs: workflowFiltersDurationMs,
            rowsMs: rowsDurationMs,
            assigneesMs: null,
            stagesMs: null,
            displayStatusMs: null,
            totalMs: Date.now() - startedAt,
            visibleProjectCount: visibleProjectIds?.length ?? null,
            todayProjectCount: todayProjectIds?.length ?? null,
            workflowProjectCount: workflowProjectIds?.length ?? null,
            rowCount: rows.length,
            hasMore: null,
        },
    };
}

export async function searchProjectsByName(this: any): Promise<void> {
}

async function attachProjectListBaseResult(input: {
    result: ProjectListResult;
    tenantId: string;
    projectService: {
        attachPrimaryAssignees: (
            rows: Array<Record<string, unknown>>,
        ) => Promise<Array<Record<string, unknown>>>;
    };
    startedAt: number;
}): Promise<ProjectListResult> {
    const enrichment = await attachProjectListBaseEnrichments({
        rows: input.result.rows,
        tenantId: input.tenantId,
        projectService: input.projectService,
    });

    return {
        ...input.result,
        rows: enrichment.rows,
        debugTimings: {
            ...input.result.debugTimings,
            assigneesMs: enrichment.assigneesMs,
            stagesMs: enrichment.stagesMs,
            displayStatusMs: enrichment.displayStatusMs,
            totalMs: Date.now() - input.startedAt,
        },
    };
}

function mergeProjectListResultWithWorkflowSummary(input: {
    baseResult: ProjectListResult;
    workflowResult: ProjectListResult;
    startedAt: number;
}): ProjectListResult {
    return {
        ...input.baseResult,
        rows: mergeProjectListWorkflowRows({
            baseRows: input.baseResult.rows,
            workflowRows: input.workflowResult.rows,
        }),
        debugTimings: {
            ...input.baseResult.debugTimings,
            workflowSummaryMs: typeof input.workflowResult.debugTimings?.workflowSummaryMs === "number"
                ? input.workflowResult.debugTimings.workflowSummaryMs
                : null,
            totalMs: Date.now() - input.startedAt,
        },
    };
}

async function attachProjectListBaseEnrichments(input: {
    rows: Array<Record<string, unknown>>;
    tenantId: string;
    projectService: {
        attachPrimaryAssignees: (
            rows: Array<Record<string, unknown>>,
        ) => Promise<Array<Record<string, unknown>>>;
    };
}) {
    let assigneesMs = 0;
    let stagesMs = 0;
    let displayStatusMs = 0;

    const assigneesPromise = measureProjectListEnrichment(
        (durationMs) => {
            assigneesMs = durationMs;
        },
        () => input.projectService.attachPrimaryAssignees(input.rows),
    );
    const stagesPromise = measureProjectListEnrichment(
        (durationMs) => {
            stagesMs = durationMs;
        },
        () => attachCurrentConstructionStages({
            rows: input.rows,
            tenantId: input.tenantId,
        }),
    );
    const displayStatusPromise = measureProjectListEnrichment(
        (durationMs) => {
            displayStatusMs = durationMs;
        },
        () => attachProjectDisplayStatuses({
            rows: input.rows,
            tenantId: input.tenantId,
        }),
    );
    const [assigneeRows, stageRows, displayStatusRows] = await Promise.all([
        assigneesPromise,
        stagesPromise,
        displayStatusPromise,
    ]);

    return {
        rows: mergeProjectListEnrichmentRows({
            baseRows: input.rows,
            assigneeRows,
            stageRows,
            displayStatusRows,
        }),
        assigneesMs,
        stagesMs,
        displayStatusMs,
    };
}

async function measureProjectListEnrichment(
    setDuration: (durationMs: number) => void,
    load: () => Promise<Array<Record<string, unknown>>>,
) {
    const startedAt = Date.now();
    try {
        return await load();
    } finally {
        setDuration(Date.now() - startedAt);
    }
}

function intersectProjectIdFilters(
    left: string[] | null,
    right: string[] | null,
): string[] | null {
    if (left === null) return right;
    if (right === null) return left;

    const rightIds = new Set(right);
    return left.filter((id) => rightIds.has(id));
}
