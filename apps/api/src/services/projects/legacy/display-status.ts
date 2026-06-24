import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";
import {
    PROJECT_CONSTRUCTION_COMPLETION_STAGE_CODE,
    ProjectStatusConfig,
    isProjectStatus,
} from "@gooes/domain";

type ProjectListRow = Record<string, unknown>;

const FINAL_ACCEPTANCE_COMPLETED_STATUS = "final_acceptance_completed";
const FINAL_ACCEPTANCE_COMPLETED_LABEL = "已完成";
const FINAL_ACCEPTANCE_DISPLAY_SOURCE_STATUSES = new Set([
    "constructing",
    "acceptance",
]);

export async function attachProjectDisplayStatuses(input: {
    rows: ProjectListRow[];
    tenantId: string;
}): Promise<ProjectListRow[]> {
    if (input.rows.length === 0) {
        return input.rows;
    }

    const acceptanceProjectIds = input.rows
        .filter((row) =>
            typeof row.status === "string" &&
            FINAL_ACCEPTANCE_DISPLAY_SOURCE_STATUSES.has(row.status) &&
            row.display_status !== FINAL_ACCEPTANCE_COMPLETED_STATUS
        )
        .map((row) => getProjectId(row))
        .filter((id): id is string => Boolean(id));
    const completedProjectIds = acceptanceProjectIds.length > 0
        ? await listFinalAcceptanceCompletedProjectIds({
            tenantId: input.tenantId,
            projectIds: [...new Set(acceptanceProjectIds)],
        })
        : new Set<string>();

    return input.rows.map((row) =>
        appendProjectDisplayStatus(row, completedProjectIds)
    );
}

export async function listFinalAcceptanceCompletedProjectIds(input: {
    tenantId: string;
    projectIds: string[];
}) {
    const { data, error } = await SupabaseDB.getAdminClient()
        .from("project_acceptances")
        .select("project_id")
        .eq("tenant_id", input.tenantId)
        .in("project_id", input.projectIds)
        .eq("stage_code", PROJECT_CONSTRUCTION_COMPLETION_STAGE_CODE)
        .eq("status", "customer_confirmed");

    if (error) {
        throw Errors.dbError("查询项目竣工验收完成状态失败", error);
    }

    return new Set(
        ((data || []) as Array<{ project_id: string | null }>)
            .map((row) => row.project_id)
            .filter((projectId): projectId is string => Boolean(projectId)),
    );
}

export function appendProjectDisplayStatus(
    row: ProjectListRow,
    completedProjectIds: Set<string>,
) {
    const status = typeof row.status === "string" ? row.status : null;
    const statusLabel = isProjectStatus(status)
        ? ProjectStatusConfig[status].label
        : null;
    const projectId = getProjectId(row);
    const isFinalAcceptanceCompleted =
        row.display_status === FINAL_ACCEPTANCE_COMPLETED_STATUS ||
        (Boolean(status && FINAL_ACCEPTANCE_DISPLAY_SOURCE_STATUSES.has(status)) &&
            Boolean(projectId && completedProjectIds.has(projectId)));

    return {
        ...row,
        status_label: statusLabel,
        display_status: isFinalAcceptanceCompleted
            ? FINAL_ACCEPTANCE_COMPLETED_STATUS
            : status,
        display_status_label: isFinalAcceptanceCompleted
            ? FINAL_ACCEPTANCE_COMPLETED_LABEL
            : statusLabel,
    };
}

function getProjectId(row: ProjectListRow) {
    return typeof row.id === "string" ? row.id : null;
}
