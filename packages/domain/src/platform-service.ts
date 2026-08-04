export const PLATFORM_SERVICE_PAYMENT_STATUS_VALUES = [
  'pending',
  'paid',
  'refund_reviewing',
  'refunding',
  'partially_refunded',
  'refunded',
  'closed',
] as const;

export const PLATFORM_SERVICE_STATUS_VALUES = [
  'waiting_payment',
  'waiting_assignment',
  'configuring',
  'deploying',
  'training',
  'awaiting_acceptance',
  'rectifying',
  'accepted',
  'active',
  'canceled',
] as const;

export type PlatformServicePaymentStatus =
  (typeof PLATFORM_SERVICE_PAYMENT_STATUS_VALUES)[number];
export type PlatformServiceStatus =
  (typeof PLATFORM_SERVICE_STATUS_VALUES)[number];

export const PLATFORM_SERVICE_FULFILLMENT_RECORD_TYPE_VALUES = [
  'environment_setup',
  'server_configuration',
  'onsite_training',
  'remote_training',
  'annual_operation',
  'acceptance_preparation',
  'rectification',
] as const;

export type PlatformServiceFulfillmentRecordType =
  (typeof PLATFORM_SERVICE_FULFILLMENT_RECORD_TYPE_VALUES)[number];

export const PLATFORM_SERVICE_ACCEPTANCE_PREPARATION_STATUS_VALUES = [
  'draft',
  'submitted',
  'accepted',
  'rejected',
  'cancelled',
] as const;

export type PlatformServiceAcceptancePreparationStatus =
  (typeof PLATFORM_SERVICE_ACCEPTANCE_PREPARATION_STATUS_VALUES)[number];

export const PLATFORM_SERVICE_WORK_ORDER_ALLOWED_TRANSITIONS = [
  { from: 'waiting_assignment', to: 'configuring' },
  { from: 'configuring', to: 'deploying' },
  { from: 'deploying', to: 'training' },
  { from: 'training', to: 'awaiting_acceptance' },
  { from: 'awaiting_acceptance', to: 'accepted' },
  { from: 'awaiting_acceptance', to: 'rectifying' },
  { from: 'rectifying', to: 'awaiting_acceptance' },
  { from: 'accepted', to: 'active' },
  { from: 'waiting_assignment', to: 'canceled' },
  { from: 'configuring', to: 'canceled' },
  { from: 'deploying', to: 'canceled' },
  { from: 'training', to: 'canceled' },
  { from: 'awaiting_acceptance', to: 'canceled' },
  { from: 'rectifying', to: 'canceled' },
] as const satisfies ReadonlyArray<{
  from: Exclude<PlatformServiceStatus, 'waiting_payment'>;
  to: Exclude<PlatformServiceStatus, 'waiting_payment'>;
}>;

export type PlatformServiceWorkOrderTransition =
  (typeof PLATFORM_SERVICE_WORK_ORDER_ALLOWED_TRANSITIONS)[number];
