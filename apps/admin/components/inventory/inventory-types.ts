import type { InventoryTransactionType } from '@gooes/domain';

export type InventoryIdentity = { id: string; name: string };
export type InventoryPagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};
export type InventoryPage<T> = { list: T[]; pagination: InventoryPagination };

type InventoryRow = {
  id: string;
  warehouse_id: string;
  warehouse_name: string;
  supplier_sku_id: string;
  sku_code: string;
  sku_name: string;
};

export type InventoryBalance = InventoryRow & {
  specification: string | null;
  model: string | null;
  quantity_on_hand: string;
  average_unit_cost: string;
  inventory_value: string;
  updated_at: string;
};

export type InventoryTransaction = InventoryRow & {
  transaction_type: InventoryTransactionType;
  quantity_delta: string;
  value_delta: string;
  occurred_at: string;
  created_by_employee_name: string | null;
  source_document:
    | {
        receipt_id: string;
        receipt_no: string;
        purchase_order_id: string;
        order_no: string;
      }
    | { issue_order_id: string; issue_order_no: string }
    | {
        return_order_id: string;
        return_order_no: string;
        issue_order_id: string;
        issue_order_no: string;
      }
    | {
        transfer_order_id: string;
        transfer_order_no: string;
        source_warehouse_id: string;
        destination_warehouse_id: string;
      }
    | null;
};

export type InventoryState = {
  tab: 'balances' | 'transactions';
  page: number;
  pageSize: number;
  keyword: string;
  warehouse: InventoryIdentity | null;
  sku: InventoryIdentity | null;
  transactionType: InventoryTransactionType | 'all';
};
