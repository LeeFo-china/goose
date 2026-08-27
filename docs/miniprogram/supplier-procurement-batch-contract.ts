/**
 * Supplier procurement batch mini-program contract template.
 *
 * Documentation artifact only: this file is intentionally not imported by
 * Gooes runtime packages. Orange may copy it into its own service/type module.
 */

export type Uuid = string;
export type IsoDate = string;
export type IsoDateTime = string;
export type DecimalString = string;

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Page<Resource> {
  list: Resource[];
  pagination: Pagination;
}

export interface ApiResponse<Resource> {
  data: Resource;
  error?: unknown;
  message?: string;
  statusCode?: number;
  code?: string;
  requestId?: string;
  request_id?: string;
}

export interface RequestOptions {
  header?: Record<string, string>;
}

export interface SupplierProcurementApi {
  get<Resource>(
    url: string,
    data?: unknown,
    options?: RequestOptions,
  ): Promise<ApiResponse<Resource>>;
  post<Resource>(
    url: string,
    data?: unknown,
    options?: RequestOptions,
  ): Promise<ApiResponse<Resource>>;
}

export type PurchaseBatchStatus =
  | 'draft'
  | 'pending_approval'
  | 'rejected'
  | 'cancelled'
  | 'ordered';

export type BudgetStatus =
  | 'unchecked'
  | 'within_budget'
  | 'over_budget';

export interface ProjectRef {
  id: Uuid;
  name: string;
  status: string;
}

export interface ProjectOption {
  id: Uuid;
  name: string;
  status: string | null;
}

export interface CostCategoryOption {
  id: Uuid;
  code: string;
  name: string;
  status: 'active';
  sort_order: number;
}

export interface BudgetSnapshotEntry {
  requested_amount: DecimalString;
  budget_amount: DecimalString;
  expense_amount: DecimalString;
  other_commitment_amount: DecimalString;
  available_amount: DecimalString;
}

export type BudgetSnapshot = Record<Uuid, BudgetSnapshotEntry>;

