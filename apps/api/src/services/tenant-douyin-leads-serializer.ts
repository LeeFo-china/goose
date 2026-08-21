import type {
  TenantDouyinLeadBundle,
  TenantDouyinFollowUpBundle,
} from "@/repositories/tenant-douyin-leads-hydration";
import {
  assertPublicLeadBundleScope,
  serializePublicFollowUp,
  serializePublicLead,
} from "@/services/tenant-douyin-leads-public";

export type TenantDouyinLeadPhonePrivacyPort = {
  serializeMaskedPhoneOnly(phone: string | null | undefined): {
    phone: string | null;
    phone_masked: string | null;
  };
};

export function serializeLeadBundle(input: {
  bundle: TenantDouyinLeadBundle;
  tenantId: string;
  phonePrivacy: TenantDouyinLeadPhonePrivacyPort;
  includeDetail: boolean;
}) {
  assertPublicLeadBundleScope(input.bundle, input.tenantId);
  const { lead } = input.bundle;
  const phoneFields = input.phonePrivacy.serializeMaskedPhoneOnly(lead.phone);
  return serializePublicLead({ bundle: input.bundle, tenantId: input.tenantId,
    phoneMasked: phoneFields.phone_masked, detail: input.includeDetail });
}

export function serializeFollowUpBundle(
  bundle: TenantDouyinFollowUpBundle,
  tenantId: string,
  leadId: string,
) {
  return serializePublicFollowUp(bundle, tenantId, leadId);
}

export function serializeAssigneeCandidate(row: {
  id: string;
  name: string | null;
}) {
  const name = row.name?.trim().slice(0, 100) || "未命名员工";
  return { id: row.id, name };
}
