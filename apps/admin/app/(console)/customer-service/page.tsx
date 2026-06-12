import { Headset } from "lucide-react";
import { CustomerServiceClientShell } from "@/components/customer-service/customer-service-client-shell";
import type { CustomerServiceTicketListData } from "@/components/customer-service/customer-service-types";
import { getTenantBusinessAccessDenied } from "@/components/layout/platform-mode-access-denied";
import { getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

type CustomerServicePageSearchParams = {
  page?: string;
  status?: string;
  category?: string;
  keyword?: string;
  ticketId?: string;
};

function normalizePage(value: string | undefined) {
  const page = Number(value || 1);
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
}

async function getCustomerServiceTickets(params: CustomerServicePageSearchParams) {
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
  const category = params.category?.trim() || "";
  const keyword = params.keyword?.trim() || "";
  const query = new URLSearchParams({
    page: String(page),
    pageSize: "20",
  });
  if (status) query.set("status", status);
  if (category) query.set("category", category);
  if (keyword) query.set("keyword", keyword);

  try {
    const response = await fetch(buildBackendUrl(`/customer-service-tickets?${query}`), {
      headers: {
        authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
    const payload = await parseBackendJson<CustomerServiceTicketListData>(response);
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
      error: error instanceof Error ? error.message : "客服问题列表加载失败",
    };
  }
}

export default async function CustomerServicePage({
  searchParams,
}: {
  searchParams: Promise<CustomerServicePageSearchParams>;
}) {
  const accessDenied = await getTenantBusinessAccessDenied();
  if (accessDenied) return accessDenied;

  const params = await searchParams;
  const status = params.status?.trim() || "";
  const category = params.category?.trim() || "";
  const keyword = params.keyword?.trim() || "";
  const ticketId = params.ticketId?.trim() || "";
  const { list, pagination, error } = await getCustomerServiceTickets(params);

  return (
    <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-5 overflow-hidden">
      <div className="shrink-0 flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground">
            <Headset aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-normal">客服问题</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              处理客户提交的问题、图片和负责人流转。当前筛选共 {pagination.total} 条工单。
            </p>
          </div>
        </div>
      </div>

      <CustomerServiceClientShell
        tickets={list}
        pagination={pagination}
        status={status}
        category={category}
        keyword={keyword}
        initialTicketId={ticketId}
        error={error}
      />
    </div>
  );
}
