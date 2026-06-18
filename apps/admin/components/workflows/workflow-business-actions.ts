import type {
  CustomerStatus,
  CustomerStatusAction,
} from "@gooes/domain";

type CustomerWorkflowActionConfigItem = {
  label: string;
  from: readonly CustomerStatus[];
  to: CustomerStatus;
  requiresReason?: boolean;
  internalOnly?: boolean;
};

export const CustomerWorkflowActionConfig: Record<
  CustomerStatusAction,
  CustomerWorkflowActionConfigItem
> = {
  start_following: { label: "开始跟进", from: ["potential"], to: "following" },
  mark_arrived: { label: "标记到店", from: ["following"], to: "arrived" },
  start_design: { label: "开始设计", from: ["arrived"], to: "designing" },
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
  reactivate: { label: "重新激活", from: ["dormant"], to: "following" },
  mark_invalid: {
    label: "作废客户",
    from: ["potential", "following", "arrived", "designing", "dormant"],
    to: "invalid",
    requiresReason: true,
  },
};

export function resolveCustomerWorkflowActionTransition(input: {
  action: CustomerStatusAction;
  fromStatus: CustomerStatus;
}): { fromStatus: CustomerStatus; toStatus: CustomerStatus } | null {
  const config = CustomerWorkflowActionConfig[input.action];
  if (!config.from.includes(input.fromStatus)) return null;

  return {
    fromStatus: input.fromStatus,
    toStatus: config.to,
  };
}
