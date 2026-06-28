type JsonObject = Record<string, unknown>;

export type WorkflowFinanceReviewerGraphDefinition = {
  workflow_key?: string | null;
  name?: string | null;
  category?: string | null;
};

export type WorkflowFinanceReviewerGraphNode = {
  id: string;
  node_key: string;
  title: string;
  node_type: string | null;
  business_kind: string | null;
  config: JsonObject;
};

export type WorkflowFinanceReviewerGraph = {
  definition?: WorkflowFinanceReviewerGraphDefinition | null;
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

export type WorkflowFinanceConfirmationRuntimeNode = {
  node_key: string;
  status: string | null;
  node_snapshot: unknown;
  completed_by: string | null;
  completed_at: string | null;
};

export type WorkflowFinanceConfirmationActor = {
  node_key: string;
  completed_by_employee_id: string;
  completed_by_employee_name: string | null;
  completed_at: string | null;
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

export async function buildFinanceConfirmationActorsForTenant(input: {
  tenantId: string;
  runtimeNodes: WorkflowFinanceConfirmationRuntimeNode[];
}): Promise<WorkflowFinanceConfirmationActor[]> {
  const employeeIds = getFinanceConfirmationEmployeeIds(input.runtimeNodes);
  if (employeeIds.length === 0) return [];

  const { employeeCoreRepository } = await import("@/repositories/employee-core");
  const employees = await employeeCoreRepository.listLiteByIds({
    tenantId: input.tenantId,
    employeeIds,
  });

  return buildFinanceConfirmationActors({
    runtimeNodes: input.runtimeNodes,
    employees,
  });
}

export function buildFinanceConfirmationActors(input: {
  runtimeNodes: WorkflowFinanceConfirmationRuntimeNode[];
  employees: WorkflowFinanceReviewerEmployee[];
}): WorkflowFinanceConfirmationActor[] {
  const employeeById = new Map(input.employees.map((employee) => [
    employee.id,
    employee,
  ]));

  return input.runtimeNodes
    .filter(isCompletedPaymentRuntimeNode)
    .map((node) => {
      const employee = employeeById.get(node.completed_by || "");
      return {
        node_key: node.node_key,
        completed_by_employee_id: node.completed_by || "",
        completed_by_employee_name: employee?.name ?? null,
        completed_at: node.completed_at ?? null,
      };
    })
    .filter((actor) => Boolean(actor.completed_by_employee_id));
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

function getFinanceConfirmationEmployeeIds(
  runtimeNodes: WorkflowFinanceConfirmationRuntimeNode[],
): string[] {
  const ids = new Set<string>();
  for (const node of runtimeNodes) {
    if (!isCompletedPaymentRuntimeNode(node)) continue;
    if (node.completed_by) ids.add(node.completed_by);
  }

  return [...ids];
}

function isCompletedPaymentRuntimeNode(
  node: WorkflowFinanceConfirmationRuntimeNode,
) {
  return node.status === "completed" &&
    Boolean(node.completed_by) &&
    isPaymentNodeSnapshot(node.node_snapshot);
}

function isPaymentNodeSnapshot(value: unknown) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      "business_kind" in value &&
      value.business_kind === "payment_collection",
  );
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
