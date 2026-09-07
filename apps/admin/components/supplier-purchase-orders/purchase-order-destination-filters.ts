export type OrderDestinationFilters = {
  destinationType: "all" | "project" | "warehouse";
  projectId: string;
  warehouse: { id: string; name: string } | null;
};

export function changeOrderDestination(
  current: OrderDestinationFilters,
  destinationType: OrderDestinationFilters["destinationType"],
): OrderDestinationFilters {
  return current.destinationType === destinationType
    ? current
    : { destinationType, projectId: "all", warehouse: null };
}

export function orderDestinationQuery(filters: OrderDestinationFilters) {
  return {
    ...(filters.destinationType !== "all"
      ? { destinationType: filters.destinationType }
      : {}),
    ...(filters.destinationType !== "warehouse" && filters.projectId !== "all"
      ? { projectId: filters.projectId }
      : {}),
    ...(filters.destinationType === "warehouse" && filters.warehouse
      ? { warehouseId: filters.warehouse.id }
      : {}),
  };
}
