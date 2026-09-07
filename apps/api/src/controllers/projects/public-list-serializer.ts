import { serializeProjectListItem } from "./list-serializer";

export function serializePublicProjectListItem(
  row: Record<string, unknown>,
) {
  const item = serializeProjectListItem(row);

  return {
    id: item.id,
    tenant_id: item.tenant_id,
    name: item.name,
    status: item.status,
    display_status_label: item.display_status_label,
    budget: item.budget,
    start_date: item.start_date,
    created_at: item.created_at,
    address: item.address,
    property_id: item.property_id,
    style_tags: item.style_tags,
    visibility_status: item.visibility_status,
    tenant: item.tenant,
    tenant_name: item.tenant_name,
    customer: item.customer,
    property: item.property,
    designer: item.designer,
    supervisor: item.supervisor,
  };
}
