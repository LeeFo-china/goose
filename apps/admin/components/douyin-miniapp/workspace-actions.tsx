"use client";

import { useMemo, useState } from "react";
import {
  isDouyinTestQrUrlUsable,
  type DouyinReleaseReadiness,
} from "@gooes/domain";
import {
  ExternalLink,
  Loader2,
  QrCode,
  RefreshCw,
  Rocket,
  Send,
  ShieldAlert,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requestBackendJson } from "@/lib/backend-client";

import { WorkspaceReleaseDialogs } from "./workspace-release-dialogs";
import {
  actionSummary,
  availableWorkspaceActions,
  canSubmitAudit,
  parseAuditHostNames,
  permissionForActions,
  type AuditChecklist,
  type TenantDouyinWorkspaceAction,
} from "./workspace-action-policy";
import { ReleaseQrCard } from "./workspace-qr-card";
import type { TenantDouyinWorkspace } from "./workspace-types";

export {
  availableWorkspaceActions,
  canSubmitAudit,
  parseAuditHostNames,
  type AuditChecklist,
  type TenantDouyinWorkspaceAction,
} from "./workspace-action-policy";

type AuthorizationPopup = {
  close(): void;
  location: {
    replace(url: string): void;
  };
};

export async function startAuthorizationFlow(input: {
  openPopup(): AuthorizationPopup | null;
  requestLink(): Promise<{ link: string }>;
}) {
  const popup = input.openPopup();
  if (!popup) {
    throw Object.assign(
      new Error("浏览器阻止了授权窗口，请允许弹出窗口后重试。"),
      { code: "DOUYIN_AUTHORIZATION_POPUP_BLOCKED" },
    );
  }

  try {
    const result = await input.requestLink();
    const url = new URL(result.link);
    if (
      url.protocol !== "https:"
      || url.username
      || url.password
    ) {
      throw new Error("抖音授权地址无效，请稍后重试。");
    }
    popup.location.replace(url.toString());
    return result;
  } catch (error) {
    popup.close();
    throw error;
  }
}

type WorkspaceActionsProps = {
  canManage: boolean;
  canPublish: boolean;
  canSubmitAudit: boolean;
  readiness?: DouyinReleaseReadiness | null;
  readinessLoadError?: string | null;
  workspace: TenantDouyinWorkspace;
};

type Release = NonNullable<TenantDouyinWorkspace["latest_release"]>;

