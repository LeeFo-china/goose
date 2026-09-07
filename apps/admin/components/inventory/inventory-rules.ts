import type { InventoryIdentity, InventoryState } from './inventory-types';

export const initialInventoryState: InventoryState = {
  tab: 'balances',
  page: 1,
  pageSize: 20,
  keyword: '',
  warehouse: null,
  sku: null,
  transactionType: 'all',
};

export function inventoryAccess(permissions: readonly string[]) {
  return {
    canView: permissions.includes('inventory.stock.view'),
    canViewWarehouses: permissions.includes('inventory.warehouse.view'),
    canViewPurchaseOrders:
      permissions.includes('supplier.purchase-order.view') &&
      permissions.includes('inventory.warehouse.view'),
  };
}

export type InventoryAction =
  | { type: 'tab'; tab: InventoryState['tab'] }
  | { type: 'keyword'; keyword: string }
  | { type: 'warehouse'; warehouse: InventoryIdentity | null }
  | {
      type: 'transactionType';
      transactionType: InventoryState['transactionType'];
    }
  | { type: 'drill'; sku: InventoryIdentity; warehouse: InventoryIdentity }
  | { type: 'clearSku' }
  | { type: 'page'; page: number }
  | { type: 'pageSize'; pageSize: number }
  | { type: 'reset' };

function pageSize(value: number) {
  return Number.isFinite(value)
    ? Math.min(100, Math.max(1, Math.floor(value)))
    : 20;
}

export function inventoryReducer(
  state: InventoryState,
  action: InventoryAction,
): InventoryState {
  switch (action.type) {
    case 'tab':
      return { ...state, tab: action.tab, page: 1, sku: null };
    case 'keyword':
      return { ...state, keyword: action.keyword.trim().slice(0, 80), page: 1 };
    case 'warehouse':
      return { ...state, warehouse: action.warehouse, page: 1 };
    case 'transactionType':
      return { ...state, transactionType: action.transactionType, page: 1 };
    case 'drill':
      return {
        ...state,
        tab: 'transactions',
        sku: action.sku,
        warehouse: action.warehouse,
        transactionType: 'all',
        page: 1,
      };
    case 'clearSku':
      return { ...state, sku: null, page: 1 };
    case 'page':
      return { ...state, page: Math.max(1, Math.floor(action.page)) };
    case 'pageSize':
      return { ...state, pageSize: pageSize(action.pageSize), page: 1 };
    case 'reset':
      return {
        ...initialInventoryState,
        tab: state.tab,
        pageSize: state.pageSize,
      };
  }
}

export function buildInventoryPath(state: InventoryState) {
  const query = new URLSearchParams({
    page: String(Math.max(1, state.page)),
    pageSize: String(pageSize(state.pageSize)),
  });
  if (state.warehouse) query.set('warehouseId', state.warehouse.id);
  if (state.tab === 'balances' && state.keyword.trim())
    query.set('keyword', state.keyword.trim().slice(0, 80));
  if (state.tab === 'transactions') {
    if (state.sku) query.set('supplierSkuId', state.sku.id);
    if (state.transactionType !== 'all')
      query.set('transactionType', state.transactionType);
  }
  return `/inventory/${state.tab}?${query}`;
}

// API decimal strings may exceed Number's safe precision; never round through Number.
export function formatInventoryDecimal(value: string, signed = false) {
  const [whole, decimal = ''] = value.split('.');
  const fraction = decimal.replace(/0+$/, '');
  const zero = /^-?0+$/.test(whole) && !fraction;
  const prefix = signed && !zero && !whole.startsWith('-') ? '+' : '';
  return `${prefix}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${fraction ? `.${fraction}` : ''}`;
}

export function formatInventoryTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '时间不可用'
    : date.toLocaleString('zh-CN', { hour12: false });
}
