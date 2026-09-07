import { expect, test } from "bun:test";
import { applyProcurementListScope, procurementScopeIsEmpty } from "./procurement-destination-scope";

test("scoped list combines only visible projects and authorized warehouses", () => {
  const filters: unknown[] = [];
  const query = { eq: (...args: unknown[]) => { filters.push(args); return query; },
    in: (...args: unknown[]) => { filters.push(args); return query; },
    or: (filter: string) => { filters.push(filter); return query; } };
  applyProcurementListScope(query, { visible_project_ids: ["project-a"], include_warehouse: true });
  expect(filters).toEqual(["destination_type.eq.warehouse,and(destination_type.eq.project,project_id.in.(project-a))"]);
  expect(procurementScopeIsEmpty({ visible_project_ids: [], include_warehouse: true })).toBe(false);
  expect(procurementScopeIsEmpty({ visible_project_ids: null, destination_type: "warehouse" })).toBe(true);
  expect(procurementScopeIsEmpty({ visible_project_ids: [], include_warehouse: true, project_id: "hidden" })).toBe(true);
});
