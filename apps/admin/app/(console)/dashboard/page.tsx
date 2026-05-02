import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  BriefcaseBusiness,
  Camera,
  CircleDollarSign,
  ClipboardList,
  KeyRound,
  Shield,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getAdminSession, getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson, type AdminPermission } from "@/lib/backend";
import { isPermissionCode, PermissionCodeConfig } from "@gooes/domain";

const moduleCards = [
  {
    title: "客户管理",
    description: "客户档案、跟进状态、负责人和隐私号码权限。",
    href: "/customers",
    icon: Users,
    codes: ["customer.read", "customer.create", "customer.update", "customer.phone.view"],
  },
  {
    title: "项目管理",
    description: "项目档案、成员、预算、施工状态和业主侧展示。",
    href: "/projects",
    icon: BriefcaseBusiness,
    codes: ["project.read", "project.create", "project.update", "project.delete"],
  },
  {
    title: "费用审批",
    description: "费用申请、主管审批、财务审批和登记打款。",
    href: "/expenses",
    icon: CircleDollarSign,
    codes: [
      "expense_request.read",
      "expense_request.approve_manager",
      "expense_request.approve_finance",
      "expense_request.pay",
    ],
  },
  {
    title: "工地监控",
    description: "萤石设备、项目摄像头绑定和播放配置。",
    href: "/cameras",
    icon: Camera,
    codes: ["project.read"],
  },
];

const workflowRows = [
  {
    name: "新增客户到项目签约",
    owner: "销售 / 设计",
    entry: "/customers",
    permission: "customer.create",
  },
  {
    name: "项目资料维护",
    owner: "设计 / 工程",
    entry: "/projects",
    permission: "project.update",
  },
  {
    name: "费用审批流转",
    owner: "主管 / 财务",
    entry: "/expenses",
    permission: "expense_request.read",
  },
  {
    name: "摄像头项目绑定",
    owner: "管理员",
    entry: "/cameras",
    permission: "project.read",
  },
];

const scopeLabel: Record<AdminPermission["scope"], string> = {
  self: "本人",
  assigned: "负责范围",
  department: "部门",
  all: "全部",
};

type PermissionMeta = {
  code: string;
  name: string | null;
  description: string | null;
};

type PermissionMetaListData = {
  list: PermissionMeta[];
};

function hasPermission(permissions: AdminPermission[], code: string) {
  return permissions.some((item) => item.code === code);
}

function moduleCoverage(permissions: AdminPermission[], codes: string[]) {
  const granted = codes.filter((code) => hasPermission(permissions, code)).length;
  return {
    granted,
    total: codes.length,
    enabled: granted > 0,
  };
}

function employeeStatusLabel(status: string | null | undefined) {
  if (status === "active") return "在职";
  if (status === "pending") return "待入职";
  if (status === "suspended") return "已封禁";
  if (status === "leaved") return "已离职";
  return status || "未知";
}

async function getPermissionMetaMap() {
  const token = await getAdminToken();
  if (!token) {
    return new Map<string, PermissionMeta>();
  }

  try {
    const response = await fetch(
      buildBackendUrl("/permissions?page=1&pageSize=200&status=active"),
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      },
    );
    const payload = await parseBackendJson<PermissionMetaListData>(response);
    return new Map((payload.data?.list || []).map((item) => [item.code, item]));
  } catch {
    return new Map<string, PermissionMeta>();
  }
}

function getPermissionTitle(permission: AdminPermission, meta: PermissionMeta | undefined) {
  if (meta?.name && meta.name !== permission.code) return meta.name;
  if (meta?.description) return meta.description;
  if (isPermissionCode(permission.code)) {
    return PermissionCodeConfig[permission.code].label;
  }
  return permission.code;
}

function getPermissionDescription(permission: AdminPermission, meta: PermissionMeta | undefined) {
  if (
    meta?.description &&
    meta.description !== getPermissionTitle(permission, meta)
  ) {
    return meta.description;
  }
  return null;
}

