import {
  projectAcceptanceRepository,
  type ProjectAcceptanceCustomerRow,
  type ProjectAcceptanceDetailGraphRow,
  type ProjectAcceptanceEmployeeRow,
} from "@/repositories/project-acceptances";
import {
  measureProjectAcceptanceTiming,
  type ProjectAcceptanceTimingSteps,
} from "./timing";

function getSingleRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

export async function buildDetailFromGraph(this: any,
  graph: ProjectAcceptanceDetailGraphRow,
  options?: {
    timing?: ProjectAcceptanceTimingSteps;
    employees?: ProjectAcceptanceEmployeeRow[];
    customers?: ProjectAcceptanceCustomerRow[];
  },
) {
  const {
    project: rawProject,
    initiator: rawInitiator,
    reviewer: rawReviewer,
    customer: rawCustomer,
    items: rawItems,
    actions: rawActions,
    tickets,
    ...row
  } = graph;
  const timing = options?.timing;
  const project = getSingleRelation(rawProject);
  const initiator = getSingleRelation(rawInitiator);
  const reviewer = getSingleRelation(rawReviewer);
  const customer = getSingleRelation(rawCustomer);
  const items = [...(rawItems ?? [])].sort((left, right) =>
    left.sort_order - right.sort_order ||
    left.created_at.localeCompare(right.created_at)
  );
  const actions = [...(rawActions ?? [])].sort((left, right) =>
    left.created_at.localeCompare(right.created_at)
  );
  const employeeMap = new Map(
    [...(options?.employees ?? []), initiator, reviewer]
      .filter((item): item is ProjectAcceptanceEmployeeRow => Boolean(item))
      .map((item) => [item.id, item]),
  );
  const customerMap = new Map(
    [...(options?.customers ?? []), customer]
      .filter((item): item is ProjectAcceptanceCustomerRow => Boolean(item))
      .map((item) => [item.id, item]),
  );
  const missingEmployeeIds = Array.from(new Set(actions
    .filter((item) => (
      item.operator_type === "employee" &&
      item.operator_id &&
      !employeeMap.has(item.operator_id)
    ))
    .map((item) => item.operator_id as string)));
  const missingCustomerIds = Array.from(new Set(actions
    .filter((item) => (
      item.operator_type === "customer" &&
      item.operator_id &&
      !customerMap.has(item.operator_id)
    ))
    .map((item) => item.operator_id as string)));

  const [extraEmployees, extraCustomers] = await Promise.all([
    measureProjectAcceptanceTiming(
      timing,
      "operator_employee_lookup_ms",
      () => projectAcceptanceRepository.listEmployees(missingEmployeeIds),
    ),
    measureProjectAcceptanceTiming(
      timing,
      "operator_customer_lookup_ms",
      () => projectAcceptanceRepository.listCustomers(missingCustomerIds),
    ),
  ]);
  for (const item of extraEmployees) employeeMap.set(item.id, item);
  for (const item of extraCustomers) customerMap.set(item.id, item);

  return measureProjectAcceptanceTiming(
    timing,
    "detail_serialize_ms",
    () => this.buildDetailFromParts(row, {
      items,
      actions,
      project,
      employeeMap,
      customerMap,
      latestNotification: tickets?.[0] ?? null,
    }),
  );
}
