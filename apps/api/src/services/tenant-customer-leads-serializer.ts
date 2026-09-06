import { CUSTOMER_LEAD_SOURCE_LABELS, type CustomerLeadAppointment,
  type CustomerLeadCustomerLink, type CustomerLeadFollowUp,
  type CustomerLeadSummary } from "@gooes/domain";
import type { TenantDouyinLeadBundle, TenantDouyinFollowUpBundle } from
  "@/repositories/tenant-douyin-leads-hydration";
import type { TenantDouyinAppointmentDetailRow } from
  "@/repositories/tenant-douyin-leads-contract";
import { assertPublicLeadBundleScope, serializePublicAppointment,
  serializePublicFollowUp, serializePublicLead } from "@/services/tenant-douyin-leads-public";
import type { TenantDouyinLeadPhonePrivacyPort } from "@/services/tenant-douyin-leads-serializer";

export function customerLink(customer: { id: string; tenant_id: string;
  owner_id: string | null } | null, tenantId: string,
visibleOwnerIds: readonly string[] | null): CustomerLeadCustomerLink {
  const visible = customer && customer.tenant_id === tenantId
    && (visibleOwnerIds === null || (customer.owner_id !== null
      && visibleOwnerIds.includes(customer.owner_id)));
  return visible ? { customer_id: customer.id, can_view_customer: true }
    : { customer_id: null, can_view_customer: false };
}

export function serializeCustomerLead(input: { bundle: TenantDouyinLeadBundle;
  tenantId: string; visibleCustomerOwnerIds: readonly string[] | null;
  phonePrivacy: TenantDouyinLeadPhonePrivacyPort }): CustomerLeadSummary {
  assertPublicLeadBundleScope(input.bundle, input.tenantId);
  const phone = input.phonePrivacy.serializeMaskedPhoneOnly(input.bundle.lead.phone);
  const publicLead = serializePublicLead({ bundle: input.bundle, tenantId: input.tenantId,
    phoneMasked: phone.phone_masked, detail: false });
  const { id, name, phone_masked, community, status, version, assignee,
    created_at, followed_at, follow_remark } = publicLead;
  return { id, name, phone_masked, community, status, version, assignee,
    created_at, followed_at, follow_remark,
    source: "douyin_miniapp", source_label: CUSTOMER_LEAD_SOURCE_LABELS.douyin_miniapp,
    assigned_employee_id: input.bundle.lead.assigned_employee_id,
    ...customerLink(input.bundle.customer, input.tenantId, input.visibleCustomerOwnerIds) };
}

export function serializeCustomerLeadAppointment(row: TenantDouyinAppointmentDetailRow): CustomerLeadAppointment {
  return customerAppointmentFromPublic(serializePublicAppointment(row, { includeSource: true }));
}

export function customerAppointmentFromPublic(row: ReturnType<typeof serializePublicAppointment>): CustomerLeadAppointment {
  const { id, appointment_no, preferred_visit_date, preferred_visit_period,
    community, status, confirmed_visit_at, created_at, updated_at, version } = row;
  return { id, appointment_no, preferred_visit_date, preferred_visit_period,
    community, status, confirmed_visit_at, created_at, updated_at, version,
    source_context: "source" in row ? row.source : null };
}

export function serializeCustomerLeadFollowUp(row: TenantDouyinFollowUpBundle,
  tenantId: string, leadId: string): CustomerLeadFollowUp {
  return { ...serializePublicFollowUp(row, tenantId, leadId),
    id: row.followUp.id, appointment_id: row.followUp.douyin_measurement_appointment_id };
}
