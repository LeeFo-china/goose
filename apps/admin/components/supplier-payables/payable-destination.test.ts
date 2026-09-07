import { expect, test } from "bun:test";
import { canManagePayableDestination, payableDestination, payableDestinationLabel, samePayableDestination } from "./payable-destination";

const id = "abcdefab-0000-4000-8000-000000000001";
test("only a valid legacy project identity defaults to project", () => {
  expect(payableDestination({ project_id: id.toUpperCase() })).toEqual({ destination_type: "project", project_id: id, warehouse_id: null });
  for (const value of [{ project_id: null }, { project_id: "" }, { project_id: "project-id" }, { project_id: id, warehouse_id: id },
    { project_id: null, warehouse_id: id }, { destination_type: "warehouse" as const, project_id: id, warehouse_id: id }]) {
    expect(payableDestination(value)).toBeNull();
    expect(canManagePayableDestination(value, true, true)).toBe(false);
  }
});
test("warehouse identity is exact and label never falls back to UUID", () => {
  const warehouse = { destination_type: "warehouse" as const, project_id: null, warehouse_id: id };
  expect(samePayableDestination(warehouse, { ...warehouse, warehouse_id: id.toUpperCase() })).toBe(true);
  expect(samePayableDestination(warehouse, { project_id: id })).toBe(false);
  expect(payableDestinationLabel(warehouse)).toBe("仓库补货");
  expect(payableDestinationLabel({ ...warehouse, warehouse_name: "历史仓库" })).toBe("历史仓库");
  expect(canManagePayableDestination(warehouse, true, false)).toBe(false);
  expect(canManagePayableDestination({ project_id: id }, true, false)).toBe(true);
});
