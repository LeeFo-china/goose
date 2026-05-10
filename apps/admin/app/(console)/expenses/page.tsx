import { type ExpenseRecord } from "@/components/expenses/expense-mutations";
import { ExpensesPanel } from "@/components/expenses/expenses-panel";
import { getTenantBusinessAccessDenied } from "@/components/layout/platform-mode-access-denied";
import { getAdminSession, getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type ExpenseListData = {
  list: ExpenseRecord[];
  pagination: Pagination;
};

type ExpensePageSearchParams = {
  page?: string;
  status?: string;
  mode?: string;
  current_step?: string;
  keyword?: string;
  created_from?: string;
  created_to?: string;
};

function normalizePage(value: string | undefined) {
  const page = Number(value || 1);
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
}

function dateStartToIso(value: string) {
  if (!value) return "";
  if (value.includes("T")) return value;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function dateEndToIso(value: string) {
  if (!value) return "";
  if (value.includes("T")) return value;
  const date = new Date(`${value}T23:59:59.999`);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

async function getExpenses(params: ExpensePageSearchParams) {
  const token = await getAdminToken();
  if (!token) {
    return {
      list: [],
      pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      error: "缺少登录凭证",
    };
  }

  const page = normalizePage(params.page);
  const status = params.status?.trim() || "";
  const mode = params.mode?.trim() || "";
  const currentStep = params.current_step?.trim() || "";
  const keyword = params.keyword?.trim() || "";
  const createdFrom = params.created_from?.trim() || "";
  const createdTo = params.created_to?.trim() || "";
  const query = new URLSearchParams({
    page: String(page),
    pageSize: "20",
  });
  if (status) query.set("status", status);
  if (mode) query.set("mode", mode);
  if (currentStep) query.set("current_step", currentStep);
  if (keyword) query.set("keyword", keyword);
  if (createdFrom) query.set("created_from", dateStartToIso(createdFrom));
  if (createdTo) query.set("created_to", dateEndToIso(createdTo));

  try {
    const response = await fetch(buildBackendUrl(`/expense-requests?${query}`), {
      headers: {
        authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
    const payload = await parseBackendJson<ExpenseListData>(response);
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
      error: error instanceof Error ? error.message : "费用申请列表加载失败",
    };
  }
}

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<ExpensePageSearchParams>;
}) {
  const accessDenied = await getTenantBusinessAccessDenied();
  if (accessDenied) return accessDenied;

  const params = await searchParams;
  const status = params.status?.trim() || "";
  const mode = params.mode?.trim() || "";
  const currentStep = params.current_step?.trim() || "";
  const keyword = params.keyword?.trim() || "";
  const createdFrom = params.created_from?.trim() || "";
  const createdTo = params.created_to?.trim() || "";
  const [{ list, pagination, error }, session] = await Promise.all([
    getExpenses(params),
    getAdminSession(),
  ]);
  const currentEmployeeId = session?.employee?.id || null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">费用审批</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            费用申请、审批链和打款处理，筛选变化后列表会自动更新。
          </p>
        </div>
      </div>

      <ExpensesPanel
        initialData={{ list, pagination, error }}
        initialFilters={{
          status,
          mode,
          currentStep,
          keyword,
          createdFrom,
          createdTo,
        }}
        currentEmployeeId={currentEmployeeId}
      />
    </div>
  );
}
