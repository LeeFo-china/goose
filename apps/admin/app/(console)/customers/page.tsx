import { PhoneCall, ShieldAlert, UserRound, UsersRound } from "lucide-react";
import {
  CustomerFilters,
  CustomersPagination,
} from "@/components/customers/customer-list-actions";
import {
  CreateCustomerButton,
  CustomerRowActions,
  type CustomerRecord,
} from "@/components/customers/customer-mutations";
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

type CustomerListData = {
  list: CustomerRecord[];
  pagination: Pagination;
};

type CustomerPageSearchParams = {
  page?: string;
  status?: string;
  keyword?: string;
};

const statusMeta: Record<string, {
  label: string;
  variant: "success" | "warning" | "secondary" | "outline" | "danger" | "default";
}> = {
  potential: { label: "潜在客户", variant: "outline" },
  following: { label: "跟进中", variant: "default" },
  arrived: { label: "已到店", variant: "warning" },
  ordered: { label: "已下定", variant: "success" },
  contracted: { label: "已签约", variant: "success" },
  dormant: { label: "沉睡客户", variant: "secondary" },
  invalid: { label: "无效客户", variant: "danger" },
};

const sourceMeta: Record<string, string> = {
  douyin: "抖音/短视频",
  referral: "老客介绍",
  walk_in: "自然进店",
  telemarketing: "电销开发",
  platform: "装修平台",
};

function normalizePage(value: string | undefined) {
  const page = Number(value || 1);
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
}

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function ownerName(customer: CustomerRecord) {
  const owner = relationOne(customer.owner);
  return customer.owner_name || owner?.name || owner?.phone || "-";
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

async function getCustomers(params: CustomerPageSearchParams) {
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
  const keyword = params.keyword?.trim() || "";
  const query = new URLSearchParams({
    page: String(page),
    pageSize: "20",
  });
  if (status) query.set("status", status);
  if (keyword) query.set("keyword", keyword);

  try {
    const response = await fetch(buildBackendUrl(`/customers?${query}`), {
      headers: {
        authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
    const payload = await parseBackendJson<CustomerListData>(response);
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
      error: error instanceof Error ? error.message : "客户列表加载失败",
    };
  }
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<CustomerPageSearchParams>;
}) {
  const params = await searchParams;
  const status = params.status?.trim() || "";
  const keyword = params.keyword?.trim() || "";
  const { list, pagination, error } = await getCustomers(params);
  const activeCount = list.filter((item) => item.status !== "invalid").length;
  const followingCount = list.filter((item) =>
    item.status === "following" || item.status === "arrived"
  ).length;
  const phoneVisibleCount = list.filter((item) => item.can_view_phone).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">客户管理</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            客户资料、负责人、来源状态、主房产和隐私号码权限。当前筛选共 {pagination.total} 条记录。
          </p>
        </div>
        <CreateCustomerButton />
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-accent text-accent-foreground">
              <UsersRound className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">本页有效客户</div>
              <div className="text-xl font-semibold">{activeCount}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-amber-50 text-amber-700">
              <UserRound className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">本页跟进/到店</div>
              <div className="text-xl font-semibold">{followingCount}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-emerald-50 text-emerald-700">
              <PhoneCall className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">本页可见号码</div>
              <div className="text-xl font-semibold">{phoneVisibleCount}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4">
          <CustomerFilters status={status} keyword={keyword} />
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
          <CardTitle>客户列表</CardTitle>
          <Badge variant="outline">
            第 {pagination.page} / {Math.max(pagination.totalPages, 1)} 页
          </Badge>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] border-t text-sm">
              <thead className="bg-muted/60 text-left text-xs font-medium text-muted-foreground">
                <tr>
                  <th className="px-5 py-3">客户</th>
                  <th className="px-5 py-3">手机号</th>
                  <th className="px-5 py-3">负责人</th>
                  <th className="px-5 py-3">来源</th>
                  <th className="px-5 py-3">状态</th>
                  <th className="px-5 py-3">号码权限</th>
                  <th className="px-5 py-3">创建时间</th>
                  <th className="px-5 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {list.length > 0 ? (
                  list.map((customer) => {
                    const meta = statusMeta[customer.status || ""] || {
                      label: customer.status || "未知",
                      variant: "outline" as const,
                    };

                    return (
                      <tr key={customer.id} className="border-t transition-colors hover:bg-muted/40">
                        <td className="px-5 py-4">
                          <div className="min-w-0">
                            <div className="truncate font-medium">
                              {customer.name || "未命名客户"}
                            </div>
                            <div className="truncate text-xs text-muted-foreground">
                              {customer.id}
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          {customer.phone || customer.phone_masked || "-"}
                        </td>
                        <td className="px-5 py-4 text-muted-foreground">
                          {ownerName(customer)}
                        </td>
                        <td className="px-5 py-4 text-muted-foreground">
                          {sourceMeta[customer.source || ""] || customer.source || "-"}
                        </td>
                        <td className="px-5 py-4">
                          <Badge variant={meta.variant}>{meta.label}</Badge>
                        </td>
                        <td className="px-5 py-4">
                          {customer.can_view_phone ? (
                            <Badge variant="success">可查看</Badge>
                          ) : (
                            <Badge variant="secondary">脱敏</Badge>
                          )}
                        </td>
                        <td className="px-5 py-4 text-muted-foreground">
                          {formatDate(customer.created_at)}
                        </td>
                        <td className="relative px-5 py-4">
                          <CustomerRowActions customer={customer} />
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td className="px-5 py-12 text-center text-muted-foreground" colSpan={8}>
                      没有符合条件的客户
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
        <CustomersPagination
          pagination={pagination}
          status={status}
          keyword={keyword}
        />
      </div>
    </div>
  );
}
