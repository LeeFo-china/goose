import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";
import {
    PROJECT_CONSTRUCTION_COMPLETION_STAGE_CODE,
    PROJECT_CONSTRUCTION_STAGE_CODE_VALUES,
    PROJECT_LOG_STAGE_CONFIG,
    ProjectAcceptanceStatusConfig,
    getPreviousProjectConstructionStage,
    isProjectLogStageCode,
    type ProjectAcceptanceStatus,
    type ProjectConstructionStageCode,
    type ProjectConstructionStageStatus,
    type ProjectLogStageCode,
    type ProjectStatus,
} from "@gooes/domain";

type ProjectHomeRow = Record<string, unknown>;

type ProjectStageAcceptanceRow = {
    id: string;
    project_id: string;
    stage_code: string | null;
    status: ProjectAcceptanceStatus;
    reviewed_at: string | null;
    customer_confirmed_at: string | null;
    updated_at: string | null;
    created_at: string | null;
};

type ProjectStageLogRow = {
    project_id: string;
    stage_code: string | null;
};

type CurrentConstructionStage = {
    stage_code: ProjectLogStageCode;
    stage_label: string;
    status: ProjectConstructionStageStatus;
    status_label: string;
    acceptance_status: ProjectAcceptanceStatus | null;
    acceptance_status_label: string | null;
};

const HOME_STAGE_PROJECT_STATUSES = new Set<ProjectStatus>([
    "constructing",
    "acceptance",
]);

const HOME_STAGE_CODES = [
    ...PROJECT_CONSTRUCTION_STAGE_CODE_VALUES,
    PROJECT_CONSTRUCTION_COMPLETION_STAGE_CODE,
] as const;

const CONSTRUCTION_STAGE_STATUS_LABELS: Record<ProjectConstructionStageStatus, string> = {
    locked: "未开始",
    not_started: "未开始",
    in_progress: "进行中",
    pending_acceptance: "待验收",
    rework_required: "需整改",
    accepted: "已验收",
};

export async function attachCurrentConstructionStages(input: {
    rows: ProjectHomeRow[];
    tenantId: string;
}): Promise<ProjectHomeRow[]> {
    const targetProjectIds = input.rows
        .filter((row) => shouldAttachStage(row))
        .map((row) => getProjectId(row))
        .filter((id): id is string => Boolean(id));

    if (targetProjectIds.length === 0) {
        return input.rows;
    }

    const projectIds = [...new Set(targetProjectIds)];
    const [acceptanceRows, logRows] = await Promise.all([
        listHomeProjectAcceptances({
            tenantId: input.tenantId,
            projectIds,
        }),
        listHomeProjectStageLogs({
            tenantId: input.tenantId,
            projectIds,
        }),
    ]);
    const stageMap = buildCurrentStageMap({ projectIds, acceptanceRows, logRows });

    return input.rows.map((row) => {
        if (!shouldAttachStage(row)) {
            return row;
        }

        return appendCurrentStageFields(row, stageMap.get(getProjectId(row) ?? ""));
    });
}

async function listHomeProjectAcceptances(input: {
    tenantId: string;
    projectIds: string[];
}) {
    const { data, error } = await SupabaseDB.getAdminClient()
        .from("project_acceptances")
        .select(`
            id,
            project_id,
            stage_code,
            status,
            reviewed_at,
            customer_confirmed_at,
            updated_at,
            created_at
        `)
        .eq("tenant_id", input.tenantId)
        .in("project_id", input.projectIds)
        .in("stage_code", [...HOME_STAGE_CODES])
        .neq("status", "cancelled")
        .order("created_at", { ascending: false });

    if (error) {
        throw Errors.dbError("查询首页项目阶段验收状态失败", error);
    }

    return (data || []) as ProjectStageAcceptanceRow[];
}

async function listHomeProjectStageLogs(input: {
    tenantId: string;
    projectIds: string[];
}) {
    const { data, error } = await SupabaseDB.getAdminClient()
        .from("project_logs")
        .select("project_id, stage_code")
        .eq("tenant_id", input.tenantId)
        .in("project_id", input.projectIds)
        .in("stage_code", [...HOME_STAGE_CODES]);

    if (error) {
        throw Errors.dbError("查询首页项目施工阶段日志失败", error);
    }

    return (data || []) as ProjectStageLogRow[];
}

function buildCurrentStageMap(input: {
    projectIds: string[];
    acceptanceRows: ProjectStageAcceptanceRow[];
    logRows: ProjectStageLogRow[];
}) {
    const acceptanceMap = groupLatestAcceptances(input.acceptanceRows);
    const logStageMap = groupLogStages(input.logRows);
    const projectIds = new Set([
        ...input.projectIds,
        ...acceptanceMap.keys(),
        ...logStageMap.keys(),
    ]);
    const result = new Map<string, CurrentConstructionStage | null>();

    for (const projectId of projectIds) {
        const stage = resolveCurrentStage({
            acceptanceMap: acceptanceMap.get(projectId) ?? new Map(),
            logStages: logStageMap.get(projectId) ?? new Set(),
        });
        result.set(projectId, stage);
    }

    return result;
}

function groupLatestAcceptances(rows: ProjectStageAcceptanceRow[]) {
    const result = new Map<string, Map<ProjectLogStageCode, ProjectStageAcceptanceRow>>();
    const sortedRows = [...rows].sort(compareAcceptanceRows);

    for (const row of sortedRows) {
        if (!isProjectLogStageCode(row.stage_code)) {
            continue;
        }

        const projectAcceptances = result.get(row.project_id) ?? new Map();
        if (!projectAcceptances.has(row.stage_code)) {
            projectAcceptances.set(row.stage_code, row);
            result.set(row.project_id, projectAcceptances);
        }
    }

    return result;
}