export interface PurchaseBatch {
  id: Uuid;
  tenant_id: Uuid;
  project_id: Uuid;
  batch_no: string;
  status: PurchaseBatchStatus;
  reason: string;
  expected_delivery_date: IsoDate | null;
  remark: string | null;
  priced_at: IsoDateTime;
  currency: 'CNY';
  subtotal_amount: DecimalString;
  tax_amount: DecimalString;
  total_amount: DecimalString;
  budget_checked_at: IsoDateTime | null;
  budget_status: BudgetStatus;
  budget_snapshot: BudgetSnapshot;
  split_generation: number;
  supplier_count: number;
  item_count: number;
  version: number;
  created_by_employee_id: Uuid;
  updated_by_employee_id: Uuid;
  submitted_by_employee_id: Uuid | null;
  submitted_at: IsoDateTime | null;
  reviewed_by_employee_id: Uuid | null;
  reviewed_at: IsoDateTime | null;
  review_remark: string | null;
  cancelled_by_employee_id: Uuid | null;
  cancelled_at: IsoDateTime | null;
  cancel_reason: string | null;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface PurchaseBatchActions {
  can_edit: boolean;
  can_submit: boolean;
  can_review: boolean;
  can_cancel: boolean;
  can_create_supplier: boolean;
  can_create_catalog: boolean;
  can_create_purchasable_product: boolean;
}

export interface PurchaseBatchListItem extends PurchaseBatch {
  project: ProjectRef;
}

export interface PurchaseBatchDetail extends PurchaseBatchListItem {
  actions: PurchaseBatchActions;
}

export interface PurchaseBatchCatalogItem {
  supplier_product_id: Uuid;
  product_code: string;
  product_name: string;
  supplier_sku_id: Uuid;
  sku_code: string;
  sku_name: string;
  specification: string | null;
  model: string | null;
  supplier_price_list_id: Uuid;
  price_list_code: string;
  price_list_version: number;
  effective_from: IsoDateTime;
  effective_until: IsoDateTime | null;
  supplier_price_list_item_id: Uuid;
  purchase_unit_id: Uuid;
  purchase_unit_code: string;
  purchase_unit_name: string;
  purchase_unit_symbol: string;
  base_unit_id: Uuid;
  base_unit_code: string;
  base_unit_name: string;
  base_unit_symbol: string;
  base_unit_conversion: DecimalString;
  unit_price: DecimalString;
  tax_rate: DecimalString;
  tax_inclusive: boolean;
  category_id: Uuid;
  category_name: string;
  brand_id: Uuid;
  brand_name: string;
  tenant_supplier_id: Uuid;
  supplier_id: Uuid;
  supplier_name: string;
  currency: 'CNY';
  purchasable_status: 'purchasable';
}

export interface PurchaseBatchItem {
  id: Uuid;
  tenant_id: Uuid;
  purchase_batch_id: Uuid;
  line_no: number;
  supplier_sku_id: Uuid;
  quantity: DecimalString;
  cost_category_id: Uuid;
  supplier_id: Uuid;
  tenant_supplier_id: Uuid;
  supplier_product_id: Uuid;
  supplier_price_list_id: Uuid;
  supplier_price_list_item_id: Uuid;
  catalog_category_id: Uuid;
  category_name_snapshot: string;
  brand_id: Uuid;
  brand_name_snapshot: string;
  product_code_snapshot: string;
  product_name_snapshot: string;
  sku_code_snapshot: string;
  sku_name_snapshot: string;
  specification_snapshot: string | null;
  model_snapshot: string | null;
  purchase_unit_id: Uuid;
  purchase_unit_code_snapshot: string;
  purchase_unit_name_snapshot: string;
  purchase_unit_symbol_snapshot: string;
  base_unit_id: Uuid;
  base_unit_code_snapshot: string;
  base_unit_name_snapshot: string;
  base_unit_symbol_snapshot: string;
  base_unit_conversion: DecimalString;
  supplier_name_snapshot: string;
  price_list_code_snapshot: string;
  price_list_version_snapshot: number;
  price_effective_from_snapshot: IsoDateTime;
  price_effective_until_snapshot: IsoDateTime | null;
  priced_at: IsoDateTime;
  unit_price: DecimalString;
  tax_rate: DecimalString;
  tax_inclusive: boolean;
  line_subtotal_amount: DecimalString;
  line_tax_amount: DecimalString;
  line_total_amount: DecimalString;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export type PurchaseRequisitionStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'converted';

export interface PurchaseBatchRequisition {
  id: Uuid;
  tenant_id: Uuid;
  request_no: string;
  project_id: Uuid;
  tenant_supplier_id: Uuid;
  supplier_id: Uuid;
  status: PurchaseRequisitionStatus;
  budget_status: BudgetStatus;
  currency: 'CNY';
  reason: string;
  expected_delivery_date: IsoDate | null;
  remark: string | null;
  priced_at: IsoDateTime;
  subtotal_amount: DecimalString;
  tax_amount: DecimalString;
  total_amount: DecimalString;
  purchase_order_id: Uuid | null;
  purchase_batch_id: Uuid;
  split_generation: number;
  version: number;
  created_by_employee_id: Uuid;
  updated_by_employee_id: Uuid;
  submitted_by_employee_id: Uuid | null;
  submitted_at: IsoDateTime | null;
  reviewed_by_employee_id: Uuid | null;
  reviewed_at: IsoDateTime | null;
  review_remark: string | null;
  cancelled_by_employee_id: Uuid | null;
  cancelled_at: IsoDateTime | null;
  cancel_reason: string | null;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export type PurchaseOrderStatus = 'draft' | 'submitted' | 'cancelled';

export type SupplierOnboardingStatus =
  | 'draft'
  | 'pending_review'
  | 'approved'
  | 'rejected';

export type SupplierOperationalStatus =
  | 'active'
  | 'suspended'
  | 'blacklisted';

export interface SupplierRef {
  id: Uuid;
  code: string;
  name: string;
  legal_name: string;
  onboarding_status: SupplierOnboardingStatus;
  operational_status: SupplierOperationalStatus;
}

export interface PurchaseRequisitionRef {
  id: Uuid;
  request_no: string;
  status: PurchaseRequisitionStatus;
  budget_status: BudgetStatus;
}

export interface PurchaseBatchOrder {
  id: Uuid;
  tenant_id: Uuid;
  project_id: Uuid;
  tenant_supplier_id: Uuid;
  supplier_id: Uuid;
  order_no: string;
  status: PurchaseOrderStatus;
  currency: 'CNY';
  expected_delivery_date: IsoDate | null;
  remark: string | null;
  priced_at: IsoDateTime;
  subtotal_amount: DecimalString;
  tax_amount: DecimalString;
  total_amount: DecimalString;
  purchase_requisition_id: Uuid | null;
  purchase_batch_id: Uuid;
  version: number;
  created_by_employee_id: Uuid;
  updated_by_employee_id: Uuid;
  submitted_by_employee_id: Uuid | null;
  submitted_at: IsoDateTime | null;
  cancelled_by_employee_id: Uuid | null;
  cancelled_at: IsoDateTime | null;
  cancel_reason: string | null;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
  project: ProjectRef;
  supplier: SupplierRef;
  purchase_requisition: PurchaseRequisitionRef | null;
}

export interface SplitPreview {
  tenant_supplier_id: Uuid;
  supplier_id: Uuid;
  supplier_name: string;
  item_count: number;
  subtotal_amount: DecimalString;
  tax_amount: DecimalString;
  total_amount: DecimalString;
}

export interface OrderSummary {
  id: Uuid;
  order_no: string;
  tenant_supplier_id: Uuid;
  supplier_id: Uuid;
  supplier_name: string;
  status: 'submitted';
}

export interface CommandResultBase {
  idempotent: boolean;
  batch: PurchaseBatch;
  version: number;
}

export interface SavedCommandResult extends CommandResultBase {
  status: 'saved';
  split_preview: SplitPreview[];
}

export interface SubmittedCommandResult extends CommandResultBase {
  status: 'submitted';
  requisition_ids: Uuid[];
}

export interface RejectedCommandResult extends CommandResultBase {
  status: 'rejected';
}

export interface CancelledCommandResult extends CommandResultBase {
  status: 'cancelled';
}

export interface OrderedCommandResult extends CommandResultBase {
  status: 'ordered';
  requisition_ids: Uuid[];
  orders: OrderSummary[];
}

export type PurchaseBatchCommandResult =
  | SavedCommandResult
  | SubmittedCommandResult
  | RejectedCommandResult
  | CancelledCommandResult
  | OrderedCommandResult;

export type ReviewCommandResult =
  | RejectedCommandResult
  | OrderedCommandResult;

export interface SupplierRevisionBlocker {
  kind: 'supplier';
  tenant_supplier_id: Uuid;
  supplier_id: Uuid;
  reason: string;
}

export interface PriceRevisionBlocker {
  kind: 'price';
  supplier_sku_id: Uuid;
  product_name: string;
  sku_name: string;
  frozen_unit_price: DecimalString;
  current_unit_price: DecimalString | null;
  frozen_price_version: number;
  current_price_version: number | null;
}

export interface ItemRevisionBlocker {
  kind: 'item';
  supplier_sku_id: Uuid;
  reason: string;
}

export interface BudgetRevisionBlocker {
  kind: 'budget';
  cost_category_id: Uuid;
  submitted_requested_amount: DecimalString;
  current_requested_amount: DecimalString;
  submitted_available_amount: DecimalString;
  current_available_amount: DecimalString;
}

export type RevisionBlocker =
  | SupplierRevisionBlocker
  | PriceRevisionBlocker
  | ItemRevisionBlocker
  | BudgetRevisionBlocker;

export type RevisionErrorCode =
  | 'SUPPLIER_PURCHASE_BATCH_SUPPLIER_INELIGIBLE'
  | 'SUPPLIER_PURCHASE_BATCH_PRICE_CHANGED'
  | 'SUPPLIER_PURCHASE_BATCH_ITEM_UNAVAILABLE'
  | 'SUPPLIER_PURCHASE_BATCH_BUDGET_CHANGED';

export interface RevisionRequiredDetails {
  batch: PurchaseBatch;
  version: number;
  error_code: RevisionErrorCode;
  details: RevisionBlocker[];
}

export interface SupplierProcurementApiError<Details = unknown> {
  error: unknown;
  message: string;
  statusCode?: number;
  code?: string;
  data?: unknown;
  details?: Details;
  requestId?: string;
}

export interface RevisionRequiredApiError
  extends SupplierProcurementApiError<RevisionRequiredDetails> {
  statusCode: 409;
  code: RevisionErrorCode;
  details: RevisionRequiredDetails;
}

export interface PaginationQuery {
  page?: number;
  pageSize?: number;
}

export interface BatchListQuery extends PaginationQuery {
  keyword?: string;
  status?: PurchaseBatchStatus;
  projectId?: Uuid;
}

export interface CatalogQuery extends PaginationQuery {
  projectId: Uuid;
  keyword?: string;
  categoryId?: Uuid;
  brandId?: Uuid;
  tenantSupplierId?: Uuid;
}

export interface PurchaseBatchDraftItemInput {
  supplier_sku_id: Uuid;
  cost_category_id: Uuid;
  quantity: DecimalString;
}

export interface SaveDraftInput {
  project_id: Uuid;
  expected_version: number;
  reason: string;
  expected_delivery_date?: IsoDate | null;
  remark?: string | null;
  items: PurchaseBatchDraftItemInput[];
}

export interface SubmitInput {
  expected_version: number;
}

export type ReviewInput =
  | {
      expected_version: number;
      action: 'approve';
      remark?: string | null;
    }
  | {
      expected_version: number;
      action: 'reject';
      remark: string;
    };

export interface CancelInput {
  expected_version: number;
  reason: string;
}

export type QuickCreateSpecValue =
  | string
  | number
  | boolean
  | string[];

export interface PurchasableProductCreateInput {
  sku_id: Uuid;
  product: {
    name: string;
    category_id: Uuid;
    brand_id: Uuid;
  };
  sku: {
    name: string;
    purchase_unit_id: Uuid;
    spec_values: Record<string, QuickCreateSpecValue>;
  };
  price: {
    unit_price: DecimalString;
    tax_rate: DecimalString;
    tax_inclusive: boolean;
  };
}

export interface PurchasableProductRecord {
  id: Uuid;
  supplier_id: Uuid;
  product_code: string;
  name: string;
  category_id: Uuid;
  brand_id: Uuid;
  description: null;
  status: 'active';
  version: 2;
  ownership_scope: 'tenant';
  owner_tenant_id: Uuid;
  acting_tenant_id: Uuid;
  acting_employee_id: Uuid;
  operation_source: 'tenant';
  proxy_reason: null;
  created_by_employee_id: Uuid;
  updated_by_employee_id: Uuid;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface PurchasableSkuRecord {
  id: Uuid;
  supplier_id: Uuid;
  supplier_product_id: Uuid;
  sku_code: string;
  name: string;
  specification: null;
  model: null;
  spec_values: Record<string, QuickCreateSpecValue>;
  purchase_unit_id: Uuid;
  base_unit_id: Uuid;
  base_unit_conversion: number;
  batch_managed: false;
  color_managed: false;
  serial_managed: false;
  status: 'active';
  version: 2;
  ownership_scope: 'tenant';
  owner_tenant_id: Uuid;
  acting_tenant_id: Uuid;
  acting_employee_id: Uuid;
  operation_source: 'tenant';
  proxy_reason: null;
  created_by_employee_id: Uuid;
  updated_by_employee_id: Uuid;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface PurchasablePriceRecord {
  id: Uuid;
  tenant_id: Uuid;
  supplier_id: Uuid;
  supplier_price_list_id: Uuid;
  supplier_product_id: Uuid;
  supplier_sku_id: Uuid;
  minimum_quantity: DecimalString;
  maximum_quantity: null;
  purchase_unit_id: Uuid;
  base_unit_id: Uuid;
  base_unit_conversion: DecimalString;
  unit_price: DecimalString;
  tax_rate: DecimalString;
  tax_inclusive: boolean;
  acting_tenant_id: Uuid;
  acting_employee_id: Uuid;
  operation_source: 'tenant';
  proxy_reason: null;
  created_by_employee_id: Uuid;
  updated_by_employee_id: Uuid;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface PurchasableCreatedCatalogItem {
  supplier_product_id: Uuid;
  product_code: string;
  product_name: string;
  supplier_sku_id: Uuid;
  sku_code: string;
  sku_name: string;
  specification: null;
  model: null;
  supplier_price_list_id: Uuid;
  price_list_code: 'DEFAULT';
  price_list_version: number;
  effective_from: IsoDateTime;
  effective_until: IsoDateTime | null;
  supplier_price_list_item_id: Uuid;
  purchase_unit_id: Uuid;
  purchase_unit_code: string;
  purchase_unit_name: string;
  purchase_unit_symbol: string;
  base_unit_id: Uuid;
  base_unit_code: string;
  base_unit_name: string;
  base_unit_symbol: string;
  base_unit_conversion: DecimalString;
  unit_price: DecimalString;
  tax_rate: DecimalString;
  tax_inclusive: boolean;
}

export interface PurchasableProductCreated {
  status: 'created';
  idempotent: boolean;
  product: PurchasableProductRecord;
  sku: PurchasableSkuRecord;
  price: PurchasablePriceRecord;
  catalog_item: PurchasableCreatedCatalogItem;
}

export const commandOptions = (idempotencyKey: string): RequestOptions => ({
  header: { 'Idempotency-Key': idempotencyKey },
});

export const createSupplierProcurementService = (
  client: SupplierProcurementApi,
) => ({
  listProjectOptions: (query: PaginationQuery & { keyword?: string } = {}) =>
    client.get<Page<ProjectOption>>(
      '/supplier-purchase-batch-project-options',
      query,
    ),

  listCostCategories: (query: PaginationQuery & { keyword?: string } = {}) =>
    client.get<Page<CostCategoryOption>>(
      '/supplier-purchase-batch-cost-categories',
      query,
    ),

  listCatalog: (query: CatalogQuery) =>
    client.get<Page<PurchaseBatchCatalogItem>>(
      '/supplier-purchase-batch-catalog',
      query,
    ),

  listBatches: (query: BatchListQuery = {}) =>
    client.get<Page<PurchaseBatchListItem>>(
      '/supplier-purchase-batches',
      query,
    ),

  getBatch: (batchId: Uuid) =>
    client.get<PurchaseBatchDetail>(
      `/supplier-purchase-batches/${batchId}`,
    ),

  listItems: (batchId: Uuid, query: PaginationQuery = {}) =>
    client.get<Page<PurchaseBatchItem>>(
      `/supplier-purchase-batches/${batchId}/items`,
      query,
    ),

  listRequisitions: (batchId: Uuid, query: PaginationQuery = {}) =>
    client.get<Page<PurchaseBatchRequisition>>(
      `/supplier-purchase-batches/${batchId}/requisitions`,
      query,
    ),

  listOrders: (batchId: Uuid, query: PaginationQuery = {}) =>
    client.get<Page<PurchaseBatchOrder>>(
      `/supplier-purchase-batches/${batchId}/orders`,
      query,
    ),

  saveDraft: (
    batchId: Uuid,
    input: SaveDraftInput,
    idempotencyKey: string,
  ) => client.post<SavedCommandResult>(
    `/supplier-purchase-batches/${batchId}/save-draft`,
    input,
    commandOptions(idempotencyKey),
  ),

  submit: (
    batchId: Uuid,
    input: SubmitInput,
    idempotencyKey: string,
  ) => client.post<SubmittedCommandResult>(
    `/supplier-purchase-batches/${batchId}/submit`,
    input,
    commandOptions(idempotencyKey),
  ),

  review: (
    batchId: Uuid,
    input: ReviewInput,
    idempotencyKey: string,
  ) => client.post<ReviewCommandResult>(
    `/supplier-purchase-batches/${batchId}/review`,
    input,
    commandOptions(idempotencyKey),
  ),

  cancel: (
    batchId: Uuid,
    input: CancelInput,
    idempotencyKey: string,
  ) => client.post<CancelledCommandResult>(
    `/supplier-purchase-batches/${batchId}/cancel`,
    input,
    commandOptions(idempotencyKey),
  ),

  createPurchasableProduct: (
    supplierId: Uuid,
    tenantSupplierId: Uuid,
    input: PurchasableProductCreateInput,
    idempotencyKey: string,
  ) => client.post<PurchasableProductCreated>(
    `/supplier-purchasable-products/${supplierId}` +
      `?tenantSupplierId=${encodeURIComponent(tenantSupplierId)}`,
    input,
    commandOptions(idempotencyKey),
  ),
});
