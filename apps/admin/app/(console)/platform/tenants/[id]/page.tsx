import Link from "next/link";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { ArrowLeft, Building2, ClipboardList, ShieldCheck, UserRoundCog } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { TenantServiceAreaPanel } from "@/components/platform-tenants/tenant-service-area-panel";
import {
  getPlatformTenantStatusMeta,
  type PlatformTenantRecord,
  type PlatformTenantRoleLite,
  type TenantServiceAreaListData,
} from "@/components/platform-tenants/platform-tenant-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getAdminSession, getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

type RouteParams = Promise<{
  id: string;
}>;

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("zh-CN");
}

function text(value?: string | null) {
  return value && value.trim() ? value : "-";
}

async function getPlatformTenant(id: string) {
  const token = await getAdminToken();
  if (!token) {
    return {
      data: null,
      error: "缺少登录凭证",
    };
  }

  try {
    const response = await fetch(buildBackendUrl(`/platform/tenants/${id}`), {
      headers: {
        authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
    const payload = await parseBackendJson<PlatformTenantRecord>(response);
    return {
      data: payload.data ?? null,
      error: null,
    };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : "平台租户详情加载失败",
    };
  }
}

async function getTenantServiceAreas(tenantId: string) {
  const token = await getAdminToken();
  if (!token) {
    return {
      data: [],
      error: "缺少登录凭证",
    };
  }

  const query = new URLSearchParams({
    tenant_id: tenantId,
    page: "1",
    pageSize: "100",
  });

  try {
    const response = await fetch(buildBackendUrl(`/platform/tenant-service-areas?${query}`), {
      headers: {
        authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
    const payload = await parseBackendJson<TenantServiceAreaListData>(response);
    return {
      data: payload.data?.list ?? [],
      error: null,
    };
  } catch (error) {
    return {
      data: [],
      error: error instanceof Error ? error.message : "服务区域加载失败",
    };
  }
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 break-words text-sm font-medium">{value}</div>
    </div>
  );
}

function UsageCards({ tenant }: { tenant: PlatformTenantRecord }) {
  const usage = tenant.usage;
  const items = [
    ["员工", usage?.employee_count ?? 0],
    ["客户", usage?.customer_count ?? 0],
    ["项目", usage?.project_count ?? 0],
    ["H5 页面", usage?.h5_page_count ?? 0],
    ["摄像头", usage?.camera_count ?? 0],
  ];

  return (
    <div className="grid gap-3 md:grid-cols-5">
      {items.map(([label, value]) => (
        <Card key={label}>
          <CardHeader className="pb-2">
            <CardDescription>{label}</CardDescription>
            <CardTitle>{value}</CardTitle>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}

function RoleList({ roles }: { roles: PlatformTenantRoleLite[] }) {
  if (!roles.length) {
    return <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">暂无角色数据</div>;
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {roles.map((role) => (
        <div key={role.id} className="rounded-md border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-medium">{text(role.name)}</div>
            <Badge variant={role.status === "active" ? "success" : "secondary"}>
              {role.status === "active" ? "启用" : text(role.status)}
            </Badge>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">{text(role.code)}</div>
          {role.description ? (
            <div className="mt-2 text-sm text-muted-foreground">{role.description}</div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export default async function PlatformTenantDetailPage({
  params,
}: {
  params: RouteParams;
}) {
  const session = await getAdminSession();
  if (!session) {
    redirect("/login");
  }

  const { id } = await params;
  const hasPlatformAccess = session.roles.includes("platform_admin");
  const [{ data: tenant, error }, { data: serviceAreas, error: serviceAreaError }] =
    hasPlatformAccess
      ? await Promise.all([getPlatformTenant(id), getTenantServiceAreas(id)])
      : [
          { data: null, error: "当前账号不是平台超管，无法访问租户详情" },
          { data: [], error: null },
        ];
  const statusMeta = tenant ? getPlatformTenantStatusMeta(tenant.status) : null;
  const initialization = tenant?.initialization ?? null;
  const adminEmployee = initialization?.admin_employee ?? tenant?.admin_employees?.[0] ?? null;
  const adminRole = initialization?.admin_role ?? null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
        <div className="flex flex-col gap-3">
          <Button asChild variant="ghost" className="w-fit px-0">
            <Link href="/platform/tenants">
              <ArrowLeft data-icon="inline-start" />
              返回租户列表
            </Link>
          </Button>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-normal">
                {tenant?.name || "租户详情"}
              </h1>
              {statusMeta ? <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge> : null}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              查看租户基础信息、初始化结果、管理员和业务用量。
            </p>
          </div>
        </div>
      </div>

      {error ? <StatusAlert>{error}</StatusAlert> : null}

      {tenant ? (
        <>
          <UsageCards tenant={tenant} />

          <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-md bg-accent text-accent-foreground">
                    <Building2 />
                  </div>
                  <div>
                    <CardTitle>基础信息</CardTitle>
                    <CardDescription>租户标识和联系人信息</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2">
                <InfoRow label="租户 ID" value={tenant.id} />
                <InfoRow label="slug" value={tenant.slug} />
                <InfoRow label="公司地址" value={text(tenant.address)} />
                <InfoRow label="联系人" value={text(tenant.contact_name)} />
                <InfoRow label="联系电话" value={text(tenant.contact_phone)} />
                <InfoRow label="创建时间" value={formatDate(tenant.created_at)} />
                <InfoRow label="更新时间" value={formatDate(tenant.updated_at)} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-md bg-accent text-accent-foreground">
                    <UserRoundCog />
                  </div>
                  <div>
                    <CardTitle>租户管理员</CardTitle>
                    <CardDescription>初始化时创建或识别的管理员员工</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <InfoRow label="管理员姓名" value={text(adminEmployee?.name)} />
                <InfoRow label="管理员手机号" value={text(adminEmployee?.phone)} />
                <InfoRow label="管理员状态" value={text(adminEmployee?.status)} />
                <InfoRow label="管理员角色" value={text(adminRole?.name || adminRole?.code)} />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-md bg-accent text-accent-foreground">
                  <ClipboardList />
                </div>
                <div>
                  <CardTitle>初始化结果</CardTitle>
                  <CardDescription>租户模板版本、初始化数量和执行人</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {initialization ? (
                <>
                  <div className="grid gap-3 md:grid-cols-3">
                    <InfoRow label="模板编码" value={initialization.template_code} />
                    <InfoRow label="模板版本" value={initialization.template_version} />
                    <InfoRow label="应用时间" value={formatDate(initialization.applied_at)} />
                    <InfoRow label="部门数量" value={initialization.departments_count} />
                    <InfoRow label="岗位数量" value={initialization.posts_count} />
                    <InfoRow label="角色数量" value={initialization.roles_count} />
                  </div>
                  <Separator />
                  <div className="grid gap-3 md:grid-cols-2">
                    <InfoRow
                      label="执行人"
                      value={text(initialization.applied_by?.name || initialization.applied_by?.phone)}
                    />
                    <InfoRow label="管理员员工 ID" value={text(initialization.admin_employee_id)} />
                  </div>
                </>
              ) : (
                <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  暂无初始化记录。可能是历史租户，或模板应用记录未写入。
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-md bg-accent text-accent-foreground">
                  <ShieldCheck />
                </div>
                <div>
                  <CardTitle>租户角色</CardTitle>
                  <CardDescription>当前租户下的角色模板</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <RoleList roles={tenant.roles || []} />
            </CardContent>
          </Card>

          <TenantServiceAreaPanel
            tenantId={tenant.id}
            areas={serviceAreas}
            error={serviceAreaError}
          />
        </>
      ) : null}
    </div>
  );
}