function groupLogStages(rows: ProjectStageLogRow[]) {
    const result = new Map<string, Set<ProjectLogStageCode>>();

    for (const row of rows) {
        if (!isProjectLogStageCode(row.stage_code)) {
            continue;
        }

        const stages = result.get(row.project_id) ?? new Set<ProjectLogStageCode>();
        stages.add(row.stage_code);
        result.set(row.project_id, stages);
    }

    return result;
}

function resolveCurrentStage(input: {
    acceptanceMap: Map<ProjectLogStageCode, ProjectStageAcceptanceRow>;
    logStages: Set<ProjectLogStageCode>;
}): CurrentConstructionStage | null {
    const acceptedStages = new Set(
        [...input.acceptanceMap.values()]
            .filter((item) => item.status === "customer_confirmed")
            .map((item) => item.stage_code)
            .filter((stageCode): stageCode is ProjectLogStageCode =>
                isProjectLogStageCode(stageCode)
            ),
    );
    const constructionStage = PROJECT_CONSTRUCTION_STAGE_CODE_VALUES
        .map((stageCode) => buildCurrentStageItem({
            stageCode,
            acceptance: input.acceptanceMap.get(stageCode),
            hasLog: input.logStages.has(stageCode),
            isBlocked: isStageBlocked(stageCode, acceptedStages),
        }))
        .find((item) => item.status !== "accepted" && item.status !== "locked");

    if (constructionStage) {
        return constructionStage;
    }

    return buildCurrentStageItem({
        stageCode: PROJECT_CONSTRUCTION_COMPLETION_STAGE_CODE,
        acceptance: input.acceptanceMap.get(PROJECT_CONSTRUCTION_COMPLETION_STAGE_CODE),
        hasLog: input.logStages.has(PROJECT_CONSTRUCTION_COMPLETION_STAGE_CODE),
        isBlocked: PROJECT_CONSTRUCTION_STAGE_CODE_VALUES.some(
            (stageCode) => !acceptedStages.has(stageCode),
        ),
    });
}

function buildCurrentStageItem(input: {
    stageCode: ProjectLogStageCode;
    acceptance?: ProjectStageAcceptanceRow | null;
    hasLog: boolean;
    isBlocked: boolean;
}): CurrentConstructionStage {
    const status = resolveStageStatus(input);

    return {
        stage_code: input.stageCode,
        stage_label: getHomeStageLabel(input.stageCode),
        status,
        status_label: CONSTRUCTION_STAGE_STATUS_LABELS[status],
        acceptance_status: input.acceptance?.status ?? null,
        acceptance_status_label: input.acceptance
            ? ProjectAcceptanceStatusConfig[input.acceptance.status].label
            : null,
    };
}

function resolveStageStatus(input: {
    acceptance?: ProjectStageAcceptanceRow | null;
    hasLog: boolean;
    isBlocked: boolean;
}): ProjectConstructionStageStatus {
    if (input.isBlocked) {
        return "locked";
    }
    if (input.acceptance?.status === "customer_confirmed") {
        return "accepted";
    }
    if (input.acceptance?.status === "rejected") {
        return "rework_required";
    }
    if (input.acceptance) {
        return "pending_acceptance";
    }

    return input.hasLog ? "in_progress" : "not_started";
}

function isStageBlocked(
    stageCode: ProjectConstructionStageCode,
    acceptedStages: Set<ProjectLogStageCode>,
) {
    const previousStage = getPreviousProjectConstructionStage(stageCode);
    return Boolean(previousStage && !acceptedStages.has(previousStage));
}

function compareAcceptanceRows(
    left: ProjectStageAcceptanceRow,
    right: ProjectStageAcceptanceRow,
) {
    const priorityDiff = getAcceptancePriority(left.status) -
        getAcceptancePriority(right.status);
    if (priorityDiff !== 0) {
        return priorityDiff;
    }

    return getAcceptanceUpdatedAt(right) - getAcceptanceUpdatedAt(left);
}

function getAcceptancePriority(status: ProjectAcceptanceStatus) {
    if (status === "draft" || status === "rejected") {
        return 1;
    }
    if (status === "submitted" || status === "leader_approved") {
        return 2;
    }
    if (status === "customer_confirmed") {
        return 3;
    }

    return 99;
}

function getAcceptanceUpdatedAt(row: ProjectStageAcceptanceRow) {
    return new Date(row.updated_at || row.created_at || 0).getTime();
}

function appendCurrentStageFields(
    row: ProjectHomeRow,
    stage: CurrentConstructionStage | null | undefined,
) {
    return {
        ...row,
        current_construction_stage: stage ?? null,
        current_stage: stage?.stage_code ?? null,
        current_stage_label: stage?.stage_label ?? null,
        stage_code: stage?.stage_code ?? null,
        stage_label: stage?.stage_label ?? null,
    };
}

function shouldAttachStage(row: ProjectHomeRow) {
    const status = row.status;
    return typeof status === "string" &&
        HOME_STAGE_PROJECT_STATUSES.has(status as ProjectStatus);
}

function getProjectId(row: ProjectHomeRow) {
    return typeof row.id === "string" ? row.id : null;
}

function getHomeStageLabel(stageCode: ProjectLogStageCode) {
    if (stageCode === PROJECT_CONSTRUCTION_COMPLETION_STAGE_CODE) {
        return "竣工验收";
    }

    return PROJECT_LOG_STAGE_CONFIG[stageCode].label;
}
