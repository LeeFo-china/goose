import Link from "next/link";
import {
  AppWindow,
  ArrowUpRight,
  BriefcaseBusiness,
  Building2,
  Construction,
  MapPin,
  ShieldAlert,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Separator } from "@/components/ui/separator";

import {
  authorizationLabel,
  authorizationTone,
  releaseLabel,
  releaseTone,
  workspaceNextAction,
} from "./workspace-display";
import type { TenantDouyinWorkspace } from "./workspace-types";

type TenantDouyinMiniappWorkspaceProps = {
  canRead: boolean;
  loadError: string | null;
  workspace: TenantDouyinWorkspace | null;
};

export function TenantDouyinMiniappWorkspace({
  canRead,
  loadError,
  workspace,
}: TenantDouyinMiniappWorkspaceProps) {
  return (
    <main className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-5 lg:p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">抖音小程序</h1>
        <p className="text-sm text-muted-foreground">
          查看租户品牌、公开内容、授权状态与版本进度。
        </p>
      </header>

      {!canRead ? <PermissionEmpty /> : null}
      {canRead && loadError ? <LoadError message={loadError} /> : null}
      {canRead && !loadError && !workspace ? <MissingWorkspace /> : null}
      {canRead && !loadError && workspace ? (
        <WorkspaceOverview workspace={workspace} />
      ) : null}
    </main>
  );
}

function PermissionEmpty() {
  return (
    <Card>
      <CardContent className="p-0">
        <Empty className="min-h-72">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ShieldAlert aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>无权访问抖音小程序工作台</EmptyTitle>
            <EmptyDescription>
              当前账号缺少抖音小程序查看权限，请联系租户管理员调整角色权限。
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </CardContent>
    </Card>
  );
}

