import { getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";
import {
  buildFinanceReconciliationSearchParams,
  buildFinanceReconciliationStatsSearchParams,
} from "./finance-reconciliation-utils";

export type FinanceReconciliationExceptionCode =
  | "receivable_overdue"
  | "payment_without_ledger"
  | "ledger_without_payment"
  | "payment_unallocated"
  | "allocation_amount_mismatch"
  | "receivable_paid_amount_mismatch";

export type FinanceReconciliationLevel = "info" | "warning" | "danger";
export type FinanceReconciliationDirection =
  | "receivable"
  | "payment"
  | "expense"
  | "ledger";
export type FinanceReconciliationStatus =
  | "open"
  | "acknowledged"
  | "ignored"
  | "resolved";
export type FinanceReconciliationAction =
  | "acknowledge"
  | "ignore"
  | "resolve"
  | "reopen";

export type FinanceReconciliationExceptionRecord = {
  id: string;
  project_id: string | null;
  project_name: string | null;
  exception_code: FinanceReconciliationExceptionCode;
  level: FinanceReconciliationLevel;
  direction: FinanceReconciliationDirection;
  status: FinanceReconciliationStatus;
  exception_fingerprint: string;
  subject_type: "receivable" | "payment" | "ledger";
  subject_id: string | null;
  title: string;
  description: string;
  amount: number;
  occurred_at: string;
  action: {
    key: string;
    label: string;
    target: string;
  };
  last_action: FinanceReconciliationAction | null;
  last_action_at: string | null;
  last_action_remark: string | null;
  last_actor_employee_id: string | null;
  last_actor_employee_name: string | null;
};

export type FinanceReconciliationActionRecord = {
  id: string;
  tenant_id: string;
  exception_fingerprint: string;
  exception_code: FinanceReconciliationExceptionCode;
  subject_type: "receivable" | "payment" | "ledger";
  subject_id: string | null;
  project_id: string | null;
  action: FinanceReconciliationAction;
  remark: string;
  actor_employee_id: string | null;
  actor_employee_name: string | null;
  created_at: string;
};

export type FinanceReconciliationActionListData = {
  list: FinanceReconciliationActionRecord[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

export type FinanceReconciliationSummary = {
  total: number;
  danger: number;
  warning: number;
  info: number;
};

export type FinanceReconciliationListData = {
  list: FinanceReconciliationExceptionRecord[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  summary: FinanceReconciliationSummary;
};

export type FinanceReconciliationOperatingStatsData = {
  scope: {
    date_from: string;
    date_to: string;
    stale_days: [3, 7];
  };
  summary: FinanceReconciliationSummary & {
    open: number;
    acknowledged: number;
    ignored: number;
    resolved: number;
    total_amount: number;
    stale_open_over_3_days: number;
    stale_open_over_7_days: number;
    latest_exception_at: string | null;
    latest_action_at: string | null;
  };
  by_exception_code: Array<{
    key: FinanceReconciliationExceptionCode;
    label: string;
    count: number;
    amount: number;
  }>;
  by_status: Array<{
    key: FinanceReconciliationStatus;
    label: string;
    count: number;
  }>;
  by_level: Array<{
    key: FinanceReconciliationLevel;
    label: string;
    count: number;
  }>;
  recent_actions: Array<{
    exception_fingerprint: string;
    exception_code: FinanceReconciliationExceptionCode;
    title: string;
    project_id: string | null;
    project_name: string | null;
    status: FinanceReconciliationStatus;
    action: FinanceReconciliationAction | null;
    actor_employee_id: string | null;
    actor_employee_name: string | null;
    acted_at: string | null;
    remark: string | null;
  }>;
};

export type FinanceReconciliationResult = FinanceReconciliationListData & {
  error: string | null;
};

export type FinanceReconciliationOperatingStatsResult =
  FinanceReconciliationOperatingStatsData & {
    error: string | null;
  };

export type FinanceReconciliationEmployeeOption = {
  value: string;
  label: string;
};

type EmployeeOptionRow = {
  id: string;
  name?: string | null;
  phone?: string | null;
  department_name?: string | null;
  post_name?: string | null;
};

type EmployeeListData = {
  list?: EmployeeOptionRow[];
};

export function emptyFinanceReconciliation(
  page = 1,
  pageSize = 20,
): FinanceReconciliationResult {
  return {
    list: [],
    pagination: {
      page,
      pageSize,
      total: 0,
      totalPages: 0,
    },
    summary: {
      total: 0,
      danger: 0,
      warning: 0,
      info: 0,
    },
    error: null,
  };
}

export function emptyFinanceReconciliationOperatingStats(): FinanceReconciliationOperatingStatsResult {
  return {
    scope: {
      date_from: "",
      date_to: "",
      stale_days: [3, 7],
    },
    summary: {
      total: 0,
      danger: 0,
      warning: 0,
      info: 0,
      open: 0,
      acknowledged: 0,
      ignored: 0,
      resolved: 0,
      total_amount: 0,
      stale_open_over_3_days: 0,
      stale_open_over_7_days: 0,
      latest_exception_at: null,
      latest_action_at: null,
    },
    by_exception_code: [],
    by_status: [
      { key: "open", label: "未处理", count: 0 },
      { key: "acknowledged", label: "已确认", count: 0 },
      { key: "ignored", label: "已忽略", count: 0 },
      { key: "resolved", label: "人工闭环", count: 0 },
    ],
    by_level: [
      { key: "danger", label: "高风险", count: 0 },
      { key: "warning", label: "预警", count: 0 },
      { key: "info", label: "提示", count: 0 },
    ],
    recent_actions: [],
    error: null,
  };
}

export async function fetchFinanceReconciliationExceptions(query: {
  page?: number;
  pageSize?: number;
  date_from?: string;
  date_to?: string;
  project_id?: string;
  exception_code?: string;
  level?: string;
  direction?: string;
  status?: string;
  actor_employee_id?: string;
}): Promise<FinanceReconciliationResult> {
  const token = await getAdminToken();
  const params = buildFinanceReconciliationSearchParams(query);
  const page = Number(params.get("page") || 1);
  const pageSize = Number(params.get("pageSize") || 20);

  if (!token) {
    return {
      ...emptyFinanceReconciliation(page, pageSize),
      error: "缺少登录凭证",
    };
  }

  try {
    const response = await fetch(
      buildBackendUrl(`/finance/reconciliation/exceptions?${params}`),
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      },
    );
    const payload = await parseBackendJson<FinanceReconciliationListData>(
      response,
    );
    return {
      ...(payload.data || emptyFinanceReconciliation(page, pageSize)),
      error: null,
    };
  } catch (error) {
    return {
      ...emptyFinanceReconciliation(page, pageSize),
      error: error instanceof Error ? error.message : "对账异常加载失败",
    };
  }
}

export async function fetchFinanceReconciliationOperatingStats(query: {
  date_from?: string;
  date_to?: string;
  project_id?: string;
  exception_code?: string;
  level?: string;
  direction?: string;
  status?: string;
  actor_employee_id?: string;
}): Promise<FinanceReconciliationOperatingStatsResult> {
  const token = await getAdminToken();
  const params = buildFinanceReconciliationStatsSearchParams(query);
  const suffix = params.toString() ? `?${params}` : "";

  if (!token) {
    return {
      ...emptyFinanceReconciliationOperatingStats(),
      error: "缺少登录凭证",
    };
  }

  try {
    const response = await fetch(
      buildBackendUrl(`/finance/reconciliation/operating-stats${suffix}`),
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      },
    );
    const payload =
      await parseBackendJson<FinanceReconciliationOperatingStatsData>(
        response,
      );
    return {
      ...(payload.data || emptyFinanceReconciliationOperatingStats()),
      error: null,
    };
  } catch (error) {
    return {
      ...emptyFinanceReconciliationOperatingStats(),
      error: error instanceof Error ? error.message : "对账运营统计加载失败",
    };
  }
}

export async function fetchFinanceReconciliationEmployeeOptions(
  selectedEmployeeId?: string,
): Promise<FinanceReconciliationEmployeeOption[]> {
  const token = await getAdminToken();
  const fallbackOption = selectedEmployeeId
    ? [{
      value: selectedEmployeeId,
      label: `已选处理人 ${selectedEmployeeId.slice(0, 8)}`,
    }]
    : [];

  if (!token) {
    return [{ value: "", label: "全部处理人" }, ...fallbackOption];
  }

  try {
    const params = new URLSearchParams({
      page: "1",
      pageSize: "100",
      status: "active",
    });
    const response = await fetch(buildBackendUrl(`/employees?${params}`), {
      headers: {
        authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
    const payload = await parseBackendJson<EmployeeListData>(response);
    const options = (payload.data?.list || []).map((employee) => ({
      value: employee.id,
      label: employeeLabel(employee),
    }));
    if (
      selectedEmployeeId &&
      !options.some((option) => option.value === selectedEmployeeId)
    ) {
      const selectedOption = fallbackOption[0];
      if (selectedOption) options.push(selectedOption);
    }
    return [{ value: "", label: "全部处理人" }, ...options];
  } catch {
    return [{ value: "", label: "全部处理人" }, ...fallbackOption];
  }
}

function employeeLabel(employee: EmployeeOptionRow) {
  const title = employee.name || employee.phone || employee.id;
  const meta = [
    employee.department_name,
    employee.post_name,
    employee.phone && employee.phone !== title ? employee.phone : null,
  ].filter(Boolean).join(" · ");
  return meta ? `${title} (${meta})` : title;
}
