import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  CalendarClock,
  Phone,
  UserRound,
} from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import {
  customerFollowUpStateMeta,
  customerOriginLabel,
  customerSourceLabel,
  customerStatusMeta,
} from "@/components/customers/customer-detail-display";
import type {
  CustomerRecord,
  PropertySummary,
} from "@/components/customers/customer-mutation-types";
import { getTenantBusinessAccessDenied } from "@/components/layout/platform-mode-access-denied";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

function primaryProperty(customer: CustomerRecord): PropertySummary | null {
  return customer.properties?.find((property) => property.is_primary)
    || customer.properties?.[0]
    || null;
}

function propertyText(customer: CustomerRecord) {
  const property = primaryProperty(customer);
  return [
    property?.community || customer.community,
    property?.building_info || customer.building_info,
  ].filter(Boolean).join("，") || "-";
}

function areaText(customer: CustomerRecord) {
  const property = primaryProperty(customer);
  const area = property?.area ?? customer.area;
  return area != null ? `${area}㎡` : "-";
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
  description,
}: {
  label: string;
  value: ReactNode;
  description?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-md border bg-background p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="min-w-0 break-words text-sm font-medium">{value || "-"}</div>
      {description ? (
        <div className="min-w-0 break-words text-xs text-muted-foreground">
          {description}
        </div>
      ) : null}
    </div>
  );
}

function SummaryMetric({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-md border bg-background p-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-1 min-w-0 truncate text-sm font-semibold">
          {value || "-"}
        </div>
      </div>
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

  const statusMeta = customerStatusMeta(customer?.status);
  const followUpMeta = customerFollowUpStateMeta(customer?.follow_up_state);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div className="min-w-0">
          <Button asChild variant="ghost" className="mb-2 px-0">
            <Link href="/customers">
              <ArrowLeft data-icon="inline-start" />
              返回客户列表
            </Link>
          </Button>
          <h1 className="text-xl font-semibold tracking-normal">
            {customer?.name || "客户详情"}
          </h1>
          <p className="mt-1 break-all text-sm text-muted-foreground">
            客户编号：{id}
          </p>
        </div>
        {customer ? (
          <Badge className="w-fit" variant={statusMeta.variant}>
            {statusMeta.label}
          </Badge>
        ) : null}
      </div>

      {error ? <StatusAlert>{error}</StatusAlert> : null}

      {customer ? (
        <>
          <Card className="shadow-none">
            <CardHeader className="border-b bg-muted/20">
              <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                <div>
                  <CardTitle>客户摘要</CardTitle>
                  <CardDescription>
                    集中查看客户身份、负责人、来源与跟进状态。
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
                  <Badge variant={followUpMeta.variant}>{followUpMeta.label}</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 p-5">
              <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
                    <UserRound className="size-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="break-words text-lg font-semibold">
                      {customer.name || "未命名客户"}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      <span>手机号：{customer.phone || customer.phone_masked || "-"}</span>
                      <span>负责人：{ownerName(customer)}</span>
                    </div>
                  </div>
                </div>
                <Button asChild variant="outline" size="sm" className="w-fit">
                  <Link href="/customers">
                    <ArrowLeft data-icon="inline-start" />
                    返回列表
                  </Link>
                </Button>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <SummaryMetric
                  icon={<UserRound className="size-4" />}
                  label="负责人"
                  value={ownerName(customer)}
                />
                <SummaryMetric
                  icon={<Phone className="size-4" />}
                  label="手机号"
                  value={customer.phone || customer.phone_masked || "-"}
                />
                <SummaryMetric
                  icon={<Building2 className="size-4" />}
                  label="主房产"
                  value={propertyText(customer)}
                />
                <SummaryMetric
                  icon={<CalendarClock className="size-4" />}
                  label="下次跟进"
                  value={formatDateTime(customer.next_follow_at)}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-none">
            <CardHeader>
              <CardTitle>资料与房产</CardTitle>
              <CardDescription>
                客户来源、创建渠道、跟进节奏和主房产信息。
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <InfoItem label="客户姓名" value={customer.name || "未命名客户"} />
              <InfoItem
                label="客户状态"
                value={<Badge variant={statusMeta?.variant}>{statusMeta?.label}</Badge>}
              />
              <InfoItem
                label="创建渠道"
                value={customerOriginLabel(customer.customer_origin)}
              />
              <InfoItem
                label="客户来源"
                value={customerSourceLabel(customer.source)}
              />
              <InfoItem
                label="跟进状态"
                value={<Badge variant={followUpMeta?.variant}>{followUpMeta?.label}</Badge>}
              />
              <InfoItem
                label="最近跟进"
                value={formatDateTime(customer.last_follow_at)}
              />
              <InfoItem
                label="创建时间"
                value={formatDateTime(customer.created_at)}
              />
              <InfoItem
                label="房产数量"
                value={`${customer.property_count ?? customer.properties?.length ?? 0} 套`}
              />
              <InfoItem
                label="主小区"
                value={primaryProperty(customer)?.community || customer.community || "-"}
              />
              <InfoItem
                label="楼栋门牌"
                value={primaryProperty(customer)?.building_info || customer.building_info || "-"}
              />
              <InfoItem
                label="户型"
                value={primaryProperty(customer)?.layout || customer.layout || "-"}
              />
              <InfoItem
                label="面积"
                value={areaText(customer)}
                description="按主房产优先展示"
              />
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