function LoadError({ message }: { message: string }) {
  return (
    <Alert variant="destructive">
      <ShieldAlert aria-hidden="true" />
      <AlertTitle>工作台加载失败</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

function MissingWorkspace() {
  return (
    <Card>
      <CardContent className="p-0">
        <Empty className="min-h-72">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <AppWindow aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>暂未获取到工作台数据</EmptyTitle>
            <EmptyDescription>
              请刷新页面重试；若持续出现，请联系平台管理员检查租户配置。
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </CardContent>
    </Card>
  );
}

function WorkspaceOverview({
  workspace,
}: {
  workspace: TenantDouyinWorkspace;
}) {
  const nextAction = workspaceNextAction({
    authorizationState: workspace.authorization_state,
    releaseState: workspace.release_state,
  });

  return (
    <Card className="overflow-hidden">
      <CardHeader className="gap-4 border-b bg-muted/20">
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
          <div className="flex min-w-0 flex-col gap-1.5">
            <CardTitle>运营状态总览</CardTitle>
            <CardDescription>
              当前页面仅提供只读状态，授权与版本操作将在下一阶段开放。
            </CardDescription>
          </div>
          <div
            className="flex flex-wrap items-center gap-2"
            aria-label="小程序状态"
          >
            <Badge variant={authorizationTone(workspace.authorization_state)}>
              {authorizationLabel(workspace.authorization_state)}
            </Badge>
            <Badge variant={releaseTone(workspace.release_state)}>
              {releaseLabel(workspace.release_state)}
            </Badge>
          </div>
        </div>

        <div className="flex flex-col gap-2 rounded-md border bg-background p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">
              当前建议动作
            </p>
            <p className="mt-1 truncate text-sm font-semibold">{nextAction}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge variant="outline">下一阶段开放</Badge>
            <Button disabled size="sm">
              {nextAction}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-6 pt-5">
        <section
          className="flex flex-col gap-4"
          aria-labelledby="douyin-brand-heading"
        >
          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
            <div>
              <h2
                id="douyin-brand-heading"
                className="text-sm font-semibold"
              >
                品牌与公开资料
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                内部租户名称用于后台识别，公开品牌展示给小程序访客。
              </p>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href="/settings/service-provider">
                维护公开资料
                <ArrowUpRight aria-hidden="true" />
              </Link>
            </Button>
          </div>

          <dl className="grid gap-4 sm:grid-cols-2">
            <IdentityField
              icon={Building2}
              label="租户内部名称"
              value={workspace.tenant.name}
            />
            <IdentityField
              icon={AppWindow}
              label="小程序公开品牌"
              value={workspace.public_profile?.public_name || "尚未设置"}
            />
          </dl>

          {workspace.public_profile?.introduction ? (
            <div className="rounded-md border bg-muted/20 px-4 py-3">
              <p className="text-xs font-medium text-muted-foreground">
                公开简介
              </p>
              <p className="mt-1 break-words text-sm leading-6">
                {workspace.public_profile.introduction}
              </p>
            </div>
          ) : null}
        </section>

        <Separator />

        <section
          className="flex flex-col gap-4"
          aria-labelledby="douyin-content-heading"
        >
          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
            <div>
              <h2
                id="douyin-content-heading"
                className="text-sm font-semibold"
              >
                小程序公开内容
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                统计当前符合公开条件的案例、在建工地与服务区域。
              </p>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href="/projects">
                管理项目内容
                <ArrowUpRight aria-hidden="true" />
              </Link>
            </Button>
          </div>

          <dl className="grid gap-px overflow-hidden rounded-md border bg-border sm:grid-cols-3">
            <Metric
              icon={BriefcaseBusiness}
              label="精选案例"
              value={`${workspace.public_content.cases} 个`}
            />
            <Metric
              icon={Construction}
              label="在建工地"
              value={`${workspace.public_content.sites} 个`}
            />
            <Metric
              icon={MapPin}
              label="有效服务区域"
              value={`${workspace.public_content.active_service_areas} 个`}
            />
          </dl>
        </section>

        <Separator />

        <ReleaseSummary workspace={workspace} />
      </CardContent>
    </Card>
  );
}

function IdentityField({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 gap-3 rounded-md border px-4 py-3">
      <Icon
        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      <div className="min-w-0">
        <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
        <dd className="mt-1 break-words text-sm font-medium">{value}</dd>
      </div>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 bg-background px-4 py-4">
      <Icon
        className="size-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="mt-1 text-base font-semibold tabular-nums">{value}</dd>
      </div>
    </div>
  );
}

function ReleaseSummary({
  workspace,
}: {
  workspace: TenantDouyinWorkspace;
}) {
  const release = workspace.latest_release;

  return (
    <section
      className="flex flex-col gap-4"
      aria-labelledby="douyin-release-heading"
    >
      <div>
        <h2 id="douyin-release-heading" className="text-sm font-semibold">
          最近版本
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          展示最近一次模板上传与审核进度。
        </p>
      </div>

      {release ? (
        <div className="grid gap-4 rounded-md border px-4 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <dl className="grid min-w-0 gap-4 sm:grid-cols-3">
            <ReleaseField label="模板版本" value={release.template_version} />
            <ReleaseField label="模板编号" value={release.template_id} />
            <ReleaseField
              label="最近更新"
              value={formatDateTime(release.updated_at)}
            />
          </dl>
          <Badge variant={releaseTone(workspace.release_state)}>
            {releaseLabel(workspace.release_state)}
          </Badge>
          <p className="break-words text-sm text-muted-foreground sm:col-span-3 md:col-span-1">
            {release.description}
          </p>
        </div>
      ) : (
        <div className="rounded-md border border-dashed px-4 py-5">
          <p className="text-sm font-medium">尚未上传小程序版本</p>
          <p className="mt-1 text-xs text-muted-foreground">
            完成授权后，可由平台代开发并上传租户专属版本。
          </p>
        </div>
      )}
    </section>
  );
}

function ReleaseField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 truncate text-sm font-medium">{value}</dd>
    </div>
  );
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间待同步";
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Shanghai",
  }).format(date);
}
