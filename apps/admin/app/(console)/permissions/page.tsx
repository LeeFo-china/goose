import { KeyRound } from "lucide-react";
import {
  type PermissionRecord,
} from "@/components/permissions/permission-mutations";
import { getTenantBusinessAccessDenied } from "@/components/layout/platform-mode-access-denied";
import { PermissionsClientShell } from "@/components/permissions/permissions-client-shell";
import { getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type PermissionListData = {
  list: PermissionRecord[];
  pagination: Pagination;
};

type PermissionPageSearchParams = {
  page?: string;
  status?: string;
  module?: string;
  keyword?: string;
};

function normalizePage(value: string | undefined) {
  const page = Number(value || 1);
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
}

async function getPermissions(params: PermissionPageSearchParams) {
  const token = await getAdminToken();
  if (!token) {
    return {
      list: [],
      pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      error: "缺少登录凭证",
    };
  }

  const page = normalizePage(params.page);
  const keyword = params.keyword?.trim() || "";
  const status = params.status?.trim() || "";
  const module = params.module?.trim() || "";
  const query = new URLSearchParams({
    page: String(page),
    pageSize: "20",
  });
  if (keyword) query.set("keyword", keyword);
  if (status) query.set("status", status);
  if (module) query.set("module", module);

  try {
    const response = await fetch(buildBackendUrl(`/permissions?${query}`), {
      headers: {
        authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
    const payload = await parseBackendJson<PermissionListData>(response);
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
      error: error instanceof Error ? error.message : "权限列表加载失败",
    };
  }
}

export default async function PermissionsPage({
  searchParams,
}: {
  searchParams: Promise<PermissionPageSearchParams>;
}) {
  const accessDenied = await getTenantBusinessAccessDenied();
  if (accessDenied) return accessDenied;

  const params = await searchParams;
  const status = params.status?.trim() || "";
  const module = params.module?.trim() || "";
  const keyword = params.keyword?.trim() || "";
  const { list, pagination, error } = await getPermissions(params);

  return (
    <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-5 overflow-hidden">
      <div className="shrink-0 flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground">
            <KeyRound aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-normal">权限点管理</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              权限编码、模块、资源和动作维护。当前筛选共 {pagination.total} 个权限点。
            </p>
          </div>
        </div>
      </div>

      <PermissionsClientShell
        permissions={list}
        pagination={pagination}
        status={status}
        module={module}
        keyword={keyword}
        error={error}
        canManageDefinitions={false}
      />
    </div>
  );
}
