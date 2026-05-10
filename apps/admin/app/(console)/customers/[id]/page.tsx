import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2, CalendarClock, Phone, UserRound } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import type { CustomerRecord } from "@/components/customers/customer-mutations";
import { getTenantBusinessAccessDenied } from "@/components/layout/platform-mode-access-denied";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

type RouteParams = {
  id: string;
};

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function ownerName(customer: CustomerRecord) {
  const owner = relationOne(customer.owner);
  return customer.owner_name || owner?.name || owner?.phone || "-";
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function getCustomer(id: string) {
  const token = await getAdminToken();
  if (!token) {
    return {
      customer: null,
      error: "缺少登录凭证",
    };
  }

  try {
    const response = await fetch(buildBackendUrl(`/customers/${id}/detail`), {
      headers: {
        authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
    const payload = await parseBackendJson<CustomerRecord>(response);
    return {
      customer: payload.data || null,
      error: null,
    };
  } catch (error) {
    return {
      customer: null,
      error: error instanceof Error ? error.message : "客户详情加载失败",
    };
  }
}

function InfoItem({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 break-words text-sm font-medium">{value ?? "-"}</div>
    </div>
  );
}

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const accessDenied = await getTenantBusinessAccessDenied();
  if (accessDenied) return accessDenied;

  const { id } = await params;
  const { customer, error } = await getCustomer(id);

  if (!customer && !error) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Button asChild variant="ghost" className="mb-2 px-0">
          <Link href="/customers">
            <ArrowLeft data-icon="inline-start" />
            返回客户列表
          </Link>
        </Button>
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
          <div>
            <h1 className="text-2xl font-semibold tracking-normal">
              {customer?.name || "客户详情"}
            </h1>
            <p className="mt-1 break-all text-sm text-muted-foreground">{id}</p>
          </div>
          {customer?.status ? <Badge variant="outline">{customer.status}</Badge> : null}
        </div>
      </div>

      {error ? <StatusAlert>{error}</StatusAlert> : null}

      {customer ? (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <UserRound className="text-muted-foreground" />
                <div>
                  <div className="text-sm text-muted-foreground">负责人</div>
                  <div className="text-lg font-semibold">{ownerName(customer)}</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <Phone className="text-muted-foreground" />
                <div>
                  <div className="text-sm text-muted-foreground">手机号</div>
                  <div className="text-lg font-semibold">{customer.phone || customer.phone_masked || "-"}</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <Building2 className="text-muted-foreground" />
                <div>
                  <div className="text-sm text-muted-foreground">主小区</div>
                  <div className="text-lg font-semibold">{customer.community || "-"}</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <CalendarClock className="text-muted-foreground" />
                <div>
                  <div className="text-sm text-muted-foreground">下次跟进</div>
                  <div className="text-lg font-semibold">{formatDateTime(customer.next_follow_at)}</div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>基础信息</CardTitle>
              <CardDescription>客户来源、状态、房产和跟进摘要。</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-4">
              <InfoItem label="客户姓名" value={customer.name || "未命名客户"} />
              <InfoItem label="创建渠道" value={customer.customer_origin || "-"} />
              <InfoItem label="来源" value={customer.source || "-"} />
              <InfoItem label="创建时间" value={formatDateTime(customer.created_at)} />
              <InfoItem label="最近跟进" value={formatDateTime(customer.last_follow_at)} />
              <InfoItem label="跟进状态" value={customer.follow_up_state || "-"} />
              <InfoItem label="楼栋门牌" value={customer.building_info || "-"} />
              <InfoItem label="户型" value={customer.layout || "-"} />
              <InfoItem label="面积" value={customer.area != null ? `${customer.area}㎡` : "-"} />
              <InfoItem label="房产数量" value={customer.property_count ?? "-"} />
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
