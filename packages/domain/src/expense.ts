export const EXPENSE_STATUS_VALUES = [
  'draft',
  'pending',
  'approved',
  'rejected',
  'paid',
  'cancelled',
] as const;

export type ExpenseStatus = (typeof EXPENSE_STATUS_VALUES)[number];

export interface ExpenseStatusConfigItem {
  label: string;
  type: 'default' | 'primary' | 'success' | 'warning' | 'danger';
}

export const ExpenseStatusConfig: Record<
  ExpenseStatus,
  ExpenseStatusConfigItem
> = {
  draft: { label: '草稿', type: 'default' },
  pending: { label: '审批中', type: 'warning' },
  approved: { label: '待打款', type: 'primary' },
  rejected: { label: '已驳回', type: 'danger' },
  paid: { label: '已完成', type: 'success' },
  cancelled: { label: '已撤回', type: 'default' },
};

export const EXPENSE_MODE_VALUES = [
  'reimbursement',
  'advance',
  'direct',
  'petty_cash',
] as const;

export type ExpenseMode = (typeof EXPENSE_MODE_VALUES)[number];

export interface ExpenseModeConfigItem {
  label: string;
  type: 'default' | 'primary' | 'success' | 'warning' | 'danger';
}

export const ExpenseModeConfig: Record<ExpenseMode, ExpenseModeConfigItem> = {
  reimbursement: { label: '员工报销', type: 'primary' },
  advance: { label: '预借款', type: 'warning' },
  direct: { label: '公司直付', type: 'success' },
  petty_cash: { label: '备用金', type: 'default' },
};

export const EXPENSE_REQUEST_STEP_VALUES = [
  'draft',
  'manager_review',
  'finance_review',
  'payment',
  'done',
  'cancelled',
] as const;

export type ExpenseRequestStep =
  (typeof EXPENSE_REQUEST_STEP_VALUES)[number];

export interface ExpenseRequestStepConfigItem {
  label: string;
  type: 'default' | 'primary' | 'success' | 'warning' | 'danger';
}

export const ExpenseRequestStepConfig: Record<
  ExpenseRequestStep,
  ExpenseRequestStepConfigItem
> = {
  draft: { label: '草稿', type: 'default' },
  manager_review: { label: '待主管审核', type: 'warning' },
  finance_review: { label: '待财务审核', type: 'primary' },
  payment: { label: '待打款', type: 'primary' },
  done: { label: '已完成', type: 'success' },
  cancelled: { label: '已作废', type: 'default' },
};

export const EXPENSE_APPROVAL_ACTION_VALUES = [
  'submit',
  'approve',
  'reject',
  'cancel',
  'resubmit',
  'pay',
] as const;

export type ExpenseApprovalAction =
  (typeof EXPENSE_APPROVAL_ACTION_VALUES)[number];

export interface ExpenseApprovalActionConfigItem {
  label: string;
  type: 'default' | 'primary' | 'success' | 'warning' | 'danger';
}

export const ExpenseApprovalActionConfig: Record<
  ExpenseApprovalAction,
  ExpenseApprovalActionConfigItem
> = {
  submit: { label: '提交申请', type: 'primary' },
  approve: { label: '审批通过', type: 'success' },
  reject: { label: '审批驳回', type: 'danger' },
  cancel: { label: '撤回作废', type: 'default' },
  resubmit: { label: '重新提交', type: 'warning' },
  pay: { label: '登记打款', type: 'success' },
};

export const EXPENSE_SETTLEMENT_METHOD_VALUES = [
  'bank_transfer',
  'wechat',
  'alipay',
  'cash',
] as const;

export type ExpenseSettlementMethod =
  (typeof EXPENSE_SETTLEMENT_METHOD_VALUES)[number];

export interface ExpenseSettlementMethodConfigItem {
  label: string;
  type: 'default' | 'primary' | 'success' | 'warning' | 'danger';
}

export const ExpenseSettlementMethodConfig: Record<
  ExpenseSettlementMethod,
  ExpenseSettlementMethodConfigItem
> = {
  bank_transfer: { label: '银行转账', type: 'primary' },
  wechat: { label: '微信转账', type: 'success' },
  alipay: { label: '支付宝转账', type: 'primary' },
  cash: { label: '现金', type: 'warning' },
};

export const isExpenseStatus = (
  value: string | null | undefined,
): value is ExpenseStatus =>
  typeof value === 'string' &&
  EXPENSE_STATUS_VALUES.includes(value as ExpenseStatus);

export const isExpenseMode = (
  value: string | null | undefined,
): value is ExpenseMode =>
  typeof value === 'string' &&
  EXPENSE_MODE_VALUES.includes(value as ExpenseMode);

export const isExpenseRequestStep = (
  value: string | null | undefined,
): value is ExpenseRequestStep =>
  typeof value === 'string' &&
  EXPENSE_REQUEST_STEP_VALUES.includes(value as ExpenseRequestStep);

export const isExpenseApprovalAction = (
  value: string | null | undefined,
): value is ExpenseApprovalAction =>
  typeof value === 'string' &&
  EXPENSE_APPROVAL_ACTION_VALUES.includes(value as ExpenseApprovalAction);

export const isExpenseSettlementMethod = (
  value: string | null | undefined,
): value is ExpenseSettlementMethod =>
  typeof value === 'string' &&
  EXPENSE_SETTLEMENT_METHOD_VALUES.includes(
    value as ExpenseSettlementMethod,
  );