export default async function DashboardPage() {
  const [session, permissionMetaMap] = await Promise.all([
    getAdminSession(),
    getPermissionMetaMap(),
  ]);
  const permissions = session?.permissions || [];
  const employee = session?.employee;
  const allScopeCount = permissions.filter((item) => item.scope === "all").length;
  const enabledModules = moduleCards.filter((item) =>
    moduleCoverage(permissions, item.codes).enabled,
  ).length;
  const employeeStatus = employeeStatusLabel(employee?.status);
  const topPermissions = permissions.slice(0, 6);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">后台概览</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {employee?.name || "未命名员工"} · {employee?.department_name || "未分配部门"} · {employee?.post_name || "未分配岗位"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{session?.login_channel || "admin_web"}</Badge>
          <Badge variant={employee?.status === "active" ? "success" : "secondary"}>
            {employeeStatus}
          </Badge>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <BadgeCheck className="size-4 text-primary" />
              员工状态
            </CardTitle>
            <CardDescription>后台登录身份</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{employeeStatus}</div>
            <p className="mt-1 text-sm text-muted-foreground">
              {employee?.phone || "未返回手机号"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Shield className="size-4 text-primary" />
              角色数量
            </CardTitle>
            <CardDescription>来自权限上下文</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{session?.roles.length || 0}</div>
            <p className="mt-1 text-sm text-muted-foreground">
              {session?.roles.slice(0, 2).join(" / ") || "未分配角色"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <KeyRound className="size-4 text-primary" />
              有效权限
            </CardTitle>
            <CardDescription>按钮和数据范围控制</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{permissions.length}</div>
            <p className="mt-1 text-sm text-muted-foreground">
              全局权限 {allScopeCount} 项
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <ClipboardList className="size-4 text-primary" />
              可访问模块
            </CardTitle>
            <CardDescription>按当前权限计算</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              {enabledModules}/{moduleCards.length}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              模块入口自动按权限开放
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <CardTitle>业务模块</CardTitle>
            <CardDescription>按后端返回的权限编码展示当前账号可操作范围。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {moduleCards.map((item) => {
              const coverage = moduleCoverage(permissions, item.codes);
              const Icon = item.icon;

              return (
                <div key={item.title} className="rounded-md border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
                        <Icon className="size-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate font-medium">{item.title}</div>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">
                          {item.description}
                        </p>
                      </div>
                    </div>
                    <Badge variant={coverage.enabled ? "success" : "secondary"}>
                      {coverage.granted}/{coverage.total}
                    </Badge>
                  </div>
                  <Separator className="my-4" />
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-muted-foreground">
                      {coverage.enabled ? "已有访问权限" : "暂无匹配权限"}
                    </span>
                    <Button asChild variant="outline" size="sm">
                      <Link href={item.href}>
                        进入
                        <ArrowRight data-icon="inline-end" />
                      </Link>
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>会话上下文</CardTitle>
            <CardDescription>当前 token 解出的员工和权限摘要。</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">员工 ID</div>
              <div className="mt-1 truncate text-sm font-medium">{employee?.id || "-"}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">用户 ID</div>
              <div className="mt-1 truncate text-sm font-medium">{session?.user_id || "-"}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">过期时间</div>
              <div className="mt-1 truncate text-sm font-medium">{session?.expires_at || "后端未返回"}</div>
            </div>
          </CardContent>
          <CardFooter>
            <Button asChild variant="secondary" className="w-full">
              <Link href="/permissions">
                查看权限点
                <ArrowRight data-icon="inline-end" />
              </Link>
            </Button>
          </CardFooter>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>关键流程</CardTitle>
          <CardDescription>常用后台路径和当前账号是否具备对应入口权限。</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/60">
              <TableRow>
                <TableHead>流程</TableHead>
                <TableHead>责任角色</TableHead>
                <TableHead>权限编码</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">入口</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workflowRows.map((row) => {
                const enabled = hasPermission(permissions, row.permission);

                return (
                  <TableRow key={row.name}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="text-muted-foreground">{row.owner}</TableCell>
                    <TableCell className="text-muted-foreground">{row.permission}</TableCell>
                    <TableCell>
                      <Badge variant={enabled ? "success" : "secondary"}>
                        {enabled ? "已开放" : "无权限"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="ghost" size="sm">
                        <Link href={row.entry}>
                          打开
                          <ArrowRight data-icon="inline-end" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>权限明细</CardTitle>
          <CardDescription>展示当前会话的前 6 项权限，完整列表请进入权限点页面。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {topPermissions.length > 0 ? (
            topPermissions.map((permission) => {
              const meta = permissionMetaMap.get(permission.code);
              const title = getPermissionTitle(permission, meta);
              const description = getPermissionDescription(permission, meta);

              return (
                <div key={`${permission.code}-${permission.scope}`} className="rounded-md border p-3">
                  <div className="min-w-0">
                    <div className="break-words text-sm font-medium">{title}</div>
                    {description ? (
                      <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">
                        {description}
                      </p>
                    ) : null}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{scopeLabel[permission.scope] || permission.scope}</Badge>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="rounded-md border p-4 text-sm text-muted-foreground">
              当前会话没有返回权限明细。
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
