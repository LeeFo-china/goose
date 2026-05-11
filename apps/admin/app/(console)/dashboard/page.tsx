import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  BriefcaseBusiness,
  Building2,
  Camera,
  CircleDollarSign,
  ClipboardList,
  Inbox,
  KeyRound,
  Megaphone,
  ScrollText,
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

const platformCards = [
  {
    title: "平台租户",
    description: "租户、管理员、初始化状态",
    summary: "租户管理",
    status: "核心",
    href: "/platform/tenants",
    icon: Building2,
  },
  {
    title: "平台线索",
    description: "公海线索、租户分配、审计",
    summary: "线索分配",
    status: "核心",
    href: "/platform/leads",
    icon: Inbox,
  },
  {
    title: "H5 活动页",
    description: "活动配置、页面发布、线索承接",
    summary: "营销承接",
    status: "运营",
    href: "/platform/marketing-pages",
    icon: Megaphone,
  },
  {
    title: "用量统计",
    description: "平台、租户、AI 和短视频用量",
    summary: "成本核算",
    status: "财务",
    href: "/platform/usage",
    icon: BarChart3,
  },
  {
    title: "平台审计",
    description: "租户、线索、配置操作记录",
    summary: "操作追踪",
    status: "审计",
    href: "/platform/audit-logs",
    icon: ScrollText,
  },
  {
    title: "系统配置",
    description: "短信、AI、视频和平台参数",
    summary: "全局配置",
    status: "配置",
    href: "/settings",
    icon: Shield,
  },
];

const platformBoundaryRows = [
  {
    name: "租户管理",
    mode: "平台级列表和详情，不使用当前员工租户过滤。",
    href: "/platform/tenants",
    status: "已开放",
  },
  {
    name: "平台线索",
    mode: "先进入平台公海，再明确分配到目标租户。",
    href: "/platform/leads",
    status: "已开放",
  },
  {
    name: "用量统计",
    mode: "从平台维度查看租户消耗、AI 计费和短视频分钟数。",
    href: "/platform/usage",
    status: "已开放",
  },
];

const platformSummaryCards = [
  {
    label: "平台入口",
    value: `${platformCards.length} 个`,
    icon: Building2,
  },
  {
    label: "核心操作",
    value: "租户 / 线索",
    icon: Inbox,
  },
  {
    label: "用量核算",
    value: "AI / 短视频",
    icon: BarChart3,
  },
  {
    label: "审计配置",
    value: "审计 / 系统",
    icon: Shield,
  },
];

const scopeLabel: Record<AdminPermission["scope"], string> = {
  self: "本人",
  assigned: "负责范围",
  department: "部门",
  all: "全部",
};

