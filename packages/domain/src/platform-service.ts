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
