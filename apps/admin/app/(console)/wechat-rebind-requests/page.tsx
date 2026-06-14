import { RefreshCw } from "lucide-react";
import { WechatRebindClientShell } from "@/components/wechat-rebind-requests/wechat-rebind-client-shell";
import type { WechatRebindRequestListData } from "@/components/wechat-rebind-requests/wechat-rebind-types";
import { getTenantBusinessAccessDenied } from "@/components/layout/platform-mode-access-denied";
import { getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

type WechatRebindPageSearchParams = {
  page?: string;
  status?: string;
};

const allowedStatuses = new Set(["pending", "approved", "rejected", "cancelled"]);

function normalizePage(value: string | undefined) {
  const page = Number(value || 1);
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
}

function normalizeStatus(value: string | undefined) {
  const status = value?.trim() || "";
  return allowedStatuses.has(status) ? status : "";
}

async function getWechatRebindRequests(params: WechatRebindPageSearchParams) {
  const token = await getAdminToken();
  if (!token) {
    return {
      list: [],
      pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      error: "缺少登录凭证",
    };
  }

  const page = normalizePage(params.page);
  const status = normalizeStatus(params.status);
  const query = new URLSearchParams({
    page: String(page),
    pageSize: "20",
  });
  if (status) query.set("status", status);

  try {
    const response = await fetch(buildBackendUrl(`/employee/auth/wechat-rebind-requests?${query}`), {
      headers: {
        authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
    const payload = await parseBackendJson<WechatRebindRequestListData>(response);
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
      error: error instanceof Error ? error.message : "微信换绑申请加载失败",
    };
  }
}

export default async function WechatRebindRequestsPage({
  searchParams,
}: {
  searchParams: Promise<WechatRebindPageSearchParams>;
}) {
  const accessDenied = await getTenantBusinessAccessDenied();
  if (accessDenied) return accessDenied;

  const params = await searchParams;
  const status = normalizeStatus(params.status);
  const { list, pagination, error } = await getWechatRebindRequests(params);

  return (
    <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-5 overflow-hidden">
      <div className="shrink-0 flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground">
            <RefreshCw aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-normal">微信换绑审核</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              审核客户或员工提交的微信换绑申请。当前筛选共 {pagination.total} 条申请。
            </p>
          </div>
        </div>
      </div>

      <WechatRebindClientShell
        requests={list}
        pagination={pagination}
        status={status}
        error={error}
      />
    </div>
  );
}
