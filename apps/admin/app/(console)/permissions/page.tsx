import { ShieldAlert } from "lucide-react";
import {
  PermissionFilters,
  PermissionsPagination,
} from "@/components/permissions/permission-list-actions";
import {
  CreatePermissionButton,
  PermissionRowActions,
  type PermissionRecord,
} from "@/components/permissions/permission-mutations";
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

const statusMeta: Record<string, {
  label: string;
  variant: "success" | "secondary" | "outline";
}> = {
  active: { label: "启用", variant: "success" },
  inactive: { label: "停用", variant: "secondary" },
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
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] border-t text-sm">
              <thead className="bg-muted/60 text-left text-xs font-medium text-muted-foreground">
                <tr>
                  <th className="px-5 py-3">权限</th>
                  <th className="px-5 py-3">模块</th>
                  <th className="px-5 py-3">资源</th>
                  <th className="px-5 py-3">动作</th>
                  <th className="px-5 py-3">状态</th>
                  <th className="px-5 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {list.length > 0 ? (
                  list.map((permission) => {
                    const meta = statusMeta[permission.status || ""] || {
                      label: permission.status || "未知",
                      variant: "outline" as const,
                    };

                    return (
                      <tr key={permission.id} className="border-t transition-colors hover:bg-muted/40">
                        <td className="px-5 py-4">
                          <div className="min-w-0">
                            <div className="truncate font-medium">
                              {permission.name || permission.code}
                            </div>
                            <div className="truncate text-xs text-muted-foreground">
                              {permission.code}
                            </div>
                            {permission.description ? (
                              <div className="mt-1 max-w-[420px] truncate text-xs text-muted-foreground">
                                {permission.description}
                              </div>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-muted-foreground">{permission.module}</td>
                        <td className="px-5 py-4 text-muted-foreground">{permission.resource}</td>
                        <td className="px-5 py-4 text-muted-foreground">{permission.action}</td>
                        <td className="px-5 py-4">
                          <Badge variant={meta.variant}>{meta.label}</Badge>
                        </td>
                        <td className="relative px-5 py-4">
                          <PermissionRowActions permission={permission} />
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td className="px-5 py-12 text-center text-muted-foreground" colSpan={6}>
                      没有符合条件的权限
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
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
