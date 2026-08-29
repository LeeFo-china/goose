import {
  DEPARTMENT_CODE_VALUES,
  DepartmentConfig,
  EMPLOYEE_POST_CODE_VALUES,
  EmployeePostConfig,
  type DepartmentCode,
  type EmployeePostCode,
  type PermissionCode,
} from "@gooes/domain";

export const enabledDepartments = [
  "EXEC_OFFICE", "MARKETING", "DESIGN", "PROJECT", "FINANCE", "SELF_MEDIA",
  "CUSTOMER_SERVICE",
] as const satisfies readonly DepartmentCode[];

export const enabledPosts = [
  "GENERAL_MANAGER", "SYSTEM_ADMIN", "SALES_CONSULTANT", "MARKETING_MANAGER",
  "DESIGN_DIRECTOR", "CHIEF_DESIGNER", "ENGINEERING_DIRECTOR", "CONSTRUCTION_SUPER",
  "HYDROPOWER_FOREMAN", "TILE_FOREMAN", "CARPENTRY_FOREMAN", "PAINT_FOREMAN",
  "MAINTENANCE_WORKER", "FINANCE_ACCOUNTANT", "FINANCE_MANAGER", "OPERATIONS_DIRECTOR",
  "NEW_MEDIA_OPERATOR", "VIDEO_EDITOR", "LIVE_STREAM_OPERATOR",
  "CUSTOMER_SERVICE_MANAGER", "CUSTOMER_SERVICE",
] as const satisfies readonly EmployeePostCode[];

const enabledDepartmentSet = new Set<DepartmentCode>(enabledDepartments);
const enabledPostSet = new Set<EmployeePostCode>(enabledPosts);

export type DepartmentTuple = [DepartmentCode, string, boolean, number];
export type PostTuple = [EmployeePostCode, string, number, number];

export const expectedDepartments: DepartmentTuple[] = DEPARTMENT_CODE_VALUES.map(
  (code, index) => [code, DepartmentConfig[code].label, enabledDepartmentSet.has(code), index + 1],
);

export const expectedPosts: PostTuple[] = EMPLOYEE_POST_CODE_VALUES.map(
  (code, index) => [code, EmployeePostConfig[code].label, enabledPostSet.has(code) ? 1 : 0, index + 1],
);

const departmentPostCodes = [
  ["EXEC_OFFICE", "GENERAL_MANAGER"], ["EXEC_OFFICE", "SYSTEM_ADMIN"],
  ["MARKETING", "SALES_CONSULTANT"], ["MARKETING", "MARKETING_MANAGER"],
  ["DESIGN", "DESIGN_DIRECTOR"], ["DESIGN", "CHIEF_DESIGNER"],
  ["PROJECT", "ENGINEERING_DIRECTOR"], ["PROJECT", "CONSTRUCTION_SUPER"],
  ["PROJECT", "HYDROPOWER_FOREMAN"], ["PROJECT", "TILE_FOREMAN"],
  ["PROJECT", "CARPENTRY_FOREMAN"], ["PROJECT", "PAINT_FOREMAN"],
  ["PROJECT", "MAINTENANCE_WORKER"], ["FINANCE", "FINANCE_ACCOUNTANT"],
  ["FINANCE", "FINANCE_MANAGER"], ["SELF_MEDIA", "OPERATIONS_DIRECTOR"],
  ["SELF_MEDIA", "NEW_MEDIA_OPERATOR"], ["SELF_MEDIA", "VIDEO_EDITOR"],
  ["SELF_MEDIA", "LIVE_STREAM_OPERATOR"],
  ["CUSTOMER_SERVICE", "CUSTOMER_SERVICE_MANAGER"],
  ["CUSTOMER_SERVICE", "CUSTOMER_SERVICE"],
] as const satisfies readonly (readonly [DepartmentCode, EmployeePostCode])[];

const departmentPostAliases: Partial<Record<EmployeePostCode, string>> = {
  SALES_CONSULTANT: "销售专员",
  FINANCE_ACCOUNTANT: "财务专员",
};

export type DepartmentPostTuple = [DepartmentCode, EmployeePostCode, string | null, boolean, number];
export const expectedDepartmentPosts: DepartmentPostTuple[] = departmentPostCodes.map(
  ([department, post], index) => [department, post, departmentPostAliases[post] ?? null, true, index + 1],
);

export const stableRoles = [
  "system_admin", "employee_base", "business_manager", "salesperson", "design_manage",
  "designer", "engineering_manager", "construction_supervisor", "construction_worker",
  "finance_base", "cashier",
] as const;

export type StableRole = (typeof stableRoles)[number];
export type NonAdminRole = Exclude<StableRole, "system_admin">;
export type PermissionScope = "all" | "department" | "self";
export type PermissionTriple = [NonAdminRole, PermissionCode, PermissionScope];
export type RoleTuple = [StableRole, string, string, "active"];

export const expectedRoles: RoleTuple[] = [
  ["system_admin", "系统管理员", "租户管理员，拥有当前租户全部后台管理权限", "active"],
  ["employee_base", "员工基础角色", "无明确业务岗位时的最小基础权限", "active"],
  ["business_manager", "业务经理", "管理市场客户、线索和项目转化", "active"],
  ["salesperson", "业务员", "维护本人客户、线索和项目", "active"],
  ["design_manage", "设计主管", "管理设计部门项目和施工流程", "active"],
  ["designer", "设计师", "维护本人参与的项目和日志", "active"],
  ["engineering_manager", "工程部主管", "管理工程项目、流程和验收", "active"],
  ["construction_supervisor", "工程监理", "执行项目流程、日志和验收", "active"],
  ["construction_worker", "施工人员", "执行本人施工节点和日志", "active"],
  ["finance_base", "财务基础角色", "财务核算、收支、预算和报表", "active"],
  ["cashier", "出纳员", "收付款和应收账款操作", "active"],
];

