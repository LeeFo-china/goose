import { createHash } from "node:crypto";
import type { PhoneIdentityBindingSelection } from "./bindings";
import type {
  PhoneIdentityCandidate,
  PhoneIdentityTargetMode,
} from "./types";

export type ShareLoginContext = {
  shareLinkId: string;
  tenantId: string;
  shareEmployeeId?: string | null;
  source?: string | null;
};

export type VisitorSignerInput = {
  authUserId: string;
  openid: string;
  unionid?: string | null;
  verifiedPhone: string;
  shareLinkId?: string | null;
};

export type VisitorSignerOutput = {
  token: string;
  visitorId: string;
};

type BindingCandidate = {
  targetMode: PhoneIdentityTargetMode;
  tenantId: string | null;
  customerId: string | null;
  employeeId: string | null;
  partnerMemberId: string | null;
};

export function toBindingSelection(
  candidate: BindingCandidate,
  input: { authUserId: string; openid: string; phone: string },
): PhoneIdentityBindingSelection {
  return {
    targetMode: candidate.targetMode,
    tenantId: candidate.tenantId,
    customerId: candidate.customerId,
    employeeId: candidate.employeeId,
    partnerMemberId: candidate.partnerMemberId,
    authUserId: input.authUserId,
    openid: input.openid,
    phone: input.phone,
  };
}

export function serializePublicCandidate(candidate: PhoneIdentityCandidate) {
  return {
    candidate_id: candidate.candidateId,
    target_mode: candidate.targetMode,
    role_label: candidate.roleLabel,
    title: candidate.title,
    subtitle: candidate.subtitle,
    binding_state: candidate.bindingState,
    ...(candidate.rebindKind ? { rebind_kind: candidate.rebindKind } : {}),
  };
}

export function serializeStoredCandidate(candidate: PhoneIdentityCandidate) {
  return {
    id: candidate.candidateId,
    target_mode: candidate.targetMode,
    tenant_id: candidate.tenantId,
    customer_id: candidate.customerId,
    employee_id: candidate.employeeId,
    partner_id: candidate.partnerId,
    partner_member_id: candidate.partnerMemberId,
  };
}

export function serializeShareContext(context: ShareLoginContext | null) {
  if (!context) return {};
  return {
    share_link_id: context.shareLinkId,
    tenant_id: context.tenantId,
    share_employee_id: context.shareEmployeeId ?? null,
    source: context.source ?? null,
  };
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function maskPhone(phone: string) {
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}
