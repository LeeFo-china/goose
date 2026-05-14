export type IdentityDiagnosticSeverity = "ok" | "warning" | "danger";

export type IdentityDiagnosticQuery = {
  keyword: string;
  type: "phone" | "openid" | "user_id" | "unknown";
  openid_hash: string | null;
};

export type IdentityDiagnosticSummary = {
  auth_user_count: number;
  oauth_identity_count: number;
  active_oauth_identity_count: number;
  history_oauth_identity_count: number;
  legacy_wechat_identity_count: number;
  membership_count: number;
  active_membership_count: number;
  history_membership_count: number;
  customer_count: number;
  employee_count: number;
  event_count: number;
  issue_count: number;
  danger_count: number;
  warning_count: number;
};

export type IdentityDiagnosticTenantLite = {
  id: string;
  name: string | null;
  slug: string | null;
  status: string | null;
};

export type IdentityDiagnosticAuthUser = {
  id: string;
  email: string | null;
  phone: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
};

export type IdentityDiagnosticOauthIdentity = {
  id: string;
  user_id: string;
  platform: string;
  openid: string;
  unionid: string | null;
  status: string;
  bound_at: string | null;
  unbound_at: string | null;
  created_at: string;
  updated_at: string;
};

export type IdentityDiagnosticLegacyWechatIdentity = {
  id?: string;
  auth_user_id: string;
  openid: string;
  unionid: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type IdentityDiagnosticMembership = {
  id: string;
  user_id: string;
  tenant_id: string | null;
  identity_type: string;
  identity_id: string;
  status: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export type IdentityDiagnosticCustomer = {
  id: string;
  tenant_id: string | null;
  name: string | null;
  phone: string | null;
  user_id: string | null;
  status?: string | null;
};

export type IdentityDiagnosticEmployee = {
  id: string;
  tenant_id: string | null;
  name: string | null;
  phone: string | null;
  user_id: string | null;
  status: string | null;
};

export type IdentityDiagnosticAuthEvent = {
  id: string;
  user_id: string | null;
  event_type: string;
  platform: string | null;
  openid_hash: string | null;
  operator_user_id: string | null;
  ip: string | null;
  user_agent: string | null;
  metadata: unknown;
  created_at: string;
};

export type IdentityDiagnosticIssue = {
  severity: IdentityDiagnosticSeverity;
  code: string;
  title: string;
  description: string;
  related_user_id?: string | null;
  related_identity_id?: string | null;
};

export type IdentityDiagnosticData = {
  query: IdentityDiagnosticQuery;
  summary: IdentityDiagnosticSummary;
  current: {
    memberships: IdentityDiagnosticMembership[];
    oauth_identities: IdentityDiagnosticOauthIdentity[];
  };
  history: {
    memberships: IdentityDiagnosticMembership[];
    oauth_identities: IdentityDiagnosticOauthIdentity[];
  };
  auth_users: IdentityDiagnosticAuthUser[];
  oauth_identities: IdentityDiagnosticOauthIdentity[];
  legacy_wechat_identities: IdentityDiagnosticLegacyWechatIdentity[];
  memberships: IdentityDiagnosticMembership[];
  customers: IdentityDiagnosticCustomer[];
  employees: IdentityDiagnosticEmployee[];
  tenants: IdentityDiagnosticTenantLite[];
  auth_events: IdentityDiagnosticAuthEvent[];
  issues: IdentityDiagnosticIssue[];
};
