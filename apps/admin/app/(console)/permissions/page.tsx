import { ShieldAlert } from "lucide-react";
import {
  PermissionFilters,
  PermissionsPagination,
} from "@/components/permissions/permission-list-actions";
import {
  CreatePermissionButton,
  type PermissionRecord,
} from "@/components/permissions/permission-mutations";
import { PermissionsTable } from "@/components/permissions/permissions-table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  const params = await searchParams;
  const status = params.status?.trim() || "";
  const module = params.module?.trim() || "";
  const keyword = params.keyword?.trim() || "";
  const { list, pagination, error } = await getPermissions(params);

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">角色权限</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            权限编码、模块、资源和动作维护。当前共 {pagination.total} 条记录。
          </p>
        </div>
        <CreatePermissionButton />
      </div>

      <Card>
        <CardContent className="p-4">
          <PermissionFilters status={status} module={module} keyword={keyword} />
        </CardContent>
      </Card>

      {error ? (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="flex items-center gap-3 p-4 text-sm text-red-700">
            <ShieldAlert className="h-4 w-4" />
            {error}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle>权限列表</CardTitle>
          <Badge variant="outline">
            第 {pagination.page} / {Math.max(pagination.totalPages, 1)} 页
          </Badge>
        </CardHeader>
        <CardContent className="p-0">
          <PermissionsTable permissions={list} />
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          每页 {pagination.pageSize} 条，共 {pagination.total} 条
        </div>
        <PermissionsPagination
          pagination={pagination}
          status={status}
          module={module}
          keyword={keyword}
        />
      </div>
    </div>
  );
}
