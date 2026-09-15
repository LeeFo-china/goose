import Link from "next/link";
import type { DouyinReleaseReadiness } from "@gooes/domain";
import { AppWindow, ArrowUpRight, ShieldAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  authorizationLabel,
  authorizationTone,
  profileStatusLabel,
  profileStatusTone,
  releaseAuditRejectionReason,
  releaseLabel,
  releaseTone,
} from "./workspace-display";
import { TenantDouyinMiniappWorkspaceActions } from "./workspace-actions";
import { TenantDouyinLeadCaptureConfig } from "./workspace-lead-capture-config";
import { ReleaseReadinessPanel } from "./release-readiness-panel";
import type { TenantDouyinWorkspace } from "./workspace-types";

type TenantDouyinMiniappWorkspaceProps = {
  canRead: boolean;
  canManage?: boolean;
  canPublish?: boolean;
  canSubmitAudit?: boolean;
  loadError: string | null;
  readiness?: DouyinReleaseReadiness | null;
  readinessLoadError?: string | null;
  workspace: TenantDouyinWorkspace | null;
};

export function TenantDouyinMiniappWorkspace({
  canRead,
  canManage = false,
  canPublish = false,
  canSubmitAudit = false,
  loadError,
  readiness = null,
  readinessLoadError = null,
  workspace,
}: TenantDouyinMiniappWorkspaceProps) {
  return (
    <main className="flex h-full min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-5 [scrollbar-gutter:stable] lg:p-6">
      <header className="mx-auto flex w-full max-w-5xl flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">抖音小程序</h1>
        <p className="text-sm text-muted-foreground">查看当前进度并完成下一步操作。</p>
      </header>

      {!canRead ? <PermissionEmpty /> : null}
      {canRead && loadError ? <LoadError message={loadError} /> : null}
      {canRead && !loadError && !workspace ? <MissingWorkspace /> : null}
      {canRead && !loadError && workspace ? (
        <WorkspaceOverview
          canManage={canManage}
          canPublish={canPublish}
          canSubmitAudit={canSubmitAudit}
          readiness={readiness}
          readinessLoadError={readinessLoadError}
          workspace={workspace}
        />
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
  canManage,
  canPublish,
  canSubmitAudit,
  readiness,
  readinessLoadError,
  workspace,
}: {
  canManage: boolean;
  canPublish: boolean;
  canSubmitAudit: boolean;
  readiness: DouyinReleaseReadiness | null;
  readinessLoadError: string | null;
  workspace: TenantDouyinWorkspace;
}) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col rounded-md bg-card px-5 sm:px-7">
      <section aria-labelledby="douyin-progress-heading" className="border-b py-6">
        <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div>
            <h2 id="douyin-progress-heading" className="text-base font-semibold">当前进度</h2>
            <p className="mt-1 text-sm text-muted-foreground">按当前版本状态完成体验、提审与发布。</p>
          </div>
          <div className="flex flex-wrap items-center gap-2" aria-label="小程序状态">
            <Badge variant={authorizationTone(workspace.authorization_state)}>
              {authorizationLabel(workspace.authorization_state)}
            </Badge>
            <Badge variant={releaseTone(workspace.release_state)}>
              {releaseLabel(workspace.release_state)}
            </Badge>
          </div>
        </div>
        <TenantDouyinMiniappWorkspaceActions
          canManage={canManage}
          canPublish={canPublish}
          canSubmitAudit={canSubmitAudit}
          readiness={readiness}
          readinessLoadError={readinessLoadError}
          workspace={workspace}
        />
        <TemplateAvailabilityNotice workspace={workspace} />
      </section>

      {readiness ? (
        <section className="border-b py-5">
          <ReleaseReadinessPanel readiness={readiness} />
        </section>
      ) : null}
      {readinessLoadError ? (
        <section className="border-b py-5">
          <Alert variant="destructive">
            <ShieldAlert aria-hidden="true" />
            <AlertTitle>提审就绪检查加载失败</AlertTitle>
            <AlertDescription>
              {readinessLoadError}。请刷新后重试；服务端仍会在提交审核前重新拦截。
            </AlertDescription>
          </Alert>
        </section>
      ) : null}
      <section className="border-b py-5" aria-labelledby="douyin-brand-heading">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="douyin-brand-heading" className="text-sm font-semibold">品牌与公开资料</h2>
            {workspace.public_profile ? (
              <Badge variant={profileStatusTone(workspace.public_profile.status)}>
                {profileStatusLabel(workspace.public_profile.status)}
              </Badge>
            ) : <Badge variant="secondary">公开资料未创建</Badge>}
          </div>
          <Button asChild size="sm" variant="ghost">
            <Link href="/settings/service-provider">维护公开资料<ArrowUpRight aria-hidden="true" /></Link>
          </Button>
        </div>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <IdentityField label="租户内部名称" value={workspace.tenant.name} />
          <IdentityField label="小程序公开品牌" value={workspace.public_profile?.public_name || "尚未设置"} />
        </dl>
        {workspace.public_profile?.introduction ? (
          <div className="mt-4">
            <p className="text-xs text-muted-foreground">公开简介</p>
            <p className="mt-1 break-words text-sm leading-6">{workspace.public_profile.introduction}</p>
          </div>
        ) : null}
      </section>

      <section className="border-b py-5" aria-labelledby="douyin-content-heading">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <h2 id="douyin-content-heading" className="text-sm font-semibold">小程序公开内容</h2>
          <Button asChild size="sm" variant="ghost">
            <Link href="/projects">管理项目内容<ArrowUpRight aria-hidden="true" /></Link>
          </Button>
        </div>
        <dl className="mt-4 grid gap-4 sm:grid-cols-3">
          <Metric label="精选案例" value={`${workspace.public_content.cases} 个`} />
          <Metric label="在建工地" value={`${workspace.public_content.sites} 个`} />
          <Metric label="有效服务区域" value={`${workspace.public_content.active_service_areas} 个`} />
        </dl>
      </section>

      <div className="border-b py-5">
        <TenantDouyinLeadCaptureConfig canManage={canManage} installation={workspace.installation} />
      </div>

      <ReleaseSummary workspace={workspace} />
    </div>
  );
}

