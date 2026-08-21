import { Errors } from "@/errors/error-factory";
import type {
  TenantDouyinLeadBundle,
  TenantDouyinFollowUpBundle,
} from "@/repositories/tenant-douyin-leads-hydration";
import type {
  CustomerPhonePrivacyContext,
  CustomerPhoneTarget,
} from "@/services/customer-phone-privacy";

export type TenantDouyinLeadPhonePrivacyPort = {
  serializeCustomerPhoneFields(
    context: CustomerPhonePrivacyContext,
    target: CustomerPhoneTarget,
  ): {
    phone: string | null;
    phone_masked: string | null;
    can_view_phone: boolean;
    can_call_phone: boolean;
    can_copy_phone: boolean;
  };
};

export function serializeLeadBundle(input: {
  bundle: TenantDouyinLeadBundle;
  tenantId: string;
  phoneContext: CustomerPhonePrivacyContext;
  phonePrivacy: TenantDouyinLeadPhonePrivacyPort;
  includeDetail: boolean;
}) {
  assertLeadBundleScope(input.bundle, input.tenantId);
  const { lead, appointments, customer, assignee } = input.bundle;
  const phoneFields = input.phonePrivacy.serializeCustomerPhoneFields(
    input.phoneContext,
    {
      id: customer?.id ?? lead.id,
      tenant_id: input.tenantId,
      owner_id: customer?.owner_id ?? lead.assigned_employee_id,
      phone: lead.phone,
    },
  );
  const summary = {
    id: lead.id,
    name: lead.name,
    ...phoneFields,
    community: lead.community,
    status: lead.lead_status,
    version: lead.version,
    created_at: lead.created_at,
    followed_at: lead.followed_at,
    follow_remark: lead.follow_remark,
    customer,
    assignee,
    latest_appointment: appointments[0] ?? null,
  };
  return input.includeDetail
    ? { ...summary, installation_id: lead.douyin_miniapp_installation_id,
      form_data: lead.form_data, appointments: [...appointments] }
    : summary;
}

export function serializeFollowUpBundle(
  bundle: TenantDouyinFollowUpBundle,
  tenantId: string,
  leadId: string,
) {
  if (
    bundle.followUp.tenant_id !== tenantId
    || bundle.followUp.marketing_lead_id !== leadId
    || (bundle.employee !== null && (
      bundle.employee.tenant_id !== tenantId
      || bundle.employee.id !== bundle.followUp.employee_id
    ))
  ) throwInvalidResponse();
  return { ...bundle.followUp, employee: bundle.employee };
}

function assertLeadBundleScope(
  bundle: TenantDouyinLeadBundle,
  tenantId: string,
): void {
  const { lead, appointments, customer, assignee } = bundle;
  if (
    lead.tenant_id !== tenantId
    || (lead.customer_id !== null && customer === null)
    || (lead.assigned_employee_id !== null && assignee === null)
    || appointments.some((appointment) =>
      appointment.tenant_id !== tenantId
      || appointment.marketing_lead_id !== lead.id
      || (appointment.customer_id !== null
        && appointment.customer_id !== lead.customer_id)
    )
    || (customer !== null && (
      customer.tenant_id !== tenantId || customer.id !== lead.customer_id
    ))
    || (assignee !== null && (
      assignee.tenant_id !== tenantId
      || assignee.id !== lead.assigned_employee_id
    ))
  ) throwInvalidResponse();
}

function throwInvalidResponse(): never {
  throw Errors.business(
    500,
    "抖音线索响应数据无效",
    "DOUYIN_LEAD_RESPONSE_INVALID",
  );
}
