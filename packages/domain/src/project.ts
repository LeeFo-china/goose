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

export interface ProjectStatusActionConfigItem {
  label: string;
  from: readonly ProjectStatus[];
  to: ProjectStatus | 'paused_from_status';
  requiresReason?: boolean;
}

export const ProjectStatusActionConfig: Record<
  ProjectStatusAction,
  ProjectStatusActionConfigItem
> = {
  confirm_proposal: {
    label: '方案已确认',
    from: ['designing'],
    to: 'proposal_confirmed',
  },
  sign_contract: {
    label: '项目签约',
    from: ['proposal_confirmed'],
    to: 'signed',
  },
  finalize_design: {
    label: '设计定稿',
    from: ['signed'],
    to: 'design_finalized',
  },
  schedule_construction: {
    label: '排期开工',
    from: ['design_finalized'],
    to: 'pending_start',
  },
  start_project: {
    label: '确认开工',
    from: ['pending_start'],
    to: 'started',
  },
  start_construction: {
    label: '正式进场',
    from: ['started'],
    to: 'constructing',
  },
  pause_project: {
    label: '暂停项目',
    from: [
      'designing',
      'proposal_confirmed',
      'signed',
      'design_finalized',
      'pending_start',
      'started',
      'constructing',
      'acceptance',
    ],
    to: 'on_hold',
    requiresReason: true,
  },
  resume_project: {
    label: '恢复项目',
    from: ['on_hold'],
    to: 'paused_from_status',
  },
  start_acceptance: {
    label: '竣工验收',
    from: ['constructing'],
    to: 'acceptance',
  },
  mark_invalid: {
    label: '作废项目',
    from: [
      'designing',
      'proposal_confirmed',
      'signed',
      'design_finalized',
      'pending_start',
      'started',
      'constructing',
      'on_hold',
      'acceptance',
    ],
    to: 'invalid',
    requiresReason: true,
  },
};

export const isProjectStatusAction = (
  value: string | null | undefined,
): value is ProjectStatusAction =>
  typeof value === 'string' &&
  PROJECT_STATUS_ACTION_VALUES.includes(value as ProjectStatusAction);

export function resolveProjectStatusTransition(input: {
  action: ProjectStatusAction;
  fromStatus: ProjectStatus;
  pausedFromStatus?: ProjectStatus | null;
}): { fromStatus: ProjectStatus; toStatus: ProjectStatus } | null {
  const config = ProjectStatusActionConfig[input.action];
  if (!config.from.includes(input.fromStatus)) {
    return null;
  }

  if (config.to === 'paused_from_status') {
    if (!input.pausedFromStatus || input.pausedFromStatus === 'on_hold') {
      return null;
    }

    return {
      fromStatus: input.fromStatus,
      toStatus: input.pausedFromStatus,
    };
  }

  return {
    fromStatus: input.fromStatus,
    toStatus: config.to,
  };
}

export function inferProjectStatusAction(input: {
  fromStatus: ProjectStatus;
  toStatus: ProjectStatus;
  pausedFromStatus?: ProjectStatus | null;
}): ProjectStatusAction | null {
  const matches = PROJECT_STATUS_ACTION_VALUES.filter((action) => {
    const transition = resolveProjectStatusTransition({
      action,
      fromStatus: input.fromStatus,
      pausedFromStatus: input.pausedFromStatus,
    });

    return transition?.toStatus === input.toStatus;
  });

  return matches.length === 1 ? matches[0] ?? null : null;
}

export function listProjectStatusActions(input: {
  fromStatus: ProjectStatus;
  pausedFromStatus?: ProjectStatus | null;
}) {
  return PROJECT_STATUS_ACTION_VALUES
    .map((action) => {
      const transition = resolveProjectStatusTransition({
        action,
        fromStatus: input.fromStatus,
        pausedFromStatus: input.pausedFromStatus,
      });

      return transition
        ? {
            action,
            label: ProjectStatusActionConfig[action].label,
            from_status: transition.fromStatus,
            to_status: transition.toStatus,
            requires_reason: Boolean(ProjectStatusActionConfig[action].requiresReason),
          }
        : null;
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

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
