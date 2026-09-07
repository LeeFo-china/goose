import type { getDirectPostgresSql } from "@/utils/postgres-direct";

export function buildProcurementTaskDestinationScope(
  sql: NonNullable<ReturnType<typeof getDirectPostgresSql>>,
  projectIds: string[] | null, includeWarehouse: boolean, status: string,
) {
  if (status === "pending") {
    const projectScope = projectIds === null ? sql`TRUE`
      : projectIds.length ? sql`batch.project_id IN ${sql(projectIds)}` : sql`FALSE`;
    return sql`AND ((batch.destination_type = 'project' AND ${projectScope})
      OR (batch.destination_type = 'warehouse' AND ${includeWarehouse}))`;
  }
  const projectScope = projectIds === null ? sql`TRUE`
    : projectIds.length ? sql`instance.context->>'project_id' IN ${sql(projectIds)}` : sql`FALSE`;
  // Validate before scope evaluation; historical destinations must never fall back to editable batch fields.
  const uuidPattern = "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$";
  return sql`AND (
    (COALESCE(instance.context->>'destination_type', 'project') = 'project'
      AND instance.context->>'project_id' ~ ${uuidPattern}
      AND instance.context->>'warehouse_id' IS NULL AND ${projectScope})
    OR (instance.context->>'destination_type' = 'warehouse'
      AND instance.context->'project_id' = 'null'::jsonb
      AND instance.context->>'warehouse_id' ~ ${uuidPattern} AND ${includeWarehouse})
  )`;
}