function permissionsFor(
  role: NonAdminRole,
  scope: PermissionScope,
  permissions: readonly PermissionCode[],
): PermissionTriple[] {
  return permissions.map((permission) => [role, permission, scope]);
}

export const expectedNonAdminPermissions: PermissionTriple[] = [
  ...permissionsFor("employee_base", "self", [
    "dashboard.read", "employee.read", "expense_request.create", "expense_request.read",
    "expense_request.submit", "task_center.read",
  ]),
  ...permissionsFor("business_manager", "all", ["customer.assign_owner", "project.read"]),
  ...permissionsFor("business_manager", "department", [
    "customer.create", "customer.phone.call", "customer.phone.copy", "customer.phone.view",
    "customer.read", "customer.update", "employee.read", "expense_request.approve_manager",
    "expense_request.read", "marketing_lead.read", "marketing_lead.update",
    "marketing_page.create", "marketing_page.delete", "marketing_page.publish",
    "marketing_page.read", "marketing_page.update", "project.create", "project.delete",
    "project.update",
  ]),
  ...permissionsFor("business_manager", "self", [
    "dashboard.read", "expense_request.create", "expense_request.submit", "project_acceptance.read",
    "task_center.read",
  ]),
  ...permissionsFor("salesperson", "self", [
    "customer.create", "customer.phone.call", "customer.phone.view", "customer.read",
    "customer.update", "dashboard.read", "expense_request.create", "expense_request.read",
    "expense_request.submit", "marketing_lead.read", "marketing_lead.update",
    "marketing_page.read", "project.create", "project.delete", "project.read", "project.update",
    "task_center.read",
  ]),
  ...permissionsFor("design_manage", "all", ["project_acceptance.read"]),
  ...permissionsFor("design_manage", "department", [
    "expense_request.approve_manager", "expense_request.read", "project.read",
  ]),
  ...permissionsFor("design_manage", "self", [
    "dashboard.read", "expense_request.create", "expense_request.submit", "project_procedure.adjust",
    "project_procedure.assign", "project_procedure.read", "task_center.read",
  ]),
  ...permissionsFor("designer", "self", [
    "dashboard.read", "expense_request.create", "expense_request.read", "expense_request.submit",
    "project.read", "project.update", "project_log.create", "project_procedure.read",
    "project_acceptance.read", "task_center.read",
  ]),
  ...permissionsFor("engineering_manager", "all", [
    "project_acceptance.manage", "project_acceptance.reject", "project_acceptance.review",
    "project_acceptance.submit", "project.read", "project.update",
  ]),
  ...permissionsFor("engineering_manager", "department", [
    "expense_request.approve_manager", "expense_request.read", "project_acceptance.create",
    "project_acceptance.read", "project_log.create", "project_procedure.adjust",
    "project_procedure.assign", "project_procedure.read",
  ]),
  ...permissionsFor("engineering_manager", "self", [
    "customer.phone.call", "customer.phone.view", "dashboard.read", "employee.read",
    "expense_request.create", "expense_request.submit", "project_acceptance.update_own",
    "task_center.read",
  ]),
  ...permissionsFor("construction_supervisor", "department", [
    "project_acceptance.create", "project_acceptance.submit",
    "project_acceptance.update_own", "project.read",
  ]),
  ...permissionsFor("construction_supervisor", "self", [
    "dashboard.read", "expense_request.create", "expense_request.read", "expense_request.submit",
    "project_acceptance.read", "project_log.create", "project_procedure.adjust",
    "project_procedure.assign", "project_procedure.complete", "project_procedure.read",
    "project.update", "social_video_transcription.create", "social_video_transcription.manage",
    "task_center.read",
  ]),
  ...permissionsFor("construction_worker", "self", [
    "project_log.create", "project_procedure.assignee", "task_center.read",
  ]),
  ...permissionsFor("finance_base", "all", [
    "expense_request.approve_finance", "expense_request.pay", "expense_request.read",
    "finance.budget.manage", "finance.budget.view", "finance.closing.manage", "finance.closing.read",
    "finance.cost-allocation.manage", "finance.cost-category.manage", "finance.cost-category.view",
    "finance.dashboard.view", "finance.expense.pay", "finance.expense.review", "finance.ledger.view",
    "finance.payment.confirm", "finance.payment.create", "finance.receivable.manage",
    "finance.receivable.view", "finance.reconciliation.manage", "finance.reports.export",
    "finance.reports.read", "finance.view", "project_acceptance.read", "project.read",
    "project_referral.manage", "project_referral.read", "wechat_pay.notify.read", "wechat_pay.order.read",
  ]),
  ...permissionsFor("finance_base", "self", [
    "dashboard.read", "expense_request.create", "expense_request.submit", "task_center.read",
  ]),
  ...permissionsFor("cashier", "all", [
    "expense_request.approve_finance", "expense_request.pay", "expense_request.read",
    "finance.expense.pay", "finance.expense.review", "finance.ledger.view", "finance.payment.create",
    "finance.receivable.manage", "finance.receivable.view", "finance.view",
  ]),
  ...permissionsFor("cashier", "department", ["task_center.read"]),
  ...permissionsFor("cashier", "self", [
    "dashboard.read", "finance.budget.view", "finance.cost-allocation.manage",
    "finance.cost-category.manage", "finance.cost-category.view", "finance.dashboard.view",
  ]),
];
