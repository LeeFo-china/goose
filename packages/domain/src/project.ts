export const PROJECT_STATUS_VALUES = [
  'lead',
  'measure',
  'negotiating',
  'signed',
  'designing',
  'constructing',
  'on_hold',
  'acceptance',
  'completed',
  'after_sale',
  'invalid',
] as const;

export type ProjectStatus = (typeof PROJECT_STATUS_VALUES)[number];

export interface ProjectStatusConfigItem {
  label: string;
  type: 'default' | 'primary' | 'success' | 'warning' | 'danger';
}

export const ProjectStatusConfig: Record<
  ProjectStatus,
  ProjectStatusConfigItem
> = {
  lead: { label: '线索客户', type: 'default' },
  measure: { label: '量房中', type: 'warning' },
  negotiating: { label: '谈单中', type: 'warning' },
  signed: { label: '已签约', type: 'success' },
  designing: { label: '设计中', type: 'primary' },
  constructing: { label: '施工中', type: 'warning' },
  on_hold: { label: '已暂停', type: 'danger' },
  acceptance: { label: '验收中', type: 'warning' },
  completed: { label: '已完工', type: 'success' },
  after_sale: { label: '售后中', type: 'danger' },
  invalid: { label: '无效客户', type: 'default' },
};

export const isProjectStatus = (
  value: string | null | undefined,
): value is ProjectStatus =>
  typeof value === 'string' &&
  PROJECT_STATUS_VALUES.includes(value as ProjectStatus);

export const PROJECT_VISIBILITY_STATUS_VALUES = [
  'inherit',
  'public',
  'hidden',
] as const;

export type ProjectVisibilityStatus =
  (typeof PROJECT_VISIBILITY_STATUS_VALUES)[number];

export const PROJECT_CREATE_EMPLOYEE_SCENE_VALUES = [
  'project_designer',
  'project_supervisor',
  'project_construction_manager',
] as const;

export type ProjectCreateEmployeeScene =
  (typeof PROJECT_CREATE_EMPLOYEE_SCENE_VALUES)[number];

export const PROJECT_MEMBER_ROLE_CODE_VALUES = [
  'customer_owner',
  'designer',
  'supervisor',
  'construction_manager',
] as const;

export type ProjectMemberRoleCode =
  (typeof PROJECT_MEMBER_ROLE_CODE_VALUES)[number];

export interface ProjectMemberRoleConfigItem {
  label: string;
  sortOrder: number;
}

export const PROJECT_MEMBER_ROLE_CONFIG: Record<
  ProjectMemberRoleCode,
  ProjectMemberRoleConfigItem
> = {
  customer_owner: { label: '跟进员工', sortOrder: 10 },
  designer: { label: '主案设计', sortOrder: 20 },
  supervisor: { label: '施工管理', sortOrder: 30 },
  construction_manager: { label: '施工经理', sortOrder: 40 },
};

export const isProjectMemberRoleCode = (
  value: string | null | undefined,
): value is ProjectMemberRoleCode =>
  typeof value === 'string' &&
  PROJECT_MEMBER_ROLE_CODE_VALUES.includes(value as ProjectMemberRoleCode);
