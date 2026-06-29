import { getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";
import { buildFinanceReconciliationSearchParams } from "./finance-reconciliation-utils";

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

export type FinanceReconciliationResult = FinanceReconciliationListData & {
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
