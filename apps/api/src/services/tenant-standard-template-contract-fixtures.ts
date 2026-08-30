import type { PermissionCode } from "@gooes/domain";

export type DepartmentTuple = [string, string, boolean, number];
export type PostTuple = [string, string, number, number];

export const expectedDepartments: DepartmentTuple[] = [
  ["BOARD", "董事会", false, 1],
  ["EXEC_OFFICE", "总裁办/总经理办公室", true, 2],
  ["SALES", "销售部/客户部", false, 3],
  ["MARKETING", "市场部", true, 4],
  ["DESIGN", "设计部", true, 5],
  ["PROJECT", "工程部", true, 6],
  ["PROCURE", "采购部", false, 7],
  ["AFTER_SALE", "售后部/维保部", false, 8],
  ["PRODUCT", "产品部", false, 9],
  ["TECH", "技术研发部", false, 10],
  ["IT", "信息技术部", false, 11],
  ["BIM_CENTER", "BIM中心", false, 12],
  ["SUPPLY_CHAIN", "供应链管理部", false, 13],
  ["LOGISTICS", "物流部", false, 14],
  ["WAREHOUSE", "仓储部", false, 15],
  ["FACTORY", "工厂/生产基地", false, 16],
  ["PROJECT_MGT", "工程项目管理部", false, 17],
  ["QUALITY_SUPERVISION", "质量监理部", false, 18],
  ["SAFETY", "安全监察部", false, 19],
  ["ACCEPTANCE", "竣工验收部", false, 20],
  ["MAINTENANCE", "维修保养部", false, 21],
  ["ADMIN", "行政人事部", false, 22],
  ["FINANCE", "财务部", true, 23],
  ["LEGAL", "法务部", false, 24],
  ["COMPLIANCE", "合规部", false, 25],
  ["INTERNAL_AUDIT", "内审部", false, 26],
  ["BRAND", "品牌管理部", false, 27],
  ["PUBLIC_RELATIONS", "公关部", false, 28],
  ["DIGITAL_MARKETING", "数字营销部", false, 29],
  ["SELF_MEDIA", "自媒体部", true, 30],
  ["CHANNEL", "渠道部", false, 31],
  ["COMMUNITY", "社区运营部", false, 32],
  ["CUSTOMER_SERVICE", "客服部", true, 33],
  ["CUSTOMER_SUCCESS", "客户成功部", false, 34],
  ["COMPLAINTS", "客诉处理部", false, 35],
  ["STRATEGY", "战略发展部", false, 36],
  ["INVESTOR", "投资者关系部", false, 37],
  ["BUSINESS_DEV", "商务拓展部", false, 38],
  ["PMO", "项目管理办公室", false, 39],
  ["TRAINING", "培训部", false, 40],
  ["OPERATIONS", "运营部", false, 41],
  ["DATA_CENTER", "数据中心", false, 42],
];

export const expectedPosts: PostTuple[] = [
  ["GENERAL_MANAGER", "总经理", 1, 1],
  ["OPERATIONS_DIRECTOR", "运营总监", 1, 2],
  ["GENERAL_MANAGER_ASSISTANT", "总经理助理", 0, 3],
  ["HR_ADMIN_MANAGER", "行政人事主管", 0, 4],
  ["HR_SPECIALIST", "人事专员", 0, 5],
  ["ADMIN_SPECIALIST", "行政专员", 0, 6],
  ["MARKETING_DIRECTOR", "营销总监", 0, 7],
  ["MARKETING_MANAGER", "市场经理", 1, 8],
  ["NEW_MEDIA_OPERATOR", "新媒体运营", 1, 9],
  ["VIDEO_EDITOR", "摄影剪辑", 1, 10],
  ["LIVE_STREAM_OPERATOR", "直播运营", 1, 11],
  ["AD_OPERATOR", "投流专员", 0, 12],
  ["CUSTOMER_INVITER", "客服邀约专员", 0, 13],
  ["SALES_MANAGER", "销售经理", 0, 14],
  ["SALES_CONSULTANT", "客户经理", 1, 15],
  ["TELESALES", "电话销售", 0, 16],
  ["CHANNEL_MANAGER", "渠道经理", 0, 17],
  ["DESIGN_DIRECTOR", "设计总监", 1, 18],
  ["CHIEF_DESIGNER", "主案设计师", 1, 19],
  ["INTERIOR_DESIGNER", "设计师", 0, 20],
  ["ASSISTANT_DESIGNER", "助理设计师", 0, 21],
  ["RENDERING_DESIGNER", "效果图设计师", 0, 22],
  ["ENGINEERING_DIRECTOR", "工程总监", 1, 23],
  ["PROJECT_MANAGER", "项目经理", 0, 24],
  ["CONSTRUCTION_SUPER", "工程监理", 1, 25],
  ["QUALITY_INSPECTOR", "质检专员", 0, 26],
  ["SAFETY_OFFICER", "安全员", 0, 27],
  ["HYDROPOWER_FOREMAN", "水电工长", 1, 28],
  ["TILE_FOREMAN", "瓦工工长", 1, 29],
  ["CARPENTRY_FOREMAN", "木工工长", 1, 30],
  ["PAINT_FOREMAN", "油漆工长", 1, 31],
  ["MAINTENANCE_WORKER", "维修工", 1, 32],
  ["PROCUREMENT_MANAGER", "采购主管", 0, 33],
  ["PROCURE_OFFICER", "采购专员", 0, 34],
  ["MATERIAL_CLERK", "材料员", 0, 35],
  ["WAREHOUSE_KEEPER", "仓库管理员", 0, 36],
  ["DELIVERY_COORDINATOR", "配送协调员", 0, 37],
  ["FINANCE_MANAGER", "财务经理", 1, 38],
  ["FINANCE_ACCOUNTANT", "会计", 1, 39],
  ["CASHIER", "出纳", 0, 40],
  ["COST_ACCOUNTANT", "成本核算员", 0, 41],
  ["CUSTOMER_SERVICE_MANAGER", "客服主管", 1, 42],
  ["CUSTOMER_SERVICE", "客服专员", 1, 43],
  ["AFTER_SALES_SPECIALIST", "售后专员", 0, 44],
  ["CUSTOMER_RETURN_VISITOR", "回访专员", 0, 45],
  ["SYSTEM_ADMIN", "系统管理员", 1, 46],
  ["DATA_SPECIALIST", "数据专员", 0, 47],
  ["IT_SUPPORT", "IT技术支持", 0, 48],
];

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
] as const;

const departmentPostAliases: Record<string, string> = {
  SALES_CONSULTANT: "销售专员",
  FINANCE_ACCOUNTANT: "财务专员",
};

export type DepartmentPostTuple = [
  string,
  string,
  string | null,
  boolean,
  number,
];
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
