import { projectAcceptanceRepository } from "@/repositories/project-acceptances";
import type { ProjectAcceptanceRow } from "@/repositories/project-acceptances";
import { projectAcceptanceOpenTicketRepository } from "@/repositories/project-acceptance-open-tickets";
import {
  measureProjectAcceptanceTiming,
  type ProjectAcceptanceTimingSteps,
} from "./timing";

export async function buildDetail(this: any,
  row: ProjectAcceptanceRow,
  options?: { timing?: ProjectAcceptanceTimingSteps },
) {
  const timing = options?.timing;
  const rawActions = await measureProjectAcceptanceTiming(
    timing,
    "acceptance_actions_query_ms",
    () => projectAcceptanceRepository.listActions(
      row.id,
      row.tenant_id,
    ),
  );
  const actionEmployeeIds = rawActions
    .filter((item) => item.operator_type === "employee" && item.operator_id)
    .map((item) => item.operator_id as string);
  const actionCustomerIds = rawActions
    .filter((item) => item.operator_type === "customer" && item.operator_id)
    .map((item) => item.operator_id as string);

  const [items, project, employees, customers, latestNotification] =
    await Promise.all([
      measureProjectAcceptanceTiming(
        timing,
        "acceptance_items_query_ms",
        () => projectAcceptanceRepository.listItems(row.id, row.tenant_id),
      ),
      measureProjectAcceptanceTiming(
        timing,
        "project_lookup_ms",
        () => projectAcceptanceRepository.getProject(row.project_id, row.tenant_id),
      ),
      measureProjectAcceptanceTiming(
        timing,
        "employee_lookup_ms",
        () => projectAcceptanceRepository.listEmployees(
          Array.from(new Set([
            row.initiator_id,
            row.reviewer_id,
            ...actionEmployeeIds,
          ].filter((item): item is string => Boolean(item)))),
        ),
      ),
      measureProjectAcceptanceTiming(
        timing,
        "customer_detail_lookup_ms",
        () => projectAcceptanceRepository.listCustomers(
          Array.from(new Set([
            row.customer_id,
            ...actionCustomerIds,
          ].filter((item): item is string => Boolean(item)))),
        ),
      ),
      measureProjectAcceptanceTiming(
        timing,
        "latest_notification_query_ms",
        () => projectAcceptanceOpenTicketRepository.findLatestByAcceptance(
          row.id,
          row.tenant_id,
        ),
      ),
    ]);

  return measureProjectAcceptanceTiming(
    timing,
    "detail_serialize_ms",
    () => this.buildDetailFromParts(row, {
      items,
      actions: rawActions,
      project,
      employeeMap: new Map(employees.map((item) => [item.id, item])),
      customerMap: new Map(customers.map((item) => [item.id, item])),
      latestNotification,
    }),
  );
}
