import { ProjectStatusConfig, isProjectStatus } from "@gooes/domain";

export type PublicProjectWorkflowState = {
  tenant_id: string;
  subject_id: string;
  instance_status: string | null;
  current_node_key: string | null;
  current_node_title: string | null;
};

type ProjectListRow = Record<string, unknown>;

const TERMINAL_NODE_KEYS = new Set(["end"]);
const TERMINAL_NODE_TITLES = new Set(["end", "结束"]);

export async function attachPublicProjectWorkflowStatuses(
  rows: ProjectListRow[],
): Promise<ProjectListRow[]> {
  const pairs = rows
    .map((row) => ({
      tenantId: readString(row.tenant_id),
      projectId: readString(row.id),
    }))
    .filter((pair): pair is { tenantId: string; projectId: string } =>
      Boolean(pair.tenantId && pair.projectId)
    )
    .slice(0, 100);

  if (pairs.length === 0) {
    return appendPublicProjectWorkflowStatusLabels({ rows, states: [] });
  }

  const { publicProjectWorkflowStateRepository } = await import(
    "@/repositories/public-project-workflow-states"
  );
  const states = await publicProjectWorkflowStateRepository
    .listByTenantProjectIds({
      tenantIds: pairs.map((pair) => pair.tenantId),
      projectIds: pairs.map((pair) => pair.projectId),
    });

  return appendPublicProjectWorkflowStatusLabels({ rows, states });
}

export function appendPublicProjectWorkflowStatusLabels(input: {
  rows: ProjectListRow[];
  states: PublicProjectWorkflowState[];
}): ProjectListRow[] {
  const statesByProject = new Map(
    input.states.map((state) => [stateKey(state.tenant_id, state.subject_id), state]),
  );

  return input.rows.map((row) => {
    const tenantId = readString(row.tenant_id);
    const projectId = readString(row.id);
    const state = tenantId && projectId
      ? statesByProject.get(stateKey(tenantId, projectId)) ?? null
      : null;

    return {
      ...row,
      display_status_label: resolvePublicProjectDisplayStatusLabel(row, state),
    };
  });
}

function resolvePublicProjectDisplayStatusLabel(
  row: ProjectListRow,
  state: PublicProjectWorkflowState | null,
): string | null {
  if (state?.instance_status === "completed") {
    return "已完成";
  }

  if (state?.instance_status === "running") {
    const nodeKey = readString(state.current_node_key)?.toLowerCase() ?? null;
    const nodeTitle = readString(state.current_node_title);
    if (
      nodeTitle
      && !TERMINAL_NODE_KEYS.has(nodeKey ?? "")
      && !TERMINAL_NODE_TITLES.has(nodeTitle.toLowerCase())
    ) {
      return nodeTitle;
    }
  }

  const status = readString(row.status);
  return isProjectStatus(status) ? ProjectStatusConfig[status].label : null;
}

function stateKey(tenantId: string, projectId: string): string {
  return `${tenantId}:${projectId}`;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
