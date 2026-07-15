import { randomUUID } from "node:crypto";
import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import type {
  PhoneCustomerRecord,
  PhoneEmployeeRecord,
  RelationOne,
} from "@/repositories/phone-identity-candidates";
import type { PlatformPartnerMemberRecord } from "@/repositories/platform-partner-portal-types";
import type {
  CandidateDiscoveryResult,
  PhoneIdentityBindingState,
  PhoneIdentityCandidate,
  PhoneIdentityTargetMode,
} from "./types";

export type BuildPhoneIdentityCandidatesInput = {
  currentAuthUserId: string;
  customers: PhoneCustomerRecord[];
  employees: PhoneEmployeeRecord[];
  partnerMembers: PlatformPartnerMemberRecord[];
  activeMembershipKeys: Set<string>;
  activeWechatOauthUserIds: Set<string>;
  shareTenantId?: string | null;
  createCandidateId?: () => string;
};

type TenantInfo = {
  id: string | null;
  name: string | null;
  status: string | null;
};

const BINDING_RANK: Record<PhoneIdentityBindingState, number> = {
  current: 0,
  bindable: 1,
  rebind_required: 2,
};

const MODE_RANK: Record<PhoneIdentityTargetMode, number> = {
  customer: 0,
  tenant_employee: 1,
  platform_partner: 2,
};

const MAX_CANDIDATES = 100;

export function buildPhoneIdentityCandidates(
  input: BuildPhoneIdentityCandidatesInput,
): CandidateDiscoveryResult {
  const createCandidateId = input.createCandidateId ?? randomUUID;
  const rawMatchCount = input.customers.length +
    input.employees.length +
    input.partnerMembers.length;
  const candidates = [
    ...buildCustomerCandidates(input, createCandidateId),
    ...buildEmployeeCandidates(input, createCandidateId),
    ...buildPartnerCandidates(input, createCandidateId),
  ];
  const deduplicated = deduplicateCandidates(candidates);

  if (deduplicated.length > MAX_CANDIDATES) {
    throw Errors.business(
      422,
      "该手机号关联身份过多，请联系平台处理",
      ErrorCodes.IDENTITY_CANDIDATE_LIMIT_EXCEEDED,
    );
  }

  return {
    rawMatchCount,
    candidates: deduplicated.sort(compareCandidates),
  };
}

export function resolveBindingState(input: {
  currentAuthUserId: string;
  recordUserId: string | null;
  membershipCurrent: boolean;
  recordUserHasActiveWechat: boolean;
}): PhoneIdentityBindingState {
  if (input.recordUserId === input.currentAuthUserId || input.membershipCurrent) {
    return "current";
  }
  if (!input.recordUserId || !input.recordUserHasActiveWechat) {
    return "bindable";
  }
  return "rebind_required";
}

function buildCustomerCandidates(
  input: BuildPhoneIdentityCandidatesInput,
  createCandidateId: () => string,
): PhoneIdentityCandidate[] {
  return input.customers.flatMap((record) => {
    const tenant = relationOne(record.tenant);
    if (!record.tenant_id || !tenant || tenant.status !== "active") {
      return [];
    }

    const bindingState = resolveBindingState({
      currentAuthUserId: input.currentAuthUserId,
      recordUserId: record.user_id,
      membershipCurrent: input.activeMembershipKeys.has(
        `customer:${record.tenant_id}:${record.id}`,
      ),
      recordUserHasActiveWechat: Boolean(
        record.user_id && input.activeWechatOauthUserIds.has(record.user_id),
      ),
    });

    return [{
      candidateId: createCandidateId(),
      targetMode: "customer",
      bindingState,
      rebindKind: bindingState === "rebind_required"
        ? "tenant_wechat"
        : undefined,
      tenantId: record.tenant_id,
      customerId: record.id,
      employeeId: null,
      partnerId: null,
      partnerMemberId: null,
      roleLabel: "客户",
      title: tenant.name ?? "装修公司",
      subtitle: record.name ?? record.phone ?? "客户",
      sharePreferred: input.shareTenantId === record.tenant_id,
    }];
  });
}

