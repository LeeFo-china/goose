import { StatusAlert } from "@/components/admin/status-alert";
import { getTenantBusinessAccessDenied } from "@/components/layout/platform-mode-access-denied";
import {
  CreateRoleButton,
  type RoleRecord,
} from "@/components/roles/role-mutations";
import { RolesTable } from "@/components/roles/roles-table";
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

type RoleListData = {
  list: RoleRecord[];
  pagination: Pagination;
};

async function getRoles() {
  const token = await getAdminToken();
  if (!token) {
    return {
      list: [],
      pagination: { page: 1, pageSize: 50, total: 0, totalPages: 0 },
      error: "缺少登录凭证",
    };
  }

  try {
    const response = await fetch(buildBackendUrl("/roles?page=1&pageSize=50"), {
      headers: {
        authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
    const payload = await parseBackendJson<RoleListData>(response);
    return {
      ...(payload.data || {
        list: [],
        pagination: { page: 1, pageSize: 50, total: 0, totalPages: 0 },
      }),
      error: null,
    };
  } catch (error) {
    return {
      list: [],
      pagination: { page: 1, pageSize: 50, total: 0, totalPages: 0 },
      error: error instanceof Error ? error.message : "角色列表加载失败",
    };
  }
}

export default async function RolesPage() {
  const accessDenied = await getTenantBusinessAccessDenied();
  if (accessDenied) return accessDenied;

  const { list, pagination, error } = await getRoles();

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">角色管理</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            创建角色、维护角色状态，并给角色分配权限点。当前共 {pagination.total} 条记录。
          </p>
        </div>
        <CreateRoleButton />
      </div>

      {error ? <StatusAlert>{error}</StatusAlert> : null}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
          <CardTitle>角色列表</CardTitle>
          <Badge variant="outline">共 {pagination.total} 条</Badge>
        </CardHeader>
        <CardContent className="p-0">
          <RolesTable roles={list} />
        </CardContent>
      </Card>
    </div>
  );
}
