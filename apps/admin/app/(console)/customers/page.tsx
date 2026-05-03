import { PhoneCall, UserRound, UsersRound } from "lucide-react";
import { CustomersClientShell } from "@/components/customers/customers-client-shell";
import {
  CreateCustomerButton,
  type CustomerRecord,
} from "@/components/customers/customer-mutations";
import { Card, CardContent } from "@/components/ui/card";
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
  source?: string;
  keyword?: string;
  follow?: string;
};

function normalizePage(value: string | undefined) {
  const page = Number(value || 1);
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
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
  const source = params.source?.trim() || "";
  const keyword = params.keyword?.trim() || "";
  const follow = params.follow?.trim() || "";
  const query = new URLSearchParams({
    page: String(page),
    pageSize: "20",
  });
  if (status) query.set("status", status);
  if (source) query.set("source", source);
  if (keyword) query.set("keyword", keyword);
  if (follow) query.set("follow", follow);

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
  const source = params.source?.trim() || "";
  const keyword = params.keyword?.trim() || "";
  const follow = params.follow?.trim() || "";
  const { list, pagination, error } = await getCustomers(params);
  const activeCount = list.filter((item) => item.status !== "invalid").length;
  const followingCount = list.filter((item) =>
    item.status === "following" || item.status === "arrived"
  ).length;
  const phoneVisibleCount = list.filter((item) => item.can_view_phone).length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">客户管理</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            客户资料、负责人、来源状态、主房产和跟进计划。当前筛选共 {pagination.total} 条记录。
          </p>
        </div>
        <CreateCustomerButton />
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-md bg-accent text-accent-foreground">
              <UsersRound className="size-5" />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">本页有效客户</div>
              <div className="text-xl font-semibold">{activeCount}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
              <UserRound className="size-5" />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">本页跟进/到店</div>
              <div className="text-xl font-semibold">{followingCount}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <PhoneCall className="size-5" />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">本页可见号码</div>
              <div className="text-xl font-semibold">{phoneVisibleCount}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <CustomersClientShell
        customers={list}
        pagination={pagination}
        status={status}
        source={source}
        keyword={keyword}
        follow={follow}
        error={error}
      />
    </div>
  );
}
