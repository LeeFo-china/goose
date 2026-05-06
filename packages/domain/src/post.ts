export const EMPLOYEE_POST_CODE_VALUES = [
  'GENERAL_MANAGER',
  'OPERATIONS_DIRECTOR',
  'GENERAL_MANAGER_ASSISTANT',
  'HR_ADMIN_MANAGER',
  'HR_SPECIALIST',
  'ADMIN_SPECIALIST',
  'MARKETING_DIRECTOR',
  'MARKETING_MANAGER',
  'NEW_MEDIA_OPERATOR',
  'VIDEO_EDITOR',
  'LIVE_STREAM_OPERATOR',
  'AD_OPERATOR',
  'CUSTOMER_INVITER',
  'SALES_MANAGER',
  'SALES_CONSULTANT',
  'TELESALES',
  'CHANNEL_MANAGER',
  'DESIGN_DIRECTOR',
  'CHIEF_DESIGNER',
  'INTERIOR_DESIGNER',
  'ASSISTANT_DESIGNER',
  'RENDERING_DESIGNER',
  'ENGINEERING_DIRECTOR',
  'PROJECT_MANAGER',
  'CONSTRUCTION_SUPER',
  'QUALITY_INSPECTOR',
  'SAFETY_OFFICER',
  'HYDROPOWER_FOREMAN',
  'TILE_FOREMAN',
  'CARPENTRY_FOREMAN',
  'PAINT_FOREMAN',
  'MAINTENANCE_WORKER',
  'PROCUREMENT_MANAGER',
  'PROCURE_OFFICER',
  'MATERIAL_CLERK',
  'WAREHOUSE_KEEPER',
  'DELIVERY_COORDINATOR',
  'FINANCE_MANAGER',
  'FINANCE_ACCOUNTANT',
  'CASHIER',
  'COST_ACCOUNTANT',
  'CUSTOMER_SERVICE_MANAGER',
  'CUSTOMER_SERVICE',
  'AFTER_SALES_SPECIALIST',
  'CUSTOMER_RETURN_VISITOR',
  'SYSTEM_ADMIN',
  'DATA_SPECIALIST',
  'IT_SUPPORT',
] as const;

export type EmployeePostCode = (typeof EMPLOYEE_POST_CODE_VALUES)[number];

export const POST_CODE_VALUES = EMPLOYEE_POST_CODE_VALUES;

export type PostCode = EmployeePostCode;

export const SALARY_TYPE_VALUES = [
  'fixed',
  'commission',
  'hourly',
  'performance',
] as const;

export type SalaryType = (typeof SALARY_TYPE_VALUES)[number];

export const POST_STATUS_VALUES = [0, 1] as const;

export type PostStatus = (typeof POST_STATUS_VALUES)[number];

export interface PostConfigItem {
  label: string;
  type: 'default' | 'primary' | 'success' | 'warning' | 'danger';
}

