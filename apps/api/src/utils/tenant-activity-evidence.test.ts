import { expect, test } from "bun:test";
import { getTenantActivityEventKey, withTenantActivityEventKey } from "./tenant-activity-evidence";

test("evidence belongs to the exact response object and never survives serialization or copying", () => {
  const data = Object.freeze({ id: "acceptance", status: "rejected" });
  const json = JSON.stringify(data);
  expect(withTenantActivityEventKey(data, "acceptance_handled:action-1")).toBe(data);
  expect(getTenantActivityEventKey(data)).toBe("acceptance_handled:action-1");
  expect(JSON.stringify(data)).toBe(json);
  expect(getTenantActivityEventKey(JSON.parse(json))).toBeUndefined();
  expect(getTenantActivityEventKey({ ...data })).toBeUndefined();
  expect(getTenantActivityEventKey({ eventKey: "acceptance_handled:forged" })).toBeUndefined();
});
