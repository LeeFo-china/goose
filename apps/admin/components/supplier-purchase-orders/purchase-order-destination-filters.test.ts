import { expect, test } from "bun:test";
import {
  changeOrderDestination,
  orderDestinationQuery,
} from "./purchase-order-destination-filters";

test("changing destination clears conflicting project and warehouse selections", () => {
  const project = {
    destinationType: "project" as const,
    projectId: "p",
    warehouse: null,
  };
  expect(changeOrderDestination(project, "warehouse")).toEqual({
    destinationType: "warehouse",
    projectId: "all",
    warehouse: null,
  });
  expect(
    changeOrderDestination({
      destinationType: "warehouse",
      projectId: "all",
      warehouse: { id: "w", name: "中心仓" },
    }, "project"),
  ).toEqual({ destinationType: "project", projectId: "all", warehouse: null });
});
test("only exact API camelCase destination filters leave the boundary", () => {
  expect(
    orderDestinationQuery({
      destinationType: "warehouse",
      projectId: "hidden-project",
      warehouse: { id: "w", name: "中心仓" },
    }),
  ).toEqual({ destinationType: "warehouse", warehouseId: "w" });
  expect(
    orderDestinationQuery({
      destinationType: "project",
      projectId: "p",
      warehouse: { id: "hidden", name: "隐藏" },
    }),
  ).toEqual({ destinationType: "project", projectId: "p" });
  expect(
    orderDestinationQuery({
      destinationType: "all",
      projectId: "all",
      warehouse: null,
    }),
  ).toEqual({});
});
