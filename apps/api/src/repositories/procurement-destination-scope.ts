export type ProcurementListScope = {
  visible_project_ids: string[] | null;
  project_id?: string;
  include_warehouse?: boolean;
  destination_type?: "project" | "warehouse";
  warehouse_id?: string;
};

export function procurementScopeIsEmpty(input: ProcurementListScope): boolean {
  if (input.destination_type === "warehouse" && !input.include_warehouse) return true;
  if (input.warehouse_id && !input.include_warehouse) return true;
  if (input.project_id && input.visible_project_ids && !input.visible_project_ids.includes(input.project_id)) return true;
  return input.visible_project_ids?.length === 0 &&
    (!input.include_warehouse || input.destination_type === "project" || Boolean(input.project_id));
}

export function applyProcurementListScope<T extends {
  eq: (column: string, value: unknown) => T;
  in: (column: string, values: readonly string[]) => T;
  or: (filter: string) => T;
}>(request: T, input: ProcurementListScope): T {
  if (input.project_id) return request.eq("destination_type", "project").eq("project_id", input.project_id);
  if (input.destination_type === "warehouse" || input.warehouse_id) {
    request = request.eq("destination_type", "warehouse");
    return input.warehouse_id ? request.eq("warehouse_id", input.warehouse_id) : request;
  }
  if (!input.include_warehouse || input.destination_type === "project") {
    request = request.eq("destination_type", "project");
    return input.visible_project_ids ? request.in("project_id", input.visible_project_ids) : request;
  }
  if (input.visible_project_ids === null) return request;
  if (input.visible_project_ids.length === 0) return request.eq("destination_type", "warehouse");
  return request.or(`destination_type.eq.warehouse,and(destination_type.eq.project,project_id.in.(${input.visible_project_ids.join(",")}))`);
}
