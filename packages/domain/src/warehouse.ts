export const WAREHOUSE_STATUS_VALUES = ['active', 'inactive'] as const;

export const PROCUREMENT_DESTINATION_TYPE_VALUES = [
  'project',
  'warehouse',
] as const;

export const WAREHOUSE_STATUS_LABELS = {
  active: '启用',
  inactive: '停用',
} as const satisfies Record<WarehouseStatus, string>;

export type WarehouseStatus = (typeof WAREHOUSE_STATUS_VALUES)[number];
export type ProcurementDestinationType =
  (typeof PROCUREMENT_DESTINATION_TYPE_VALUES)[number];
