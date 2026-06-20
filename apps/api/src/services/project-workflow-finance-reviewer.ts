type JsonObject = Record<string, unknown>;

export type WorkflowFinanceReviewerGraphNode = {
  id: string;
  node_key: string;
  title: string;
  node_type: string | null;
  business_kind: string | null;
  config: JsonObject;
};

export type WorkflowFinanceReviewerGraph = {
  nodes: WorkflowFinanceReviewerGraphNode[];
  edges: Array<{
    source_node_id: string;
    target_node_id: string;
  }>;
};

export type WorkflowFinanceReviewerEmployee = {
  id: string;
  name: string | null;
  avatar: string | null;
};

export async function enrichWorkflowGraphWithFinanceReviewersForTenant(input: {
  tenantId: string;
  graph: WorkflowFinanceReviewerGraph | null;
}): Promise<WorkflowFinanceReviewerGraph | null> {
  if (!input.graph) return null;

  const employeeIds = getFinanceReviewerEmployeeIds(input.graph);
  if (employeeIds.length === 0) return input.graph;

  const { employeeCoreRepository } = await import("@/repositories/employee-core");
  const employees = await employeeCoreRepository.listLiteByIds({
    tenantId: input.tenantId,
    employeeIds,
  });

  return enrichWorkflowGraphWithFinanceReviewerEmployees({
    graph: input.graph,
    employees,
  });
}

export function enrichWorkflowGraphWithFinanceReviewerEmployees(input: {
  graph: WorkflowFinanceReviewerGraph;
  employees: WorkflowFinanceReviewerEmployee[];
}): WorkflowFinanceReviewerGraph {
  const employeeById = new Map(input.employees.map((employee) => [
    employee.id,
    employee,
  ]));

  return {
    ...input.graph,
    nodes: input.graph.nodes.map((node) => {
      if (node.business_kind !== "payment_collection") return node;

      const reviewerEmployeeId = readString(
        node.config.finance_reviewer_employee_id,
      );
      const reviewer = reviewerEmployeeId
        ? employeeById.get(reviewerEmployeeId)
        : null;
      if (!reviewer) return node;

      return {
        ...node,
        config: {
          ...node.config,
          finance_reviewer_employee_name: reviewer.name,
        },
      };
    }),
  };
}

function getFinanceReviewerEmployeeIds(
  graph: WorkflowFinanceReviewerGraph,
): string[] {
  const ids = new Set<string>();
  for (const node of graph.nodes) {
    if (node.business_kind !== "payment_collection") continue;
    const reviewerEmployeeId = readString(
      node.config.finance_reviewer_employee_id,
    );
    if (reviewerEmployeeId) ids.add(reviewerEmployeeId);
  }

  return [...ids];
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
