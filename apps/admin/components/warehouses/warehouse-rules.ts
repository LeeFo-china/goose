import type {
  WarehouseCreateRequest,
  WarehouseDraft,
  WarehouseDraftErrors,
  WarehouseStatus,
} from "./warehouse-types";

type WarehouseListPathInput = {
  page: number;
  pageSize: number;
  keyword?: string;
  status?: WarehouseStatus;
};

export function buildWarehouseListPath(input: WarehouseListPathInput) {
  const query = new URLSearchParams({
    page: String(input.page),
    pageSize: String(input.pageSize),
  });
  if (input.keyword?.trim()) query.set("keyword", input.keyword.trim());
  if (input.status) query.set("status", input.status);
  return `/warehouses?${query}`;
}

export function validateWarehouseDraft(
  draft: Pick<WarehouseDraft, "name" | "address" | "contactName" | "contactPhone">,
): WarehouseDraftErrors {
  const errors: WarehouseDraftErrors = {};
  if (!draft.name.trim()) errors.name = "请输入仓库名称";
  if (draft.name.trim().length > 80) {
    errors.name = "仓库名称不能超过 80 个字符";
  }
  if (draft.address?.trim() && draft.address.trim().length > 200) {
    errors.address = "仓库地址不能超过 200 个字符";
  }
  if (draft.contactName?.trim() && draft.contactName.trim().length > 50) {
    errors.contactName = "联系人不能超过 50 个字符";
  }
  if (draft.contactPhone?.trim() && draft.contactPhone.trim().length > 30) {
    errors.contactPhone = "联系电话不能超过 30 个字符";
  }
  return errors;
}

export function normalizeWarehouseDraft(
  draft: WarehouseDraft,
): WarehouseCreateRequest {
  return {
    name: draft.name.trim(),
    address: nullableTrim(draft.address),
    contact_name: nullableTrim(draft.contactName),
    contact_phone: nullableTrim(draft.contactPhone),
    manager_employee_id: nullableTrim(draft.managerEmployeeId),
    is_default: draft.isDefault ?? false,
  };
}

export function hasWarehouseDraftErrors(errors: WarehouseDraftErrors) {
  return Object.keys(errors).length > 0;
}

function nullableTrim(value: string | null | undefined): string | null {
  const next = value?.trim();
  return next ? next : null;
}
