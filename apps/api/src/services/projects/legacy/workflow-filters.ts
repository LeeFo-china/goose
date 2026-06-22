import {
  workflowSubjectStateRepository,
  type WorkflowProjectFilterRow,
} from "@/repositories/workflow-subject-states";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import { buildWorkflowTimelineNodeGroup } from "@/services/project-workflow-timeline-contract";
import type { WorkflowInstanceStatus } from "@gooes/domain";
import type { ProjectWorkflowFiltersQuery } from "@/schema/projects";

export type ProjectWorkflowFilterOption = {
  key: string;
  label: string;
  order: number;
  count: number;
};

export type ProjectWorkflowNodeFilterOption = {
  key: string;
  label: string;
  group_key: string;
  group_label: string;
  group_order: number;
  order: number;
  count: number;
};

export type ProjectWorkflowFilterResult = {
  groups: ProjectWorkflowFilterOption[];
  nodes: ProjectWorkflowNodeFilterOption[];
  instance_statuses: ProjectWorkflowFilterOption[];
};

type MutableGroupOption = ProjectWorkflowFilterOption;
type MutableNodeOption = ProjectWorkflowNodeFilterOption & {
  firstSeenIndex: number;
};
type MutableStatusOption = ProjectWorkflowFilterOption;

const WORKFLOW_INSTANCE_STATUS_OPTIONS: Record<
  WorkflowInstanceStatus,
  { label: string; order: number }
> = {
  running: { label: "进行中", order: 10 },
  completed: { label: "已完成", order: 20 },
  canceled: { label: "已取消", order: 30 },
  failed: { label: "异常", order: 40 },
};

export async function listProjectWorkflowFilters(this: unknown, input: {
  authContext: AuthContext;
  query: ProjectWorkflowFiltersQuery;
}): Promise<ProjectWorkflowFilterResult> {
  const tenantId = accessPolicyService.assertTenantContext(input.authContext);
  const visibleProjectIds = await accessPolicyService.getVisibleProjectIdsByOwnership(
    input.authContext,
    "project.read",
    input.query.ownership,
  );
  const rows = await workflowSubjectStateRepository.listProjectWorkflowFilterRows({
    tenantId,
    projectIds: visibleProjectIds,
  });

  return buildProjectWorkflowFilterOptions(rows);
}

export function buildProjectWorkflowFilterOptions(
  rows: WorkflowProjectFilterRow[],
): ProjectWorkflowFilterResult {
  const groupsByKey = new Map<string, MutableGroupOption>();
  const nodesByKey = new Map<string, MutableNodeOption>();
  const nodeOrderByGroupKey = new Map<string, number>();
  const statusesByKey = new Map<string, MutableStatusOption>();

  rows.forEach((row, index) => {
    const group = buildWorkflowTimelineNodeGroup(readCategory(row.definition));
    const groupOption = groupsByKey.get(group.key) ?? {
      key: group.key,
      label: group.label,
      order: group.order,
      count: 0,
    };
    groupOption.count += 1;
    groupsByKey.set(group.key, groupOption);

    const nodeKey = readString(row.current_node_key);
    if (nodeKey) {
      const nodeMapKey = `${group.key}:${nodeKey}`;
      const nodeOption = nodesByKey.get(`${group.key}:${nodeKey}`) ?? {
        key: nodeKey,
        label: readString(row.current_node_title) ?? nodeKey,
        group_key: group.key,
        group_label: group.label,
        group_order: group.order,
        order: nodeOrderByGroupKey.get(group.key) ?? 0,
        count: 0,
        firstSeenIndex: index,
      };
      if (!nodesByKey.has(nodeMapKey)) {
        nodeOrderByGroupKey.set(group.key, nodeOption.order + 1);
      }
      nodeOption.count += 1;
      nodesByKey.set(nodeMapKey, nodeOption);
    }

    const instanceStatus = readWorkflowInstanceStatus(row.instance_status);
    if (instanceStatus) {
      const config = WORKFLOW_INSTANCE_STATUS_OPTIONS[instanceStatus];
      const statusOption = statusesByKey.get(instanceStatus) ?? {
        key: instanceStatus,
        label: config.label,
        order: config.order,
        count: 0,
      };
      statusOption.count += 1;
      statusesByKey.set(instanceStatus, statusOption);
    }
  });

  return {
    groups: Array.from(groupsByKey.values()).sort(compareOptions),
    nodes: Array.from(nodesByKey.values())
      .sort(compareNodeOptions)
      .map(({ firstSeenIndex: _firstSeenIndex, ...node }) => node),
    instance_statuses: Array.from(statusesByKey.values()).sort(compareOptions),
  };
}

function compareOptions(
  left: ProjectWorkflowFilterOption,
  right: ProjectWorkflowFilterOption,
) {
  return left.order - right.order || left.label.localeCompare(right.label);
}

function compareNodeOptions(
  left: MutableNodeOption,
  right: MutableNodeOption,
) {
  return left.group_order - right.group_order ||
    left.firstSeenIndex - right.firstSeenIndex ||
    left.label.localeCompare(right.label);
}

function readCategory(value: WorkflowProjectFilterRow["definition"]) {
  const source = Array.isArray(value) ? value[0] : value;
  return readString(source?.category);
}

function readWorkflowInstanceStatus(
  value: unknown,
): WorkflowInstanceStatus | null {
  return value === "running" ||
      value === "completed" ||
      value === "canceled" ||
      value === "failed"
    ? value
    : null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