export const EmployeePostConfig: Record<EmployeePostCode, PostConfigItem> = {
  GENERAL_MANAGER: { label: '总经理', type: 'danger' },
  OPERATIONS_DIRECTOR: { label: '运营总监', type: 'danger' },
  GENERAL_MANAGER_ASSISTANT: { label: '总经理助理', type: 'primary' },
  HR_ADMIN_MANAGER: { label: '行政人事主管', type: 'warning' },
  HR_SPECIALIST: { label: '人事专员', type: 'primary' },
  ADMIN_SPECIALIST: { label: '行政专员', type: 'primary' },
  MARKETING_DIRECTOR: { label: '营销总监', type: 'danger' },
  MARKETING_MANAGER: { label: '市场经理', type: 'warning' },
  NEW_MEDIA_OPERATOR: { label: '新媒体运营', type: 'primary' },
  VIDEO_EDITOR: { label: '摄影剪辑', type: 'primary' },
  LIVE_STREAM_OPERATOR: { label: '直播运营', type: 'primary' },
  AD_OPERATOR: { label: '投流专员', type: 'primary' },
  CUSTOMER_INVITER: { label: '客服邀约专员', type: 'primary' },
  SALES_MANAGER: { label: '销售经理', type: 'warning' },
  SALES_CONSULTANT: { label: '客户经理', type: 'primary' },
  TELESALES: { label: '电话销售', type: 'primary' },
  CHANNEL_MANAGER: { label: '渠道经理', type: 'primary' },
  DESIGN_DIRECTOR: { label: '设计总监', type: 'danger' },
  CHIEF_DESIGNER: { label: '主案设计师', type: 'warning' },
  INTERIOR_DESIGNER: { label: '设计师', type: 'primary' },
  ASSISTANT_DESIGNER: { label: '助理设计师', type: 'primary' },
  RENDERING_DESIGNER: { label: '效果图设计师', type: 'primary' },
  ENGINEERING_DIRECTOR: { label: '工程总监', type: 'danger' },
  PROJECT_MANAGER: { label: '项目经理', type: 'warning' },
  CONSTRUCTION_SUPER: { label: '工程监理', type: 'success' },
  QUALITY_INSPECTOR: { label: '质检专员', type: 'success' },
  SAFETY_OFFICER: { label: '安全员', type: 'success' },
  HYDROPOWER_FOREMAN: { label: '水电工长', type: 'warning' },
  TILE_FOREMAN: { label: '瓦工工长', type: 'warning' },
  CARPENTRY_FOREMAN: { label: '木工工长', type: 'warning' },
  PAINT_FOREMAN: { label: '油漆工长', type: 'warning' },
  MAINTENANCE_WORKER: { label: '维修工', type: 'warning' },
  PROCUREMENT_MANAGER: { label: '采购主管', type: 'warning' },
  PROCURE_OFFICER: { label: '采购专员', type: 'primary' },
  MATERIAL_CLERK: { label: '材料员', type: 'primary' },
  WAREHOUSE_KEEPER: { label: '仓库管理员', type: 'primary' },
  DELIVERY_COORDINATOR: { label: '配送协调员', type: 'primary' },
  FINANCE_MANAGER: { label: '财务经理', type: 'warning' },
  FINANCE_ACCOUNTANT: { label: '会计', type: 'success' },
  CASHIER: { label: '出纳', type: 'success' },
  COST_ACCOUNTANT: { label: '成本核算员', type: 'success' },
  CUSTOMER_SERVICE_MANAGER: { label: '客服主管', type: 'warning' },
  CUSTOMER_SERVICE: { label: '客服专员', type: 'primary' },
  AFTER_SALES_SPECIALIST: { label: '售后专员', type: 'warning' },
  CUSTOMER_RETURN_VISITOR: { label: '回访专员', type: 'primary' },
  SYSTEM_ADMIN: { label: '系统管理员', type: 'danger' },
  DATA_SPECIALIST: { label: '数据专员', type: 'primary' },
  IT_SUPPORT: { label: 'IT技术支持', type: 'primary' },
};

export const PostConfig = EmployeePostConfig;

export const SalaryTypeConfig: Record<SalaryType, PostConfigItem> = {
  fixed: { label: '固定薪资', type: 'default' },
  commission: { label: '底薪+提成', type: 'primary' },
  hourly: { label: '时薪制', type: 'warning' },
  performance: { label: '绩效考核', type: 'success' },
};

export const PostStatusConfig: Record<PostStatus, PostConfigItem> = {
  1: { label: '启用', type: 'success' },
  0: { label: '禁用', type: 'danger' },
};

export const isEmployeePostCode = (
  value: string | null | undefined,
): value is EmployeePostCode =>
  typeof value === 'string' &&
  EMPLOYEE_POST_CODE_VALUES.includes(value as EmployeePostCode);

export const isPostCode = isEmployeePostCode;

export const isSalaryType = (
  value: string | null | undefined,
): value is SalaryType =>
  typeof value === 'string' && SALARY_TYPE_VALUES.includes(value as SalaryType);

export const isPostStatus = (
  value: number | null | undefined,
): value is PostStatus =>
  typeof value === 'number' && POST_STATUS_VALUES.includes(value as PostStatus);
