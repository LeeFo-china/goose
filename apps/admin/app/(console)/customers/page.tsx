import { UsersRound } from "lucide-react";
import { CustomersClientShell } from "@/components/customers/customers-client-shell";
import {
  CreateCustomerButton,
  type CustomerRecord,
} from "@/components/customers/customer-mutations";
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

async function getCustomers(params: CustomerPageSearchParams) {
  const token = await getAdminToken();
  if (!token) {
    return {
      list: [],
      pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      error: "缺少登录凭证",
    };
  }

  const page = normalizePage(params.page);
  const status = params.status?.trim() || "";
  const source = params.source?.trim() || "";
  const customerOrigin = params.customer_origin?.trim() || "";
  const keyword = params.keyword?.trim() || "";
  const follow = params.follow?.trim() || "";
  const query = new URLSearchParams({
    page: String(page),
    pageSize: "20",
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
        pagination: { page, pageSize: 20, total: 0, totalPages: 0 },
      }),
      error: null,
    };
  } catch (error) {
    return {
      list: [],
      pagination: { page, pageSize: 20, total: 0, totalPages: 0 },
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
    <div className="flex min-h-[calc(100vh-6.5rem)] flex-col gap-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground">
            <UsersRound aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-normal">客户管理</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              客户资料、负责人、来源状态和跟进计划。当前筛选共 {pagination.total} 条记录。
            </p>
          </div>
        </div>
        <CreateCustomerButton />
      </div>

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
