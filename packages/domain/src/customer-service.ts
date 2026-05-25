export const CUSTOMER_SERVICE_TICKET_STATUS_VALUES = [
  'open',
  'in_progress',
  'resolved',
  'closed',
  'cancelled',
] as const;

export type CustomerServiceTicketStatus =
  (typeof CUSTOMER_SERVICE_TICKET_STATUS_VALUES)[number];

export const CUSTOMER_SERVICE_TICKET_CATEGORY_VALUES = [
  'after_sale',
  'construction',
  'acceptance',
  'billing',
  'other',
] as const;

export type CustomerServiceTicketCategory =
  (typeof CUSTOMER_SERVICE_TICKET_CATEGORY_VALUES)[number];

export const CUSTOMER_SERVICE_TICKET_PRIORITY_VALUES = [
  'normal',
  'high',
  'urgent',
] as const;

export type CustomerServiceTicketPriority =
  (typeof CUSTOMER_SERVICE_TICKET_PRIORITY_VALUES)[number];

export const CUSTOMER_SERVICE_TICKET_ACTION_VALUES = [
  'assign',
  'start',
  'resolve',
  'close',
  'cancel',
  'reopen',
] as const;

export type CustomerServiceTicketAction =
  (typeof CUSTOMER_SERVICE_TICKET_ACTION_VALUES)[number];

export const CustomerServiceTicketStatusConfig: Record<
  CustomerServiceTicketStatus,
  { label: string; type: 'default' | 'primary' | 'success' | 'warning' | 'danger' }
> = {
  open: { label: '待处理', type: 'warning' },
  in_progress: { label: '处理中', type: 'primary' },
  resolved: { label: '已解决', type: 'success' },
  closed: { label: '已关闭', type: 'default' },
  cancelled: { label: '已取消', type: 'danger' },
};

export const CustomerServiceTicketCategoryConfig: Record<
  CustomerServiceTicketCategory,
  { label: string }
> = {
  after_sale: { label: '售后咨询' },
  construction: { label: '施工问题' },
  acceptance: { label: '验收问题' },
  billing: { label: '费用问题' },
  other: { label: '其他' },
};

export const CustomerServiceTicketPriorityConfig: Record<
  CustomerServiceTicketPriority,
  { label: string; type: 'default' | 'warning' | 'danger' }
> = {
  normal: { label: '普通', type: 'default' },
  high: { label: '高优先级', type: 'warning' },
  urgent: { label: '紧急', type: 'danger' },
};

export const CustomerServiceTicketActionConfig: Record<
  CustomerServiceTicketAction,
  {
    label: string;
    from: readonly CustomerServiceTicketStatus[];
    to?: CustomerServiceTicketStatus;
    requiresContent?: boolean;
  }
> = {
  assign: {
    label: '分配客服',
    from: ['open', 'in_progress'],
  },
  start: {
    label: '开始处理',
    from: ['open'],
    to: 'in_progress',
  },
  resolve: {
    label: '标记解决',
    from: ['in_progress'],
    to: 'resolved',
    requiresContent: true,
  },
  close: {
    label: '关闭问题',
    from: ['resolved'],
    to: 'closed',
  },
  cancel: {
    label: '取消问题',
    from: ['open', 'in_progress'],
    to: 'cancelled',
  },
  reopen: {
    label: '重新打开',
    from: ['resolved', 'closed', 'cancelled'],
    to: 'in_progress',
  },
};

export const isCustomerServiceTicketStatus = (
  value: string | null | undefined,
): value is CustomerServiceTicketStatus =>
  typeof value === 'string' &&
  CUSTOMER_SERVICE_TICKET_STATUS_VALUES.includes(value as CustomerServiceTicketStatus);

export const isCustomerServiceTicketAction = (
  value: string | null | undefined,
): value is CustomerServiceTicketAction =>
  typeof value === 'string' &&
  CUSTOMER_SERVICE_TICKET_ACTION_VALUES.includes(value as CustomerServiceTicketAction);

export function listCustomerServiceTicketActions(input: {
  status: CustomerServiceTicketStatus;
}) {
  return CUSTOMER_SERVICE_TICKET_ACTION_VALUES
    .map((action) => ({
      action,
      ...CustomerServiceTicketActionConfig[action],
    }))
    .filter((item) => item.from.includes(input.status));
}

