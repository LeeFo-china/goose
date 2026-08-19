export const personaNames = {
  blockedAdmin: "blocked_admin",
  blockedEmployee: "blocked_employee",
  graceTenant: "grace_tenant",
  normalTenant: "normal_tenant",
  platformAdmin: "platform_admin",
};

export const purchaseUrl = "https://wxaurl.cn/mockServiceAccessPurchase";

const tenantId = "a1000000-0000-4000-8000-000000000001";
const trialId = "a1000000-0000-4000-8000-000000000002";
const evaluatedAt = "2026-08-20T10:00:00.000+08:00";
const recoveryPermissions = [
  "billing.service_trial.apply",
  "billing.service_trial.read",
  "billing.service_order.create",
  "billing.service_order.read",
];

function permission(code) {
  return { code, scope: "all" };
}

function tenantSession({ key, name, role, permissions }) {
  return {
    user_id: `service-access-${key}`,
    login_channel: "admin_web",
    employee: {
      id: `a2000000-0000-4000-8000-00000000000${name.length % 9}`,
      name,
      phone: "18800000001",
      status: "active",
      tenant_department_id: null,
      department_name: "测试部门",
      post_id: null,
      post_name: role === "tenant_admin" ? "企业管理员" : "普通员工",
      avatar: null,
    },
    tenant: {
      id: tenantId,
      name: "服务门禁测试企业",
      slug: "service-access-e2e",
      status: "active",
    },
    roles: [role],
    permissions: permissions.map(permission),
    token: `service-access-${key}-token`,
    expires_at: "2026-12-31T23:59:59.000+08:00",
  };
}

export const sessions = {
  [personaNames.normalTenant]: tenantSession({
    key: "normal",
    name: "正常租户管理员",
    role: "tenant_admin",
    permissions: recoveryPermissions,
  }),
  [personaNames.blockedAdmin]: tenantSession({
    key: "blocked-admin",
    name: "阻断租户管理员",
    role: "tenant_admin",
    permissions: recoveryPermissions,
  }),
  [personaNames.blockedEmployee]: tenantSession({
    key: "blocked-employee",
    name: "阻断普通员工",
    role: "employee",
    permissions: [],
  }),
  [personaNames.graceTenant]: tenantSession({
    key: "grace",
    name: "宽限期租户管理员",
    role: "tenant_admin",
    permissions: recoveryPermissions,
  }),
  [personaNames.platformAdmin]: {
    user_id: "service-access-platform-admin",
    login_channel: "admin_web",
    employee: {
      id: "a2000000-0000-4000-8000-000000000009",
      name: "平台管理员",
      phone: "18800000009",
      status: "active",
      tenant_department_id: null,
      department_name: "平台运营",
      post_id: null,
      post_name: "平台管理员",
      avatar: null,
    },
    tenant: null,
    roles: ["platform_admin"],
    permissions: [permission("platform.tenant.read")],
    is_platform_staff: true,
    is_platform_super_admin: true,
    token: "service-access-platform-token",
    expires_at: "2026-12-31T23:59:59.000+08:00",
  },
};

const baseSummary = {
  accessMode: "service_blocked",
  accessLevel: "none",
  accessStatus: "service_blocked",
  canEnterWorkspace: false,
  readonly: false,
  trialId: null,
  trialStatus: null,
  startsAt: null,
  endsAt: null,
  evaluatedAt,
  title: "尚未开通平台技术服务",
  message: "当前企业尚未开通平台技术服务，请通过可用恢复入口处理。",
  primaryAction: { key: "apply_trial", label: "申请试用" },
  secondaryAction: { key: "purchase_service", label: "购买正式服务" },
};

export function serviceAccessSummary(persona, forceBlocked = false) {
  if (forceBlocked) return structuredClone(baseSummary);
  if (persona === personaNames.normalTenant) {
    return {
      ...structuredClone(baseSummary),
      accessMode: "paid",
      accessLevel: "read_write",
      accessStatus: "workspace_available",
      canEnterWorkspace: true,
      title: "平台技术服务可用",
      message: "当前企业可正常使用工作台。",
      primaryAction: { key: "enter_workspace", label: "进入工作台" },
      secondaryAction: null,
    };
  }
  if (persona === personaNames.graceTenant) {
    return {
      ...structuredClone(baseSummary),
      accessMode: "grace",
      accessLevel: "read_only",
      accessStatus: "grace_period",
      canEnterWorkspace: true,
      readonly: true,
      trialId,
      trialStatus: "grace_period",
      startsAt: "2026-08-01T00:00:00.000+08:00",
      endsAt: "2026-08-31T23:59:59.000+08:00",
      title: "平台技术服务处于只读宽限期",
      message: "当前可查看已有数据，暂不可执行写操作。",
      primaryAction: {
        key: "enter_readonly_workspace",
        label: "只读进入工作台",
      },
      secondaryAction: { key: "purchase_service", label: "购买正式服务" },
    };
  }
  if (persona === personaNames.blockedEmployee) {
    return {
      ...structuredClone(baseSummary),
      primaryAction: { key: "contact_tenant_admin", label: "联系企业管理员" },
      secondaryAction: { key: "refresh", label: "刷新状态" },
    };
  }
  return structuredClone(baseSummary);
}

export const serviceProduct = {
  id: "a3000000-0000-4000-8000-000000000001",
  code: "TECH-SERVICE-1Y",
  status: "enabled",
  published_version_id: "a3000000-0000-4000-8000-000000000002",
  title: "平台技术服务一年版",
  term_years: 1,
  list_amount_fen: 128000,
  amount_fen: 98000,
  price_rate_basis_points: 7656,
  pricing_version: 1,
  service_scope: ["项目管理", "企业协作"],
  terms_version: 1,
  terms_content: "测试服务条款",
};

export function trialApplication() {
  return {
    id: trialId,
    status: "pending_review",
    application_reason: "E2E 服务门禁回归",
    expected_user_count: 8,
    expected_project_count: 20,
    contact_name: "测试联系人",
    contact_phone: "13800138000",
    requested_at: evaluatedAt,
    reviewed_at: null,
    starts_at: null,
    trial_ends_at: null,
    grace_ends_at: null,
  };
}

export function pagination(total = 0) {
  return { page: 1, pageSize: 20, total, totalPages: total > 0 ? 1 : 0 };
}

export const tenantBillingSummary = {
  account: {
    id: "a4000000-0000-4000-8000-000000000001",
    tenant_id: tenantId,
    balance_credits: 0,
    frozen_credits: 0,
    available_credits: 0,
    total_recharged_credits: 0,
    total_consumed_credits: 0,
    status: "active",
    last_activity_at: null,
    updated_at: evaluatedAt,
  },
  period: { start_date: null, end_date: null },
  totals: {
    recharged_credits: 0,
    consumed_credits: 0,
    frozen_credits: 0,
    available_credits: 0,
  },
  metrics: [],
  subscription_lock: {
    locked: false,
    reason: null,
    locked_at: null,
    last_invoice_id: null,
  },
};
