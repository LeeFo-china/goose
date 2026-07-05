import { getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";
import type {
  FinanceCorrectionAuditDomain,
  FinanceCorrectionAuditOperation,
} from "./finance-correction-audit-utils";
import { buildFinanceCorrectionAuditSearchParams } from "./finance-correction-audit-utils";

export type FinanceCorrectionAuditRecord = {
  id: string;
  operation: FinanceCorrectionAuditOperation;
  operation_label: string;
  domain: FinanceCorrectionAuditDomain;
  project_id: string | null;
  project_name: string | null;
  actor_employee_id: string | null;
  actor_employee_name: string | null;
  occurred_at: string;
  reason: string | null;
  amount: number | null;
  receivable_plan_id: string | null;
  allocation_id: string | null;
  payment_id: string | null;
  ledger_id: string | null;
  target: {
    label: string;
    href: string;
  };
};

export type FinanceCorrectionAuditListData = {
  list: FinanceCorrectionAuditRecord[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  summary: {
    total: number;
    ledger_repair: number;
    receivable_allocation: number;
  };
};

export type FinanceCorrectionAuditResult = FinanceCorrectionAuditListData & {
  error: string | null;
};

export type FinanceCorrectionAuditEmployeeOption = {
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

export function emptyFinanceCorrectionAuditResult(
  page = 1,
  pageSize = 20,
): FinanceCorrectionAuditResult {
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
      ledger_repair: 0,
      receivable_allocation: 0,
    },
    error: null,
  };
}

export async function fetchFinanceCorrectionAudits(query: {
  page?: number;
  pageSize?: number;
  month?: string;
  date_from?: string;
  date_to?: string;
  project_id?: string;
  operation?: string;
  actor_employee_id?: string;
}): Promise<FinanceCorrectionAuditResult> {
  const token = await getAdminToken();
  const params = buildFinanceCorrectionAuditSearchParams(query);
  const page = Number(params.get("page") || 1);
  const pageSize = Number(params.get("pageSize") || 20);

  if (!token) {
    return {
      ...emptyFinanceCorrectionAuditResult(page, pageSize),
      error: "缺少登录凭证",
    };
  }

  try {
    const response = await fetch(
      buildBackendUrl(`/finance/correction-audits?${params}`),
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      },
    );
    const payload = await parseBackendJson<FinanceCorrectionAuditListData>(
      response,
    );
    return {
      ...(payload.data || emptyFinanceCorrectionAuditResult(page, pageSize)),
      error: null,
    };
  } catch (error) {
    return {
      ...emptyFinanceCorrectionAuditResult(page, pageSize),
      error: error instanceof Error ? error.message : "修正审计加载失败",
    };
  }
}

export async function fetchFinanceCorrectionAuditEmployeeOptions(
  selectedEmployeeId?: string,
): Promise<FinanceCorrectionAuditEmployeeOption[]> {
  const token = await getAdminToken();
  const fallbackOption = selectedEmployeeId
    ? [{
      value: selectedEmployeeId,
      label: `已选操作人 ${selectedEmployeeId.slice(0, 8)}`,
    }]
    : [];

  if (!token) {
    return [{ value: "", label: "全部操作人" }, ...fallbackOption];
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
    return [{ value: "", label: "全部操作人" }, ...options];
  } catch {
    return [{ value: "", label: "全部操作人" }, ...fallbackOption];
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
