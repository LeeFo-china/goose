import {
  BadgeCheck,
  ShieldAlert,
  UserRound,
} from "lucide-react";
import {
  EmployeeSearchForm,
  EmployeesPagination,
  EmployeesStatusFilters,
} from "@/components/employees/employee-list-actions";
import {
  CreateEmployeeButton,
  EmployeeRowActions,
} from "@/components/employees/employee-mutations";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

type EmployeeStatus = "pending" | "active" | "suspended" | "leaved";

type Employee = {
  id: string;
  name: string | null;
  phone: string | null;
  role?: string | null;
  status: EmployeeStatus | string | null;
  department_id: string | null;
  post_id: string | null;
  avatar: string | null;
  user_id?: string | null;
  created_at: string | null;
  last_login_time?: string | null;
};

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type EmployeeListData = {
  list: Employee[];
  pagination: Pagination;
};

type EmployeePageSearchParams = {
  page?: string;
  status?: string;
  keyword?: string;
};

const statusOptions: Array<{
  label: string;
  value: "" | EmployeeStatus;
}> = [
  { label: "全部", value: "" },
  { label: "在职", value: "active" },
  { label: "待入职", value: "pending" },
  { label: "已封禁", value: "suspended" },
  { label: "已离职", value: "leaved" },
];

const statusMeta: Record<string, {
  label: string;
  variant: "success" | "warning" | "secondary" | "outline";
}> = {
  active: { label: "在职", variant: "success" },
  pending: { label: "待入职", variant: "warning" },
  suspended: { label: "已封禁", variant: "secondary" },
  leaved: { label: "已离职", variant: "outline" },
};

function normalizePage(value: string | undefined) {
  const page = Number(value || 1);
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function maskPhone(value: string | null) {
  if (!value || value.length < 7) return value || "-";
  return `${value.slice(0, 3)}****${value.slice(-4)}`;
}

async function getEmployees(params: EmployeePageSearchParams) {
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
  const query = new URLSearchParams({
    page: String(page),
    pageSize: "20",
  });
  if (keyword) query.set("keyword", keyword);
  if (status) query.set("status", status);

  try {
    const response = await fetch(buildBackendUrl(`/employees?${query}`), {
      headers: {
        authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
    const payload = await parseBackendJson<EmployeeListData>(response);
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
      error: error instanceof Error ? error.message : "员工列表加载失败",
    };
  }
}

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<EmployeePageSearchParams>;
}) {
  const params = await searchParams;
  const status = params.status?.trim() || "";
  const keyword = params.keyword?.trim() || "";
  const { list, pagination, error } = await getEmployees(params);

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">员工管理</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            员工档案、登录绑定、状态和权限入口。当前共 {pagination.total} 条记录。
          </p>
        </div>
        <CreateEmployeeButton />
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <EmployeesStatusFilters
              options={statusOptions}
              currentStatus={status}
              keyword={keyword}
            />
            <EmployeeSearchForm status={status} keyword={keyword} />
          </div>
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
          <CardTitle>员工列表</CardTitle>
          <Badge variant="outline">
            第 {pagination.page} / {Math.max(pagination.totalPages, 1)} 页
          </Badge>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] border-t text-sm">
              <thead className="bg-muted/60 text-left text-xs font-medium text-muted-foreground">
                <tr>
                  <th className="px-5 py-3">员工</th>
                  <th className="px-5 py-3">手机号</th>
                  <th className="px-5 py-3">状态</th>
                  <th className="px-5 py-3">登录绑定</th>
                  <th className="px-5 py-3">部门</th>
                  <th className="px-5 py-3">创建时间</th>
                  <th className="px-5 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {list.length > 0 ? (
                  list.map((employee) => {
                    const meta = statusMeta[employee.status || ""] || {
                      label: employee.status || "未知",
                      variant: "outline" as const,
                    };

                    return (
                      <tr key={employee.id} className="border-t transition-colors hover:bg-muted/40">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-accent text-accent-foreground">
                              <UserRound className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="truncate font-medium">
                                {employee.name || "未命名员工"}
                              </div>
                              <div className="truncate text-xs text-muted-foreground">
                                {employee.id}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4">{maskPhone(employee.phone)}</td>
                        <td className="px-5 py-4">
                          <Badge variant={meta.variant}>{meta.label}</Badge>
                        </td>
                        <td className="px-5 py-4">
                          {employee.user_id ? (
                            <Badge variant="success">
                              <BadgeCheck className="mr-1 h-3 w-3" />
                              已绑定
                            </Badge>
                          ) : (
                            <Badge variant="secondary">未绑定</Badge>
                          )}
                        </td>
                        <td className="px-5 py-4 text-muted-foreground">
                          {employee.department_id ? employee.department_id.slice(0, 8) : "-"}
                        </td>
                        <td className="px-5 py-4 text-muted-foreground">
                          {formatDate(employee.created_at)}
                        </td>
                        <td className="relative px-5 py-4">
                          <EmployeeRowActions employee={employee} />
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td className="px-5 py-12 text-center text-muted-foreground" colSpan={7}>
                      没有符合条件的员工
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
        <EmployeesPagination
          pagination={pagination}
          status={status}
          keyword={keyword}
        />
      </div>
    </div>
  );
}
