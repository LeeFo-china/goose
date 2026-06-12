import type {
  CustomerStatus,
  CustomerStatusAction,
  ProjectStatus,
  ProjectStatusAction,
} from "@gooes/domain";

type CustomerWorkflowActionConfigItem = {
  label: string;
  from: readonly CustomerStatus[];
  to: CustomerStatus;
  requiresReason?: boolean;
  internalOnly?: boolean;
};

type ProjectWorkflowActionConfigItem = {
  label: string;
  from: readonly ProjectStatus[];
  to: ProjectStatus | "paused_from_status";
  requiresReason?: boolean;
};

export const CustomerWorkflowActionConfig: Record<
  CustomerStatusAction,
  CustomerWorkflowActionConfigItem
> = {
  start_following: {
    label: "开始跟进",
    from: ["potential"],
    to: "following",
  },
  mark_arrived: {
    label: "标记到店",
    from: ["following"],
    to: "arrived",
  },
  start_design: {
    label: "开始设计",
    from: ["arrived"],
    to: "designing",
  },
  mark_signed: {
    label: "客户签约",
    from: ["designing"],
    to: "signed",
    internalOnly: true,
  },
  mark_dormant: {
    label: "标记沉睡",
    from: ["potential", "following", "arrived", "designing"],
    to: "dormant",
    requiresReason: true,
  },
  reactivate: {
    label: "重新激活",
    from: ["dormant"],
    to: "following",
  },
  mark_invalid: {
    label: "作废客户",
    from: ["potential", "following", "arrived", "designing", "dormant"],
    to: "invalid",
    requiresReason: true,
  },
};

export const ProjectWorkflowActionConfig: Record<
  ProjectStatusAction,
  ProjectWorkflowActionConfigItem
> = {
  confirm_proposal: {
    label: "方案已确认",
    from: ["designing"],
    to: "proposal_confirmed",
  },
  sign_contract: {
    label: "项目签约",
    from: ["proposal_confirmed"],
    to: "signed",
  },
  finalize_design: {
    label: "设计定稿",
    from: ["signed"],
    to: "design_finalized",
  },
  schedule_construction: {
    label: "排期开工",
    from: ["design_finalized"],
    to: "pending_start",
  },
  start_project: {
    label: "确认开工",
    from: ["pending_start"],
    to: "started",
  },
  start_construction: {
    label: "正式进场",
    from: ["started"],
    to: "constructing",
  },
  pause_project: {
    label: "暂停项目",
    from: [
      "designing",
      "proposal_confirmed",
      "signed",
      "design_finalized",
      "pending_start",
      "started",
      "constructing",
      "acceptance",
    ],
    to: "on_hold",
    requiresReason: true,
  },
  resume_project: {
    label: "恢复项目",
    from: ["on_hold"],
    to: "paused_from_status",
  },
  start_acceptance: {
    label: "竣工验收",
    from: ["constructing"],
    to: "acceptance",
  },
  mark_invalid: {
    label: "作废项目",
    from: [
      "designing",
      "proposal_confirmed",
      "signed",
      "design_finalized",
      "pending_start",
      "started",
      "constructing",
      "on_hold",
      "acceptance",
    ],
    to: "invalid",
    requiresReason: true,
  },
};

const CUSTOMER_WORKFLOW_ACTIONS = Object.keys(
  CustomerWorkflowActionConfig,
) as CustomerStatusAction[];
const PROJECT_WORKFLOW_ACTIONS = Object.keys(
  ProjectWorkflowActionConfig,
) as ProjectStatusAction[];

export function resolveCustomerWorkflowActionTransition(input: {
  action: CustomerStatusAction;
  fromStatus: CustomerStatus;
}): { fromStatus: CustomerStatus; toStatus: CustomerStatus } | null {
  const config = CustomerWorkflowActionConfig[input.action];
  if (!config.from.includes(input.fromStatus)) {
    return null;
  }

  return {
    fromStatus: input.fromStatus,
    toStatus: config.to,
  };
}

export function inferCustomerWorkflowAction(input: {
  fromStatus: CustomerStatus;
  toStatus: CustomerStatus;
}): CustomerStatusAction | null {
  const matches = CUSTOMER_WORKFLOW_ACTIONS.filter((action) =>
    resolveCustomerWorkflowActionTransition({
      action,
      fromStatus: input.fromStatus,
    })?.toStatus === input.toStatus
  );

  return matches.length === 1 ? matches[0] ?? null : null;
}

export function listCustomerWorkflowActions(input: {
  fromStatus: CustomerStatus;
}) {
  return CUSTOMER_WORKFLOW_ACTIONS.map((action) => {
    const transition = resolveCustomerWorkflowActionTransition({
      action,
      fromStatus: input.fromStatus,
    });
    const config = CustomerWorkflowActionConfig[action];

    return transition && !config.internalOnly
      ? {
        action,
        label: config.label,
        from_status: transition.fromStatus,
        to_status: transition.toStatus,
        requires_reason: Boolean(config.requiresReason),
      }
      : null;
  }).filter((item): item is NonNullable<typeof item> => Boolean(item));
}

export function resolveProjectWorkflowActionTransition(input: {
  action: ProjectStatusAction;
  fromStatus: ProjectStatus;
  pausedFromStatus?: ProjectStatus | null;
}): { fromStatus: ProjectStatus; toStatus: ProjectStatus } | null {
  const config = ProjectWorkflowActionConfig[input.action];
  if (!config.from.includes(input.fromStatus)) {
    return null;
  }

  if (config.to === "paused_from_status") {
    if (!input.pausedFromStatus || input.pausedFromStatus === "on_hold") {
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

export function inferProjectWorkflowAction(input: {
  fromStatus: ProjectStatus;
  toStatus: ProjectStatus;
  pausedFromStatus?: ProjectStatus | null;
}): ProjectStatusAction | null {
  const matches = PROJECT_WORKFLOW_ACTIONS.filter((action) =>
    resolveProjectWorkflowActionTransition({
      action,
      fromStatus: input.fromStatus,
      pausedFromStatus: input.pausedFromStatus,
    })?.toStatus === input.toStatus
  );

  return matches.length === 1 ? matches[0] ?? null : null;
}

export function listProjectWorkflowActions(input: {
  fromStatus: ProjectStatus;
  pausedFromStatus?: ProjectStatus | null;
}) {
  return PROJECT_WORKFLOW_ACTIONS.map((action) => {
    const transition = resolveProjectWorkflowActionTransition({
      action,
      fromStatus: input.fromStatus,
      pausedFromStatus: input.pausedFromStatus,
    });
    const config = ProjectWorkflowActionConfig[action];

    return transition
      ? {
        action,
        label: config.label,
        from_status: transition.fromStatus,
        to_status: transition.toStatus,
        requires_reason: Boolean(config.requiresReason),
      }
      : null;
  }).filter((item): item is NonNullable<typeof item> => Boolean(item));
}
