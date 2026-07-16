import { createHash } from "node:crypto";
import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import {
  buildVisitorSessionId,
  signVisitorSession,
} from "@/services/wechat-auth-legacy/common";
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
  input: {
    authUserId: string;
    openid: string;
    unionid?: string | null;
    phone: string;
    request?: PhoneIdentityBindingSelection["request"];
  },
): PhoneIdentityBindingSelection {
  return {
    targetMode: candidate.targetMode,
    tenantId: candidate.tenantId,
    customerId: candidate.customerId,
    employeeId: candidate.employeeId,
    partnerMemberId: candidate.partnerMemberId,
    authUserId: input.authUserId,
    openid: input.openid,
    unionid: input.unionid ?? null,
    phone: input.phone,
    request: input.request ?? null,
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
    binding_state: candidate.bindingState,
    display_snapshot: {
      role_label: candidate.roleLabel,
      title: candidate.title,
      subtitle: candidate.subtitle,
      rebind_kind: candidate.rebindKind ?? null,
    },
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

export function defaultVisitorSigner(input: VisitorSignerInput) {
  const visitorId = buildVisitorSessionId(input.openid);
  return {
    visitorId,
    token: signVisitorSession({
      authUserId: input.authUserId,
      openid: input.openid,
      unionid: input.unionid ?? null,
      visitorId,
      verifiedPhone: input.verifiedPhone,
      shareLinkId: input.shareLinkId ?? null,
    }),
  };
}

export function selectionError(status: string) {
  if (status === "expired") {
    return Errors.business(
      410,
      "身份选择凭证已过期，请重新验证手机号",
      ErrorCodes.IDENTITY_SELECTION_EXPIRED,
    );
  }
  if (status === "selection_consumed") {
    return Errors.business(
      409,
      "身份选择凭证已使用",
      ErrorCodes.IDENTITY_SELECTION_CONSUMED,
    );
  }
  if (status === "in_progress") {
    return Errors.business(
      409,
      "身份选择处理中，请稍后重试",
      ErrorCodes.IDENTITY_SELECTION_IN_PROGRESS,
    );
  }
  if (status === "option_unavailable") {
    return Errors.business(
      409,
      "所选身份不可用，请重新验证手机号",
      ErrorCodes.IDENTITY_OPTION_UNAVAILABLE,
    );
  }
  return Errors.unauthorized(
    "请先完成手机号验证",
    ErrorCodes.AUTH_SESSION_REQUIRED,
  );
}
