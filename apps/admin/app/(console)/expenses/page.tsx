import { CircleDollarSign, Clock3, ShieldAlert, UserRound } from "lucide-react";
import {
  ExpenseFilters,
  ExpensesPagination,
} from "@/components/expenses/expense-list-actions";
import {
  ExpenseRowActions,
  type ExpenseRecord,
} from "@/components/expenses/expense-mutations";
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

const statusMeta: Record<string, {
  label: string;
  variant: "success" | "warning" | "secondary" | "outline" | "danger" | "default";
}> = {
  draft: { label: "草稿", variant: "outline" },
  pending: { label: "审批中", variant: "warning" },
  approved: { label: "待打款", variant: "default" },
  rejected: { label: "已驳回", variant: "danger" },
  paid: { label: "已完成", variant: "success" },
  cancelled: { label: "已撤回", variant: "secondary" },
};

const modeMeta: Record<string, string> = {
  reimbursement: "员工报销",
  advance: "预借款",
  direct: "公司直付",
  petty_cash: "备用金",
};

const stepMeta: Record<string, string> = {
  draft: "草稿",
  manager_review: "待主管审核",
  finance_review: "待财务审核",
  payment: "待打款",
  done: "已完成",
  cancelled: "已作废",
};

function normalizePage(value: string | undefined) {
  const page = Number(value || 1);
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
}

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function formatMoney(value: number | string | null | undefined) {
  const amount = Number(value || 0);
  return amount.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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

function employeeName(expense: ExpenseRecord) {
  const employee = relationOne(expense.employee);
  return employee?.name || employee?.phone || "-";
}

function assigneeName(expense: ExpenseRecord) {
  const assignee = relationOne(expense.assignee);
  return assignee?.name || assignee?.phone || "-";
}

function projectName(expense: ExpenseRecord) {
  const project = relationOne(expense.project);
  return project?.name || "-";
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
    <div className="space-y-5">
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
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-accent text-accent-foreground">
              <CircleDollarSign className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">本页金额</div>
              <div className="text-xl font-semibold">¥{formatMoney(totalAmount)}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-amber-50 text-amber-700">
              <Clock3 className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">本页审批中</div>
              <div className="text-xl font-semibold">{pendingCount}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-emerald-50 text-emerald-700">
              <UserRound className="h-5 w-5" />
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
        <Card className="border-red-200 bg-red-50">
          <CardContent className="flex items-center gap-3 p-4 text-sm text-red-700">
            <ShieldAlert className="h-4 w-4" />
            {error}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle>费用申请列表</CardTitle>
          <Badge variant="outline">
            第 {pagination.page} / {Math.max(pagination.totalPages, 1)} 页
          </Badge>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1280px] border-t text-sm">
              <thead className="bg-muted/60 text-left text-xs font-medium text-muted-foreground">
                <tr>
                  <th className="px-5 py-3">申请</th>
                  <th className="px-5 py-3">申请人</th>
                  <th className="px-5 py-3">项目</th>
                  <th className="px-5 py-3">金额</th>
                  <th className="px-5 py-3">状态</th>
                  <th className="px-5 py-3">当前节点</th>
                  <th className="px-5 py-3">处理人</th>
                  <th className="px-5 py-3">创建时间</th>
                  <th className="px-5 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {list.length > 0 ? (
                  list.map((expense) => {
                    const meta = statusMeta[expense.status || ""] || {
                      label: expense.status || "未知",
                      variant: "outline" as const,
                    };

                    return (
                      <tr key={expense.id} className="border-t transition-colors hover:bg-muted/40">
                        <td className="px-5 py-4">
                          <div className="min-w-0">
                            <div className="truncate font-medium">
                              {expense.title || "未命名费用申请"}
                            </div>
                            <div className="truncate text-xs text-muted-foreground">
                              {expense.request_no || expense.id}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {modeMeta[expense.mode] || expense.mode}
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4">{employeeName(expense)}</td>
                        <td className="px-5 py-4 text-muted-foreground">{projectName(expense)}</td>
                        <td className="px-5 py-4 font-medium">¥{formatMoney(expense.total_amount)}</td>
                        <td className="px-5 py-4">
                          <Badge variant={meta.variant}>{meta.label}</Badge>
                        </td>
                        <td className="px-5 py-4 text-muted-foreground">
                          {stepMeta[expense.current_step] || expense.current_step || "-"}
                        </td>
                        <td className="px-5 py-4 text-muted-foreground">{assigneeName(expense)}</td>
                        <td className="px-5 py-4 text-muted-foreground">
                          {formatDate(expense.created_at)}
                        </td>
                        <td className="relative px-5 py-4">
                          <ExpenseRowActions
                            expense={expense}
                            currentEmployeeId={currentEmployeeId}
                          />
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td className="px-5 py-12 text-center text-muted-foreground" colSpan={9}>
                      没有符合条件的费用申请
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
