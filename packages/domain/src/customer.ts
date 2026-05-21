export const CUSTOMER_STATUS_VALUES = [
  'potential',
  'following',
  'arrived',
  'designing',
  'ordered',
  'contracted',
  'dormant',
  'invalid',
] as const;

export type CustomerStatus = (typeof CUSTOMER_STATUS_VALUES)[number];

export const CUSTOMER_SOURCE_VALUES = [
  'douyin',
  'referral',
  'walk_in',
  'telemarketing',
  'platform',
  'platform_lead',
  'platform_assigned',
  'employee_share',
  'h5_campaign',
  'quote_form',
  'miniprogram_qrcode',
] as const;

export type CustomerSource = (typeof CUSTOMER_SOURCE_VALUES)[number];

export const CUSTOMER_ORIGIN_VALUES = [
  'employee_created',
  'visitor_self_registered',
  'h5_lead_converted',
  'imported',
  'system_created',
] as const;

export type CustomerOrigin = (typeof CUSTOMER_ORIGIN_VALUES)[number];

export interface CustomerStatusConfigItem {
  label: string;
  type: 'default' | 'primary' | 'success' | 'warning' | 'danger';
}

export const CustomerStatusConfig: Record<
  CustomerStatus,
  CustomerStatusConfigItem
> = {
  potential: { label: '潜在客户', type: 'default' },
  following: { label: '跟进中', type: 'primary' },
  arrived: { label: '已到店', type: 'warning' },
  designing: { label: '设计中', type: 'primary' },
  ordered: { label: '已下定', type: 'success' },
  contracted: { label: '已签约', type: 'success' },
  dormant: { label: '沉睡客户', type: 'default' },
  invalid: { label: '无效客户', type: 'danger' },
};

export const CustomerSourceConfig: Record<CustomerSource, { label: string }> = {
  douyin: { label: '抖音/短视频' },
  referral: { label: '老客介绍' },
  walk_in: { label: '自然进店' },
  telemarketing: { label: '电销开发' },
  platform: { label: '装修平台' },
  platform_lead: { label: '平台分配线索' },
  platform_assigned: { label: '平台分配客户' },
  employee_share: { label: '员工拓客分享' },
  h5_campaign: { label: '员工H5活动' },
  quote_form: { label: '员工报价表单' },
  miniprogram_qrcode: { label: '员工小程序码' },
};

export const CustomerOriginConfig: Record<CustomerOrigin, { label: string }> = {
  employee_created: { label: '员工登记' },
  visitor_self_registered: { label: '访客自助注册' },
  h5_lead_converted: { label: 'H5线索转化' },
  imported: { label: '批量导入' },
  system_created: { label: '系统生成' },
};

export const isCustomerStatus = (
  value: string | null | undefined,
): value is CustomerStatus =>
  typeof value === 'string' &&
  CUSTOMER_STATUS_VALUES.includes(value as CustomerStatus);

export const CUSTOMER_STATUS_ACTION_VALUES = [
  'start_following',
  'mark_arrived',
  'start_design',
  'place_order',
  'sign_contract',
  'mark_dormant',
  'reactivate',
  'mark_invalid',
] as const;

export type CustomerStatusAction = (typeof CUSTOMER_STATUS_ACTION_VALUES)[number];

export interface CustomerStatusActionConfigItem {
  label: string;
  from: readonly CustomerStatus[];
  to: CustomerStatus;
  requiresReason?: boolean;
}

export const CustomerStatusActionConfig: Record<
  CustomerStatusAction,
  CustomerStatusActionConfigItem
> = {
  start_following: {
    label: '开始跟进',
    from: ['potential'],
    to: 'following',
  },
  mark_arrived: {
    label: '标记到店',
    from: ['following'],
    to: 'arrived',
  },
  start_design: {
    label: '开始设计',
    from: ['arrived'],
    to: 'designing',
  },
  place_order: {
    label: '客户下定',
    from: ['designing'],
    to: 'ordered',
  },
  sign_contract: {
    label: '客户签约',
    from: ['ordered'],
    to: 'contracted',
  },
  mark_dormant: {
    label: '标记沉睡',
    from: ['potential', 'following', 'arrived', 'designing', 'ordered'],
    to: 'dormant',
    requiresReason: true,
  },
  reactivate: {
    label: '重新激活',
    from: ['dormant'],
    to: 'following',
  },
  mark_invalid: {
    label: '作废客户',
    from: ['potential', 'following', 'arrived', 'designing', 'ordered', 'dormant'],
    to: 'invalid',
    requiresReason: true,
  },
};

export const isCustomerStatusAction = (
  value: string | null | undefined,
): value is CustomerStatusAction =>
  typeof value === 'string' &&
  CUSTOMER_STATUS_ACTION_VALUES.includes(value as CustomerStatusAction);

export function resolveCustomerStatusTransition(input: {
  action: CustomerStatusAction;
  fromStatus: CustomerStatus;
}): { fromStatus: CustomerStatus; toStatus: CustomerStatus } | null {
  const config = CustomerStatusActionConfig[input.action];
  if (!config.from.includes(input.fromStatus)) {
    return null;
  }

  return {
    fromStatus: input.fromStatus,
    toStatus: config.to,
  };
}

export function inferCustomerStatusAction(input: {
  fromStatus: CustomerStatus;
  toStatus: CustomerStatus;
}): CustomerStatusAction | null {
  const matches = CUSTOMER_STATUS_ACTION_VALUES.filter((action) => {
    const transition = resolveCustomerStatusTransition({
      action,
      fromStatus: input.fromStatus,
    });

    return transition?.toStatus === input.toStatus;
  });

  return matches.length === 1 ? matches[0] ?? null : null;
}

export function listCustomerStatusActions(input: {
  fromStatus: CustomerStatus;
}) {
  return CUSTOMER_STATUS_ACTION_VALUES
    .map((action) => {
      const transition = resolveCustomerStatusTransition({
        action,
        fromStatus: input.fromStatus,
      });

      return transition
        ? {
            action,
            label: CustomerStatusActionConfig[action].label,
            from_status: transition.fromStatus,
            to_status: transition.toStatus,
            requires_reason: Boolean(CustomerStatusActionConfig[action].requiresReason),
          }
        : null;
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

export const isCustomerSource = (
  value: string | null | undefined,
): value is CustomerSource =>
  typeof value === 'string' &&
  CUSTOMER_SOURCE_VALUES.includes(value as CustomerSource);

export const isCustomerOrigin = (
  value: string | null | undefined,
): value is CustomerOrigin =>
  typeof value === 'string' &&
  CUSTOMER_ORIGIN_VALUES.includes(value as CustomerOrigin);
