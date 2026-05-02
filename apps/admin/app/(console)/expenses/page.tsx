import { CircleDollarSign, Clock3, UserRound } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import {
  ExpenseFilters,
  ExpensesPagination,
} from "@/components/expenses/expense-list-actions";
import { type ExpenseRecord } from "@/components/expenses/expense-mutations";
import { ExpensesTable } from "@/components/expenses/expenses-table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
};

function normalizePage(value: string | undefined) {
  const page = Number(value || 1);
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
}

function formatMoney(value: number | string | null | undefined) {
  const amount = Number(value || 0);
  return amount.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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
  const query = new URLSearchParams({
    page: String(page),
    pageSize: "20",
  });
  if (status) query.set("status", status);
  if (mode) query.set("mode", mode);
  if (currentStep) query.set("current_step", currentStep);
  if (keyword) query.set("keyword", keyword);

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
  const params = await searchParams;
  const status = params.status?.trim() || "";
  const mode = params.mode?.trim() || "";
  const currentStep = params.current_step?.trim() || "";
  const keyword = params.keyword?.trim() || "";
  const [{ list, pagination, error }, session] = await Promise.all([
    getExpenses(params),
    getAdminSession(),
  ]);
  const currentEmployeeId = session?.employee?.id || null;
  const pendingCount = list.filter((item) => item.status === "pending").length;
  const paymentCount = list.filter((item) =>
    item.status === "approved" && item.current_step === "payment"
  ).length;
  const totalAmount = list.reduce((sum, item) => sum + Number(item.total_amount || 0), 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">费用审批</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            费用申请、审批链和打款处理。当前筛选共 {pagination.total} 条记录。
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-md bg-accent text-accent-foreground">
              <CircleDollarSign className="size-5" />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">本页金额</div>
              <div className="text-xl font-semibold">¥{formatMoney(totalAmount)}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
              <Clock3 className="size-5" />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">本页审批中</div>
              <div className="text-xl font-semibold">{pendingCount}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <UserRound className="size-5" />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">本页待打款</div>
              <div className="text-xl font-semibold">{paymentCount}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4">
          <ExpenseFilters
            status={status}
            mode={mode}
            currentStep={currentStep}
            keyword={keyword}
          />
        </CardContent>
      </Card>

      {error ? (
        <StatusAlert>{error}</StatusAlert>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
          <CardTitle>费用申请列表</CardTitle>
          <Badge variant="outline">
            第 {pagination.page} / {Math.max(pagination.totalPages, 1)} 页
          </Badge>
        </CardHeader>
        <CardContent className="p-0">
          <ExpensesTable expenses={list} currentEmployeeId={currentEmployeeId} />
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          每页 {pagination.pageSize} 条，共 {pagination.total} 条
        </div>
        <ExpensesPagination
          pagination={pagination}
          status={status}
          mode={mode}
          currentStep={currentStep}
          keyword={keyword}
        />
      </div>
    </div>
  );
}