const roleLabel: Record<string, string> = {
  platform_admin: "平台超管",
  system_admin: "系统管理员",
  tenant_admin: "租户管理员",
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

function getRoleLabel(role: string) {
  return roleLabel[role] || role;
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

function PlatformAdminDashboard({ session }: { session: NonNullable<Awaited<ReturnType<typeof getAdminSession>>> }) {
  const employee = session.employee;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">平台概览</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            管理平台租户、线索分配、用量成本、审计记录和全局配置，不自动进入装修公司业务视角。
          </p>
        </div>
        <Badge variant="outline">{getRoleLabel("platform_admin")}</Badge>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        {platformSummaryCards.map((item, index) => {
          const Icon = item.icon;

          return (
            <Card key={item.label}>
              <CardContent className="flex items-center gap-3 p-4">
                <div className={index === 0
                  ? "flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground"
                  : "flex size-10 items-center justify-center rounded-md bg-secondary text-secondary-foreground"}
                >
                  <Icon />
                </div>
                <div className="min-w-0">
                  <div className="text-sm text-muted-foreground">{item.label}</div>
                  <div className="truncate text-xl font-semibold">{item.value}</div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3">
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
            <div>
              <CardTitle>平台工作台</CardTitle>
              <CardDescription>
                常用平台级入口和处理边界，保持与用量统计页一致的表格化查看方式。
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{employee?.name || "平台管理员"}</Badge>
              <Badge variant="secondary">平台级</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table className="border-t">
            <TableHeader className="bg-muted/60">
              <TableRow className="hover:bg-transparent">
                <TableHead>入口</TableHead>
                <TableHead>处理内容</TableHead>
                <TableHead>定位</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {platformCards.map((item) => {
                const Icon = item.icon;

                return (
                  <TableRow key={item.href}>
                    <TableCell className="min-w-[180px]">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                          <Icon />
                        </div>
                        <div className="min-w-0">
                          <div className="truncate font-medium">{item.title}</div>
                          <div className="truncate text-xs text-muted-foreground">{item.summary}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="min-w-[260px] text-muted-foreground">
                      {item.description}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Badge variant="outline">{item.status}</Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Badge variant="success">已开放</Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      <Button asChild variant="outline" size="sm">
                        <Link href={item.href}>
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

      <div className="grid gap-5 xl:grid-cols-[1fr_300px]">
        <Card>
          <CardHeader>
            <CardTitle>平台操作边界</CardTitle>
            <CardDescription>平台超管默认处理平台数据，不默认代表某个装修公司。</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table className="border-t">
              <TableHeader className="bg-muted/60">
                <TableRow className="hover:bg-transparent">
                  <TableHead>场景</TableHead>
                  <TableHead>当前处理方式</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">入口</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {platformBoundaryRows.map((row) => (
                  <TableRow key={row.name}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="text-muted-foreground">{row.mode}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Badge variant="success">{row.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="ghost" size="sm">
                        <Link href={row.href}>
                          打开
                          <ArrowRight data-icon="inline-end" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell className="font-medium">租户业务数据</TableCell>
                  <TableCell className="text-muted-foreground">需要明确选择租户后进入，不在首页自动使用默认装修公司。</TableCell>
                  <TableCell className="whitespace-nowrap">
                    <Badge variant="secondary">待租户选择</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant="outline">无默认入口</Badge>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>登录身份</CardTitle>
            <CardDescription>用于后台登录和审计归因。</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {[
              ["员工", employee?.name || "-"],
              ["角色", session.roles.map(getRoleLabel).join(" / ") || "-"],
              ["用户编号", session.user_id || "-"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">{label}</div>
                <div className="mt-1 truncate text-sm font-medium">{value}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  const [session, permissionMetaMap] = await Promise.all([
    getAdminSession(),
    getPermissionMetaMap(),
  ]);

  if (session?.roles.includes("platform_admin")) {
    return <PlatformAdminDashboard session={session} />;
  }

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
      <div className="rounded-lg border border-black/10 bg-[#fffdf6] p-5 shadow-[0_12px_30px_rgba(17,17,17,0.08)]">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div className="flex items-start gap-4">
            <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full border-[3px] border-[#f3b400] bg-white">
              <img src="/logo.png" alt="鹅班长" className="size-11 object-contain" />
            </div>
            <div>
              <div className="text-sm font-bold text-[#4d3b00]">鹅班长工作台</div>
              <h1 className="mt-1 text-3xl font-extrabold tracking-normal text-[#141414] [text-shadow:0_3px_0_rgba(243,180,0,0.26)]">
                {employee?.name || "未命名员工"}，开始处理今日业务
              </h1>
              <p className="mt-2 text-sm text-[#4d3b00]">
                {employee?.department_name || "未分配部门"} · {employee?.post_name || "未分配岗位"}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-black/10 bg-white text-[#4d3b00]">
              {session?.login_channel || "admin_web"}
            </Badge>
            <Badge variant={employee?.status === "active" ? "success" : "secondary"}>
              {employeeStatus}
            </Badge>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-black/10 bg-white shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <span className="flex size-8 items-center justify-center rounded-md bg-[#ffd449] text-[#141414]">
                <BadgeCheck className="size-4" />
              </span>
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
        <Card className="border-black/10 bg-white shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <span className="flex size-8 items-center justify-center rounded-md bg-[#141414] text-[#ffd449]">
                <Shield className="size-4" />
              </span>
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
        <Card className="border-black/10 bg-white shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <span className="flex size-8 items-center justify-center rounded-md bg-[#fffbec] text-[#4d3b00] ring-1 ring-black/10">
                <KeyRound className="size-4" />
              </span>
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
        <Card className="border-black/10 bg-white shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <span className="flex size-8 items-center justify-center rounded-md bg-[#e9f5ed] text-[#3f6f4f]">
                <ClipboardList className="size-4" />
              </span>
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
        <Card className="border-black/10 bg-white shadow-none">
          <CardHeader>
            <CardTitle>业务模块</CardTitle>
            <CardDescription>按后端返回的权限编码展示当前账号可操作范围。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {moduleCards.map((item) => {
              const coverage = moduleCoverage(permissions, item.codes);
              const Icon = item.icon;

              return (
                <div key={item.title} className="rounded-lg border border-black/10 bg-[#fffdf6] p-4 transition-colors hover:bg-[#fff5cf]/65">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[#ffd449] text-[#141414]">
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
                    <Button asChild variant="outline" size="sm" className="border-black/10 bg-white text-[#4d3b00] hover:bg-[#141414] hover:text-[#ffd449]">
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

        <Card className="border-black/10 bg-white shadow-none">
          <CardHeader>
            <CardTitle>会话上下文</CardTitle>
            <CardDescription>当前 token 解出的员工和权限摘要。</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="rounded-lg border border-black/10 bg-[#fffdf6] p-3">
              <div className="text-xs text-muted-foreground">员工 ID</div>
              <div className="mt-1 truncate text-sm font-medium">{employee?.id || "-"}</div>
            </div>
            <div className="rounded-lg border border-black/10 bg-[#fffdf6] p-3">
              <div className="text-xs text-muted-foreground">用户 ID</div>
              <div className="mt-1 truncate text-sm font-medium">{session?.user_id || "-"}</div>
            </div>
            <div className="rounded-lg border border-black/10 bg-[#fffdf6] p-3">
              <div className="text-xs text-muted-foreground">过期时间</div>
              <div className="mt-1 truncate text-sm font-medium">{session?.expires_at || "后端未返回"}</div>
            </div>
          </CardContent>
          <CardFooter>
            <Button asChild variant="secondary" className="w-full bg-[#fff5cf] text-[#4d3b00] hover:bg-[#ffd449] hover:text-[#141414]">
              <Link href="/permissions">
                查看权限点
                <ArrowRight data-icon="inline-end" />
              </Link>
            </Button>
          </CardFooter>
        </Card>
      </div>

      <Card className="border-black/10 bg-white shadow-none">
        <CardHeader>
          <CardTitle>关键流程</CardTitle>
          <CardDescription>常用后台路径和当前账号是否具备对应入口权限。</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-[#fffbec]">
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
                      <Button asChild variant="ghost" size="sm" className="text-[#4d3b00] hover:bg-[#fff5cf] hover:text-[#141414]">
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

      <Card className="border-black/10 bg-white shadow-none">
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
                <div key={`${permission.code}-${permission.scope}`} className="rounded-lg border border-black/10 bg-[#fffdf6] p-3">
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
            <div className="rounded-lg border border-black/10 bg-[#fffdf6] p-4 text-sm text-muted-foreground">
              当前会话没有返回权限明细。
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
