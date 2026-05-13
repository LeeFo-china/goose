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
  login_bindings?: {
    status: "none" | "web_only" | "wechat_only" | "web_and_wechat" | "other";
    label: string;
    web: boolean;
    wechat_mini: boolean;
    wechat_openid_masked?: string | null;
  } | null;
};

type EmployeeDepartmentOption = {
  id: string;
  code: string;
  name: string;
  selected_post_codes?: string[];
};

type EmployeePostOption = {
  id: string;
  code: string;
  name: string;
  status: number | null;
  sort: number | null;
};

type DepartmentPostRuleConfig = {
  departments: EmployeeDepartmentOption[];
  post_options: EmployeePostOption[];
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

async function getDepartmentPostRuleConfig() {
  const token = await getAdminToken();
  if (!token) {
    return {
      departments: [],
      post_options: [],
      error: "缺少登录凭证",
    };
  }

  try {
    const response = await fetch(buildBackendUrl("/department-post-rules"), {
      headers: {
        authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
    const payload = await parseBackendJson<DepartmentPostRuleConfig>(response);
    return {
      departments: payload.data?.departments || [],
      post_options: payload.data?.post_options || [],
      error: null,
    };
  } catch (error) {
    return {
      departments: [],
      post_options: [],
      error: error instanceof Error ? error.message : "部门岗位配置加载失败",
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
  const [employeeData, departmentPostConfig] = await Promise.all([
    getEmployees(params),
    getDepartmentPostRuleConfig(),
  ]);
  const { list, pagination, error } = employeeData;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">员工管理</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            员工档案、登录绑定、状态和权限入口。当前共 {pagination.total} 条记录。
          </p>
        </div>
        <CreateEmployeeButton
          departments={departmentPostConfig.departments}
          posts={departmentPostConfig.post_options}
        />
      </div>

      <EmployeesClientShell
        employees={list}
        pagination={pagination}
        status={status}
        keyword={keyword}
        error={error || departmentPostConfig.error}
        statusOptions={statusOptions}
        departments={departmentPostConfig.departments}
        posts={departmentPostConfig.post_options}
      />
    </div>
  );
}
