import {
  PROJECT_CONSTRUCTION_STAGE_CODE_VALUES,
  projectAcceptanceRepository,
  type ProjectAcceptanceRow,
  type ProjectConstructionStageCode,
} from "./shared";

export function pickLatestAcceptanceRows(rows: ProjectAcceptanceRow[]) {
  const statusPriority: Record<ProjectAcceptanceRow["status"], number> = {
    draft: 1,
    rejected: 1,
    submitted: 2,
    leader_approved: 2,
    customer_confirmed: 3,
    cancelled: 99,
  };
  const sortedRows = [...rows].sort((left, right) => {
    const priorityDiff =
      statusPriority[left.status] - statusPriority[right.status];
    if (priorityDiff !== 0) return priorityDiff;

    return new Date(right.updated_at || right.created_at).getTime() -
      new Date(left.updated_at || left.created_at).getTime();
  });
  const latest = new Map<string, ProjectAcceptanceRow>();
  for (const row of sortedRows) {
    if (!latest.has(row.stage_code)) {
      latest.set(row.stage_code, row);
    }
  }

  return [...latest.values()];
}

export async function getAcceptedConstructionStages(input: {
  projectId: string;
  tenantId?: string | null;
}) {
  const rows = await projectAcceptanceRepository.listLatestAcceptancesByStages({
    projectId: input.projectId,
    stageCodes: PROJECT_CONSTRUCTION_STAGE_CODE_VALUES,
    tenantId: input.tenantId,
  });

  return new Set(
    rows
      .filter((item) => item.status === "customer_confirmed")
      .map((item) => item.stage_code as ProjectConstructionStageCode),
  );
}
