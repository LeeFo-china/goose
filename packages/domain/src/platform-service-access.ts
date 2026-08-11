export const TENANT_SERVICE_ACCESS_MODE_VALUES = [
  'paid',
  'paid_onboarding',
  'trial',
  'grace',
  'legacy',
  'service_blocked',
  'hard_blocked',
] as const;

export const TENANT_SERVICE_ROUTE_ACCESS_VALUES = [
  'session',
  'recovery',
  'read',
  'write',
  'public_or_callback',
] as const;

export type TenantServiceAccessMode =
  (typeof TENANT_SERVICE_ACCESS_MODE_VALUES)[number];

export type TenantServiceRouteAccess =
  (typeof TENANT_SERVICE_ROUTE_ACCESS_VALUES)[number];

export type TenantServiceAccessLevel = 'read_write' | 'read_only' | 'none';
