export const TENANT_STATUS_VALUES = [
  'active',
  'suspended',
  'archived',
] as const;

export type TenantStatus = (typeof TENANT_STATUS_VALUES)[number];

export type TenantBasicInfo = {
  id: string;
  name: string | null;
  slug: string | null;
  status: TenantStatus | string | null;
};

export const isTenantStatus = (value: unknown): value is TenantStatus =>
  typeof value === 'string' && TENANT_STATUS_VALUES.includes(value as TenantStatus);
