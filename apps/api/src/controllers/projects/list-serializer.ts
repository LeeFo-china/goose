import {
  customerPhonePrivacyService,
  type CustomerPhonePrivacyContext,
} from "@/services/customer-phone-privacy";

function normalizeRelation<T extends Record<string, unknown>>(
  value: unknown,
  fallback: T,
): T {
  if (Array.isArray(value)) {
    const first = value[0];
    if (first && typeof first === "object") {
      return { ...fallback, ...(first as T) };
    }

    return fallback;
  }

  if (value && typeof value === "object") {
    return { ...fallback, ...(value as T) };
  }

  return fallback;
}

export function serializeProjectListItem<T extends Record<string, unknown>>(
  row: T,
  phonePrivacyContext?: CustomerPhonePrivacyContext,
) {
  const normalizedCustomer = normalizeRelation(row.customer, {
    id: null,
    name: null,
    phone: null,
    owner_id: null,
  });
  const normalizedTenant = normalizeRelation(row.tenant, {
    id: null,
    name: null,
    slug: null,
  });
  const customerPhoneFields =
    typeof normalizedCustomer.id === "string" && phonePrivacyContext
      ? customerPhonePrivacyService.serializeCustomerPhoneFields(
        phonePrivacyContext,
        {
          id: normalizedCustomer.id,
          owner_id: typeof normalizedCustomer.owner_id === "string"
            ? normalizedCustomer.owner_id
            : null,
          phone: typeof normalizedCustomer.phone === "string"
            ? normalizedCustomer.phone
            : null,
        },
      )
      : customerPhonePrivacyService.serializeMaskedPhoneOnly(
        typeof normalizedCustomer.phone === "string" ? normalizedCustomer.phone : null,
      );

  return {
    ...row,
    tenant: normalizedTenant,
    tenant_name: typeof normalizedTenant.name === "string" ? normalizedTenant.name : null,
    customer: {
      ...normalizedCustomer,
      ...customerPhoneFields,
    },
    property: normalizeRelation(row.property, {
      id: null,
      community: null,
      building_info: null,
      area: null,
      layout: null,
      latitude: null,
      longitude: null,
      province: null,
      city: null,
      district: null,
      adcode: null,
      location_status: null,
      location_source: null,
      location_confidence: null,
      location_confirmed_at: null,
    }),
    designer: normalizeRelation(row.designer, {
      id: null,
      name: null,
      phone: null,
      avatar: null,
    }),
    supervisor: normalizeRelation(row.supervisor, {
      id: null,
      name: null,
      phone: null,
      avatar: null,
    }),
  };
}
