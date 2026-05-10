import {
  EMPLOYEE_STATUS_VALUES,
  EmployeeStatusConfig,
  type EmployeeStatus,
} from "@gooes/domain";
import {
  CreateEmployeeButton,
} from "@/components/employees/employee-mutations";
import { EmployeesClientShell } from "@/components/employees/employees-client-shell";
import { getTenantBusinessAccessDenied } from "@/components/layout/platform-mode-access-denied";
import { getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

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
  ...EMPLOYEE_STATUS_VALUES.map((value) => ({
    value,
    label: EmployeeStatusConfig[value].label,
  })),
];

function normalizePage(value: string | undefined) {
  const page = Number(value || 1);
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
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
  const accessDenied = await getTenantBusinessAccessDenied();
  if (accessDenied) return accessDenied;

  const params = await searchParams;
  const status = params.status?.trim() || "";
  const keyword = params.keyword?.trim() || "";
  const { list, pagination, error } = await getEmployees(params);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">员工管理</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            员工档案、登录绑定、状态和权限入口。当前共 {pagination.total} 条记录。
          </p>
        </div>
        <CreateEmployeeButton />
      </div>

      <EmployeesClientShell
        employees={list}
        pagination={pagination}
        status={status}
        keyword={keyword}
        error={error}
        statusOptions={statusOptions}
      />
    </div>
  );
}
