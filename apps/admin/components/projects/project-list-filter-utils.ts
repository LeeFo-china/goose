import type { SelectOption } from "@/components/admin/form-select";

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

export type ProjectWorkflowFiltersData = {
  groups: ProjectWorkflowFilterOption[];
  nodes: ProjectWorkflowNodeFilterOption[];
  instance_statuses: ProjectWorkflowFilterOption[];
};

export type ProjectListHrefInput = {
  page?: number;
  pageSize?: number;
  ownership?: string;
  keyword?: string;
  workflowGroupKey?: string;
  workflowNodeKey?: string;
  workflowInstanceStatus?: string;
};

export function buildProjectsHref(input: ProjectListHrefInput) {
  const params = new URLSearchParams();
  if (input.page && input.page > 1) params.set("page", String(input.page));
  if (input.pageSize && input.pageSize > 0) {
    params.set("pageSize", String(input.pageSize));
  }
  if (input.ownership) params.set("ownership", input.ownership);
  if (input.keyword) params.set("keyword", input.keyword);
  if (input.workflowGroupKey) {
    params.set("workflow_group_key", input.workflowGroupKey);
  }
  if (input.workflowNodeKey) {
    params.set("workflow_node_key", input.workflowNodeKey);
  }
  if (input.workflowInstanceStatus) {
    params.set("workflow_instance_status", input.workflowInstanceStatus);
  }

  const query = params.toString();
  return query ? `/projects?${query}` : "/projects";
}

export function workflowGroupOptions(
  filters: ProjectWorkflowFiltersData,
): SelectOption[] {
  return filters.groups
    .slice()
    .sort(compareFilterOptions)
    .map((item) => ({
      value: item.key,
      label: `${item.label} (${item.count})`,
    }));
}

export function workflowInstanceStatusOptions(
  filters: ProjectWorkflowFiltersData,
): SelectOption[] {
  return filters.instance_statuses
    .slice()
    .sort(compareFilterOptions)
    .map((item) => ({
      value: item.key,
      label: `${item.label} (${item.count})`,
    }));
}

export function workflowNodeOptionsForGroup(
  filters: ProjectWorkflowFiltersData,
  groupKey: string,
): SelectOption[] {
  const nodes = filters.nodes
    .filter((item) => !groupKey || item.group_key === groupKey)
    .slice()
    .sort(compareNodeOptions);

  if (groupKey) {
    return nodes.map((item) => ({
      value: item.key,
      label: `${item.label} (${item.count})`,
    }));
  }

  return mergeNodesByKey(nodes).map(({ groups, item }) => ({
    value: item.key,
    label: groups.size > 1
      ? `${item.label} (${item.count})`
      : `${item.group_label} / ${item.label} (${item.count})`,
  }));
}

export function emptyWorkflowFilters(): ProjectWorkflowFiltersData {
  return {
    groups: [],
    nodes: [],
    instance_statuses: [],
  };
}

function compareFilterOptions(
  left: ProjectWorkflowFilterOption,
  right: ProjectWorkflowFilterOption,
) {
  return left.order - right.order || left.label.localeCompare(right.label);
}

function compareNodeOptions(
  left: ProjectWorkflowNodeFilterOption,
  right: ProjectWorkflowNodeFilterOption,
) {
  return left.group_order - right.group_order ||
    left.order - right.order ||
    left.label.localeCompare(right.label);
}

function mergeNodesByKey(nodes: ProjectWorkflowNodeFilterOption[]) {
  const nodesByKey = new Map<
    string,
    { item: ProjectWorkflowNodeFilterOption; groups: Set<string> }
  >();

  for (const node of nodes) {
    const existing = nodesByKey.get(node.key);
    if (!existing) {
      nodesByKey.set(node.key, {
        item: { ...node },
        groups: new Set([node.group_key]),
      });
      continue;
    }

    existing.item.count += node.count;
    existing.groups.add(node.group_key);
  }

  return Array.from(nodesByKey.values());
}