export function TenantDouyinMiniappWorkspaceActions({
  canManage,
  canPublish,
  canSubmitAudit: canSubmitAuditPermission,
  readiness = null,
  readinessLoadError = null,
  workspace,
}: WorkspaceActionsProps) {
  const [release, setRelease] = useState(workspace.latest_release);
  const [pending, setPending] = useState<TenantDouyinWorkspaceAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [auditOpen, setAuditOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [hostNamesInput, setHostNamesInput] = useState(
    workspace.latest_release?.audit_host_names?.join("\n") || "",
  );
  const [auditNote, setAuditNote] = useState(
    workspace.latest_release?.audit_note || "",
  );

  const effectiveWorkspace = {
    ...workspace,
    latest_release: release,
    release_state: release
      ? release.status === "failed" ? "sync_error" : release.status
      : workspace.release_state,
  } as TenantDouyinWorkspace;
  const actions = availableWorkspaceActions(effectiveWorkspace);
  const hostNames = useMemo(
    () => parseAuditHostNames(hostNamesInput),
    [hostNamesInput],
  );
  const auditFieldsComplete = hostNames.length > 0
    && hostNames.length <= 20
    && hostNames.every((host) =>
      host.length <= 253 && /^[A-Za-z0-9.-]+$/.test(host)
    )
    && auditNote.trim().length > 0
    && auditNote.trim().length <= 1000;
  const latestTestQrRaw = release?.latest_test_qr_url ?? release?.test_qr_url ?? null;
  const testQrUrl = isDouyinTestQrUrlUsable(latestTestQrRaw) ? latestTestQrRaw : null;
  const testQrExpired = Boolean(latestTestQrRaw && !testQrUrl);
  const auditQrRaw = release?.audit_qr_url ?? null;
  const auditQrUrl = isDouyinTestQrUrlUsable(auditQrRaw) ? auditQrRaw : null;
  const auditQrExpired = Boolean(auditQrRaw && !auditQrUrl);
  const checklist: AuditChecklist = {
    authorizationActive: workspace.authorization_state === "active",
    profilePublished: workspace.public_profile?.status === "published",
    testQrReady: Boolean(testQrUrl),
    readinessReady: readiness?.ready ?? !readinessLoadError,
    auditFieldsComplete,
  };
  const auditReady = canSubmitAudit(checklist);
  const readinessBlockedMessage = readiness && !readiness.ready
    ? `当前仍有 ${readiness.blockers.length} 项提审阻断`
    : readinessLoadError
    ? "提审就绪检查暂不可用"
    : null;

  async function handleAuthorization() {
    setError(null);
    setPending("authorize");
    try {
      await startAuthorizationFlow({
        openPopup: () => {
          const popup = window.open("about:blank", "_blank");
          if (popup) popup.opener = null;
          return popup;
        },
        requestLink: () =>
          requestBackendJson<{ link: string }>(
            "/tenant/douyin-miniapp/authorization-link",
            {
              method: "POST",
              body: "{}",
              fallbackMessage: "抖音授权地址生成失败",
            },
          ),
      });
      toast.success("授权窗口已打开，请在抖音完成授权");
    } catch (actionError) {
      setError(actionError instanceof Error
        ? actionError.message
        : "抖音授权地址生成失败");
    } finally {
      setPending(null);
    }
  }

  async function mutateRelease(
    action: Exclude<
      TenantDouyinWorkspaceAction,
      "authorize" | "create_test_version"
    >,
    path: string,
    body: string,
    successMessage: string,
  ) {
    if (!release) return;
    setError(null);
    setPending(action);
    try {
      const nextRelease = await requestBackendJson<Release>(path, {
        method: "POST",
        body,
        fallbackMessage: `${successMessage}失败`,
      });
      setRelease(nextRelease);
      if (action === "submit_audit") setAuditOpen(false);
      toast.success(successMessage);
      window.setTimeout(() => window.location.reload(), 300);
    } catch (actionError) {
      setError(actionError instanceof Error
        ? actionError.message
        : `${successMessage}失败`);
    } finally {
      setPending(null);
    }
  }

  async function createTestVersion() {
    setError(null);
    setPending("create_test_version");
    try {
      const nextRelease = await requestBackendJson<Release>(
        "/tenant/douyin-miniapp/releases/from-current-template",
        {
          method: "POST",
          body: "{}",
          fallbackMessage: "生成体验版失败",
        },
      );
      setRelease(nextRelease);
      toast.success("体验版已生成");
      window.setTimeout(() => window.location.reload(), 300);
    } catch (actionError) {
      setError(actionError instanceof Error
        ? actionError.message
        : "生成体验版失败");
    } finally {
      setPending(null);
    }
  }

  const releaseBasePath = release
    ? `/tenant/douyin-miniapp/releases/${release.id}`
    : "";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">
            当前可执行操作
          </p>
          <p className="mt-1 text-sm font-semibold">
            {actionSummary(actions)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {actions.includes("authorize") ? (
            <Button
              disabled={!canManage || pending !== null}
              onClick={handleAuthorization}
              size="sm"
            >
              {pending === "authorize"
                ? <Loader2 className="animate-spin" data-icon="inline-start" />
                : <ExternalLink data-icon="inline-start" />}
              授权抖音小程序
            </Button>
          ) : null}
          {actions.includes("create_test_version") ? (
            <Button
              disabled={!canManage || pending !== null}
              onClick={createTestVersion}
              size="sm"
            >
              {pending === "create_test_version"
                ? <Loader2 className="animate-spin" data-icon="inline-start" />
                : <UploadCloud data-icon="inline-start" />}
              {release?.status === "created" ? "继续生成体验版" : "生成新版体验版"}
            </Button>
          ) : null}
          {actions.includes("get_test_qr") ? (
            <Button
              disabled={!canManage || pending !== null}
              onClick={() =>
                mutateRelease(
                  "get_test_qr",
                  `${releaseBasePath}/test-qr`,
                  "{}",
                  "体验二维码已生成",
                )}
              size="sm"
            >
              {pending === "get_test_qr"
                ? <Loader2 className="animate-spin" data-icon="inline-start" />
                : <QrCode data-icon="inline-start" />}
              {release?.status === "audit_rejected"
                ? "重新获取体验二维码"
                : "生成体验二维码"}
            </Button>
          ) : null}
          {actions.includes("get_audit_qr") ? (
            <Button
              disabled={!canManage || pending !== null}
              onClick={() =>
                mutateRelease(
                  "get_audit_qr",
                  `${releaseBasePath}/audit-qr`,
                  "{}",
                  "审核版二维码已生成",
                )}
              size="sm"
              variant="outline"
            >
              {pending === "get_audit_qr"
                ? <Loader2 className="animate-spin" data-icon="inline-start" />
                : <QrCode data-icon="inline-start" />}
              获取审核版二维码
            </Button>
          ) : null}
          {actions.includes("submit_audit") ? (
            <Button
              disabled={
                !canSubmitAuditPermission
                || pending !== null
                || Boolean(readinessBlockedMessage)
              }
              onClick={() => setAuditOpen(true)}
              size="sm"
            >
              <Send data-icon="inline-start" />
              {release?.status === "audit_rejected" ? "再次提交审核" : "提交审核"}
            </Button>
          ) : null}
          {actions.includes("sync_status") ? (
            <Button
              disabled={!canManage || pending !== null}
              onClick={() =>
                mutateRelease(
                  "sync_status",
                  `${releaseBasePath}/sync-status`,
                  "{}",
                  "审核状态已同步",
                )}
              size="sm"
              variant="outline"
            >
              {pending === "sync_status"
                ? <Loader2 className="animate-spin" data-icon="inline-start" />
                : <RefreshCw data-icon="inline-start" />}
              同步审核状态
            </Button>
          ) : null}
          {actions.includes("publish") ? (
            <Button
              disabled={!canPublish || pending !== null}
              onClick={() => setPublishOpen(true)}
              size="sm"
            >
              <Rocket data-icon="inline-start" />
              正式发布
            </Button>
          ) : null}
          {actions.length === 0 ? (
            <Badge variant="outline">当前无需租户操作</Badge>
          ) : null}
        </div>
      </div>

      {pending === "sync_status" ? (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          正在同步，页面继续显示上一次可信状态。
        </p>
      ) : null}

      {actions.length > 0
        && !permissionForActions(
          actions,
          canManage,
          canSubmitAuditPermission,
          canPublish,
        ) ? (
          <p className="text-xs text-muted-foreground">
            当前账号缺少执行该操作的权限，请联系租户管理员。
          </p>
        ) : null}

      {readinessBlockedMessage ? (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {readinessBlockedMessage}
        </p>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <ShieldAlert aria-hidden="true" />
          <AlertTitle>操作未完成</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {testQrUrl || testQrExpired ? (
        <ReleaseQrCard
          description="请使用有体验权限的抖音账号扫码，确认品牌、案例、工地和咨询流程。"
          expired={testQrExpired}
          imageAlt="抖音小程序测试版二维码"
          title="测试版二维码"
          url={testQrUrl}
        />
      ) : null}

      {auditQrUrl || auditQrExpired ? (
        <ReleaseQrCard
          description="提审后用于核对审核版内容。二维码过期时可重新获取，不影响已提交审核。"
          expired={auditQrExpired}
          imageAlt="抖音小程序审核版二维码"
          title="审核版二维码"
          url={auditQrUrl}
        />
      ) : null}

      <WorkspaceReleaseDialogs
        auditNote={auditNote}
        auditOpen={auditOpen}
        auditReady={auditReady}
        canPublish={canPublish}
        canSubmitAudit={canSubmitAuditPermission}
        checklist={checklist}
        hostNames={hostNames}
        hostNamesInput={hostNamesInput}
        mutateRelease={mutateRelease}
        onAuditNoteChange={setAuditNote}
        onAuditOpenChange={setAuditOpen}
        onHostNamesInputChange={setHostNamesInput}
        onPublishOpenChange={setPublishOpen}
        pending={pending}
        publishOpen={publishOpen}
        release={release}
        releaseBasePath={releaseBasePath}
      />
    </div>
  );
}
