import { CustomersClientShell } from "@/components/customers/customers-client-shell";
import { type CustomerRecord } from "@/components/customers/customer-mutations";
import {
  CUSTOMER_TABLE_MAX_PAGE_SIZE,
  CUSTOMER_TABLE_MIN_PAGE_SIZE,
} from "@/components/customers/customer-list-page-size";
import { getTenantBusinessAccessDenied } from "@/components/layout/platform-mode-access-denied";
import { getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type CustomerListData = {
  list: CustomerRecord[];
  pagination: Pagination;
};

type CustomerPageSearchParams = {
  page?: string;
  pageSize?: string;
  status?: string;
  source?: string;
  customer_origin?: string;
  keyword?: string;
  follow?: string;
};

function normalizePage(value: string | undefined) {
  const page = Number(value || 1);
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
}

function normalizePageSize(value: string | undefined) {
  const pageSize = Number(value || 20);
  if (!Number.isFinite(pageSize)) return 20;

  return Math.min(
    CUSTOMER_TABLE_MAX_PAGE_SIZE,
    Math.max(CUSTOMER_TABLE_MIN_PAGE_SIZE, Math.floor(pageSize)),
  );
}

async function getCustomers(params: CustomerPageSearchParams) {
  const token = await getAdminToken();
  const page = normalizePage(params.page);
  const pageSize = normalizePageSize(params.pageSize);

  if (!token) {
    return {
      list: [],
      pagination: { page, pageSize, total: 0, totalPages: 0 },
      error: "缺少登录凭证",
    };
  }

  const status = params.status?.trim() || "";
  const source = params.source?.trim() || "";
  const customerOrigin = params.customer_origin?.trim() || "";
  const keyword = params.keyword?.trim() || "";
  const follow = params.follow?.trim() || "";
  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    mode: "compact",
  });
  if (status) query.set("status", status);
  if (source) query.set("source", source);
  if (customerOrigin) query.set("customer_origin", customerOrigin);
  if (keyword) query.set("keyword", keyword);
  if (follow) query.set("follow", follow);

  try {
    const response = await fetch(buildBackendUrl(`/customers?${query}`), {
      headers: {
        authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
    const payload = await parseBackendJson<CustomerListData>(response);
    return {
      ...(payload.data || {
        list: [],
        pagination: { page, pageSize, total: 0, totalPages: 0 },
      }),
      error: null,
    };
  } catch (error) {
    return {
      list: [],
      pagination: { page, pageSize, total: 0, totalPages: 0 },
      error: error instanceof Error ? error.message : "客户列表加载失败",
    };
  }
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<CustomerPageSearchParams>;
}) {
  const accessDenied = await getTenantBusinessAccessDenied();
  if (accessDenied) return accessDenied;

  const params = await searchParams;
  const status = params.status?.trim() || "";
  const source = params.source?.trim() || "";
  const customerOrigin = params.customer_origin?.trim() || "";
  const keyword = params.keyword?.trim() || "";
  const follow = params.follow?.trim() || "";
  const { list, pagination, error } = await getCustomers(params);

  return (
    <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-5 overflow-hidden">
      <CustomersClientShell
        customers={list}
        pagination={pagination}
        status={status}
        source={source}
        customerOrigin={customerOrigin}
        keyword={keyword}
        follow={follow}
        error={error}
      />
    </div>
  );
}
