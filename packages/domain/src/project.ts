export const PROJECT_STATUS_VALUES = [
  'designing',
  'proposal_confirmed',
  'signed',
  'design_finalized',
  'pending_start',
  'started',
  'constructing',
  'on_hold',
  'acceptance',
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
  designing: { label: '设计中', type: 'primary' },
  proposal_confirmed: { label: '方案已确认', type: 'warning' },
  signed: { label: '已签约', type: 'success' },
  design_finalized: { label: '设计定稿', type: 'primary' },
  pending_start: { label: '待开工', type: 'warning' },
  started: { label: '已开工', type: 'warning' },
  constructing: { label: '施工中', type: 'warning' },
  on_hold: { label: '已暂停', type: 'danger' },
  acceptance: { label: '竣工验收', type: 'success' },
  invalid: { label: '无效项目', type: 'default' },
};

export const isProjectStatus = (
  value: string | null | undefined,
): value is ProjectStatus =>
  typeof value === 'string' &&
  PROJECT_STATUS_VALUES.includes(value as ProjectStatus);

export const PROJECT_STATUS_ACTION_VALUES = [
  'confirm_proposal',
  'sign_contract',
  'finalize_design',
  'schedule_construction',
  'start_project',
  'start_construction',
  'pause_project',
  'resume_project',
  'start_acceptance',
  'mark_invalid',
] as const;

export type ProjectStatusAction = (typeof PROJECT_STATUS_ACTION_VALUES)[number];

export const isProjectStatusAction = (
  value: string | null | undefined,
): value is ProjectStatusAction =>
  typeof value === 'string' &&
  PROJECT_STATUS_ACTION_VALUES.includes(value as ProjectStatusAction);

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
  'budget_manager',
  'material_manager',
  'site_manager',
  'sales_followup',
] as const;

export type ProjectMemberRoleCode =
  (typeof PROJECT_MEMBER_ROLE_CODE_VALUES)[number];

export interface ProjectMemberRoleConfigItem {
  label: string;
  sortOrder: number;
  category: 'core' | 'extended';
  isCore: boolean;
  status: 'active' | 'inactive';
}

export const PROJECT_MEMBER_ROLE_CONFIG: Record<
  ProjectMemberRoleCode,
  ProjectMemberRoleConfigItem
> = {
  customer_owner: {
    label: '跟进员工',
    sortOrder: 10,
    category: 'core',
    isCore: true,
    status: 'active',
  },
  designer: {
    label: '主案设计',
    sortOrder: 20,
    category: 'core',
    isCore: true,
    status: 'active',
  },
  supervisor: {
    label: '施工管理',
    sortOrder: 30,
    category: 'core',
    isCore: true,
    status: 'active',
  },
  construction_manager: {
    label: '施工经理',
    sortOrder: 40,
    category: 'core',
    isCore: true,
    status: 'active',
  },
  budget_manager: {
    label: '预算员',
    sortOrder: 50,
    category: 'extended',
    isCore: false,
    status: 'active',
  },
  material_manager: {
    label: '材料员',
    sortOrder: 60,
    category: 'extended',
    isCore: false,
    status: 'active',
  },
  site_manager: {
    label: '现场管家',
    sortOrder: 70,
    category: 'extended',
    isCore: false,
    status: 'active',
  },
  sales_followup: {
    label: '销售跟进',
    sortOrder: 80,
    category: 'extended',
    isCore: false,
    status: 'active',
  },
};

export const isProjectMemberRoleCode = (
  value: string | null | undefined,
): value is ProjectMemberRoleCode =>
  typeof value === 'string' &&
  PROJECT_MEMBER_ROLE_CODE_VALUES.includes(value as ProjectMemberRoleCode);