function TemplateAvailabilityNotice({
  workspace,
}: {
  workspace: TenantDouyinWorkspace;
}) {
  const template = workspace.available_template;
  if (!template || template.state === "up_to_date" || template.state === "in_progress") return null;
  const auditInProgress = template.state === "new_available"
    && (workspace.latest_release?.status === "audit_pending"
      || workspace.latest_release?.status === "audit_approved");
  const content = template.state === "stale_version"
    ? {
      title: `当前可发布模板版本异常 ${template.version}`,
      description: "平台当前模板不是该租户的新版本，请先在平台确认新的抖音模板版本。",
      attention: true,
    }
    : auditInProgress
    ? {
      title: `另有可用新版 ${template.version}`,
      description: "当前版本正在审核或等待发布，完成后即可生成新版体验版。",
      attention: false,
    }
    : {
      title: `发现可用新版 ${template.version}`,
      description: `${template.description}。可生成体验版进行验收。`,
      attention: false,
    };
  return (
    <div className={`mt-5 border-l-2 pl-3 ${content.attention ? "border-destructive" : "border-primary/50"}`} role="status">
      <p className="text-sm font-medium">{content.title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{content.description}</p>
    </div>
  );
}

function IdentityField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium">{value}</dd>
    </div>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-base font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function ReleaseSummary({
  workspace,
}: {
  workspace: TenantDouyinWorkspace;
}) {
  const release = workspace.latest_release;
  const rejectionReason = release
    ? releaseAuditRejectionReason(release)
    : null;

  return (
    <section className="py-5" aria-labelledby="douyin-release-heading">
      <h2 id="douyin-release-heading" className="text-sm font-semibold">最近版本</h2>

      {release ? (
        <div className="mt-4 flex flex-col gap-3">
          <dl className="grid min-w-0 gap-4 sm:grid-cols-3">
            <ReleaseField label="模板版本" value={release.template_version} />
            <ReleaseField label="模板编号" value={release.template_id} />
            <ReleaseField
              label="最近更新"
              value={formatDateTime(release.updated_at)}
            />
          </dl>
          <p className="break-words text-sm text-muted-foreground">
            {release.description}
          </p>
          {rejectionReason ? (
            <Alert variant="destructive">
              <ShieldAlert aria-hidden="true" />
              <AlertTitle>审核驳回原因</AlertTitle>
              <AlertDescription className="whitespace-pre-wrap break-words">
                {rejectionReason}
              </AlertDescription>
            </Alert>
          ) : null}
        </div>
      ) : (
        <div className="mt-4">
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