function buildEmployeeCandidates(
  input: BuildPhoneIdentityCandidatesInput,
  createCandidateId: () => string,
): PhoneIdentityCandidate[] {
  return input.employees.flatMap((record) => {
    const tenant = relationOne(record.tenant);
    if (
      !record.tenant_id ||
      record.status !== "active" ||
      !tenant ||
      tenant.status !== "active"
    ) {
      return [];
    }

    const bindingState = resolveBindingState({
      currentAuthUserId: input.currentAuthUserId,
      recordUserId: record.user_id,
      membershipCurrent: input.activeMembershipKeys.has(
        `employee:${record.tenant_id}:${record.id}`,
      ),
      recordUserHasActiveWechat: Boolean(
        record.user_id && input.activeWechatOauthUserIds.has(record.user_id),
      ),
    });
    const department = relationOne(record.tenant_department);
    const post = relationOne(record.post);

    return [{
      candidateId: createCandidateId(),
      targetMode: "tenant_employee",
      bindingState,
      rebindKind: bindingState === "rebind_required"
        ? "tenant_wechat"
        : undefined,
      tenantId: record.tenant_id,
      customerId: null,
      employeeId: record.id,
      partnerId: null,
      partnerMemberId: null,
      roleLabel: "员工",
      title: tenant.name ?? "装修公司",
      subtitle: [record.name, department?.alias_name, post?.name]
        .filter(Boolean)
        .join(" / ") || "员工",
      sharePreferred: input.shareTenantId === record.tenant_id,
    }];
  });
}

function buildPartnerCandidates(
  input: BuildPhoneIdentityCandidatesInput,
  createCandidateId: () => string,
): PhoneIdentityCandidate[] {
  return input.partnerMembers.flatMap((record) => {
    const partner = relationOne(record.partner);
    if (
      record.status === "disabled" ||
      !partner ||
      partner.status !== "active"
    ) {
      return [];
    }

    const bindingState = resolveBindingState({
      currentAuthUserId: input.currentAuthUserId,
      recordUserId: record.auth_user_id,
      membershipCurrent: false,
      recordUserHasActiveWechat: Boolean(
        record.auth_user_id &&
          input.activeWechatOauthUserIds.has(record.auth_user_id),
      ),
    });

    return [{
      candidateId: createCandidateId(),
      targetMode: "platform_partner",
      bindingState,
      rebindKind: bindingState === "rebind_required"
        ? "platform_partner"
        : undefined,
      tenantId: null,
      customerId: null,
      employeeId: null,
      partnerId: record.partner_id,
      partnerMemberId: record.id,
      roleLabel: "城市合伙人",
      title: partner.name ?? "城市合伙人",
      subtitle: record.name,
      sharePreferred: false,
    }];
  });
}

function relationOne<T>(value: RelationOne<T>): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function deduplicateCandidates(
  candidates: PhoneIdentityCandidate[],
): PhoneIdentityCandidate[] {
  const byKey = new Map<string, PhoneIdentityCandidate>();
  for (const candidate of candidates) {
    const key = candidateKey(candidate);
    if (!byKey.has(key)) {
      byKey.set(key, candidate);
    }
  }
  return Array.from(byKey.values());
}

function candidateKey(candidate: PhoneIdentityCandidate): string {
  if (candidate.targetMode === "customer") {
    return `customer:${candidate.tenantId ?? ""}:${candidate.customerId}`;
  }
  if (candidate.targetMode === "tenant_employee") {
    return `employee:${candidate.tenantId ?? ""}:${candidate.employeeId}`;
  }
  return `partner:${candidate.partnerId}:${candidate.partnerMemberId}`;
}

function compareCandidates(
  left: PhoneIdentityCandidate,
  right: PhoneIdentityCandidate,
) {
  return compareBooleanRank(left.sharePreferred, right.sharePreferred) ||
    BINDING_RANK[left.bindingState] - BINDING_RANK[right.bindingState] ||
    MODE_RANK[left.targetMode] - MODE_RANK[right.targetMode] ||
    left.title.localeCompare(right.title) ||
    businessId(left).localeCompare(businessId(right));
}

function compareBooleanRank(left: boolean, right: boolean) {
  if (left === right) return 0;
  return left ? -1 : 1;
}

function businessId(candidate: PhoneIdentityCandidate) {
  return candidate.customerId ??
    candidate.employeeId ??
    candidate.partnerMemberId ??
    candidate.candidateId;
}
