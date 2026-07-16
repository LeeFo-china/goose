export type PhoneIdentityTargetMode =
  | "customer"
  | "tenant_employee"
  | "platform_partner";

export type PhoneIdentityBindingState =
  | "current"
  | "bindable"
  | "rebind_required";

export type PhoneIdentityCandidate = {
  candidateId: string;
  targetMode: PhoneIdentityTargetMode;
  bindingState: PhoneIdentityBindingState;
  rebindKind?: "tenant_wechat" | "platform_partner";
  tenantId: string | null;
  customerId: string | null;
  employeeId: string | null;
  partnerId: string | null;
  partnerMemberId: string | null;
  roleLabel: string;
  title: string;
  subtitle: string;
  sharePreferred: boolean;
};

export type CandidateDiscoveryResult = {
  rawMatchCount: number;
  candidates: PhoneIdentityCandidate[];
};
