import { requestBackendJson } from "@/lib/backend-client";

import { availableToRequestAmount } from "./payable-rules";
import { normalizeSupplierPayableIds } from "./payable-id-batch";
import type {
  SupplierPayableFilterOptionPage,
  SupplierPayableFilterOptionType,
  SupplierPayableFacts,
  SupplierPayableListQuery,
  SupplierPayablePage,
} from "./payable-types";

type SupplierPayableFactsPage = Omit<SupplierPayablePage, "list"> & {
  list: SupplierPayableFacts[];
};

const PAYABLE_PATH = "/supplier-payables";
const MAX_PAGE_SIZE = 100;

export async function listSupplierPayablesByIds(
  payableIds: readonly string[],
): Promise<SupplierPayablePage["list"]> {
  const ids = normalizeSupplierPayableIds(payableIds);
  const query = new URLSearchParams({ ids: ids.join(",") });
  const facts = await requestBackendJson<SupplierPayableFacts[]>(
    `${PAYABLE_PATH}/batch?${query}`,
    { fallbackMessage: "所选供应商应付重新校验失败" },
  );
  return facts.map((item) => ({
    ...item,
    available_to_request_amount: availableToRequestAmount(item),
  }));
}

export async function listSupplierPayables(
  input: SupplierPayableListQuery,
): Promise<SupplierPayablePage> {
  const query = new URLSearchParams({
    page: String(normalizePage(input.page)),
    pageSize: String(normalizePageSize(input.pageSize)),
  });
  const filterKeys = [
    "project_id",
    "tenant_supplier_id",
    "purchase_order_id",
    "status",
    "due_from",
    "due_to",
  ] as const;
  for (const key of filterKeys) {
    const value = input[key];
    if (value) query.set(key, value);
  }

  const page = await requestBackendJson<SupplierPayableFactsPage>(
    `${PAYABLE_PATH}?${query}`,
    { fallbackMessage: "供应商应付加载失败" },
  );
  return {
    ...page,
    list: page.list.map((item) => ({
      ...item,
      available_to_request_amount: availableToRequestAmount(item),
    })),
  };
}

export function listSupplierPayableFilterOptions(input: {
  type: SupplierPayableFilterOptionType;
  page: number;
  pageSize: number;
  keyword?: string;
}) {
  const query = new URLSearchParams({
    type: input.type,
    page: String(normalizePage(input.page)),
    pageSize: String(normalizePageSize(input.pageSize)),
  });
  if (input.keyword?.trim()) query.set("keyword", input.keyword.trim());
  return requestBackendJson<SupplierPayableFilterOptionPage>(
    `/supplier-payable-filter-options?${query}`,
    { fallbackMessage: "供应商应付筛选项加载失败" },
  );
}

function normalizePage(page: number) {
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function normalizePageSize(pageSize: number) {
  if (!Number.isInteger(pageSize)) return 20;
  return Math.min(MAX_PAGE_SIZE, Math.max(1, pageSize));
}
