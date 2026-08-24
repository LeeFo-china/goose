"use client";

import Image from "next/image";
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
import type { TenantDouyinWorkspace } from "./workspace-types";

export type TenantDouyinWorkspaceAction =
  | "authorize"
  | "create_test_version"
  | "get_test_qr"
  | "submit_audit"
  | "sync_status"
  | "publish";

export type AuditChecklist = {
  authorizationActive: boolean;
  profilePublished: boolean;
  testQrReady: boolean;
  readinessReady: boolean;
  auditFieldsComplete: boolean;
};

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

export function availableWorkspaceActions(
  workspace: TenantDouyinWorkspace,
): TenantDouyinWorkspaceAction[] {
  if (workspace.authorization_state !== "active") return ["authorize"];

  const release = workspace.latest_release;
  const hasNewTemplate = workspace.available_template?.state === "new_available";
  const blocksNewTemplate = release?.status === "created"
    || release?.status === "uploaded"
    || release?.status === "testing"
    || release?.status === "audit_pending"
    || release?.status === "audit_approved";
  if (hasNewTemplate && !blocksNewTemplate) {
    if (release?.status === "audit_rejected" || release?.status === "failed") {
      return ["sync_status", "create_test_version"];
    }
    return ["create_test_version"];
  }
  if (!release) return [];

  switch (workspace.release_state) {
    case "uploaded":
      return ["get_test_qr"];
    case "testing":
      return isDouyinTestQrUrlUsable(release.test_qr_url)
        ? ["submit_audit"]
        : ["get_test_qr"];
    case "audit_pending":
      return ["sync_status"];
    case "audit_rejected":
      return isDouyinTestQrUrlUsable(release.test_qr_url)
        ? ["sync_status", "submit_audit"]
        : ["sync_status", "get_test_qr"];
    case "audit_approved":
      return ["publish"];
    case "sync_error":
      return ["sync_status"];
    case "created":
      return ["create_test_version"];
    case "not_uploaded":
    case "released":
      return [];
  }
}

export function canSubmitAudit(checklist: AuditChecklist) {
  return Object.values(checklist).every(Boolean);
}

export function parseAuditHostNames(value: string) {
  return Array.from(new Set(
    value
      .split(/[\n,，]/)
      .map((entry) => entry.trim())
      .filter(Boolean),
  ));
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
  const testQrUrl = isDouyinTestQrUrlUsable(release?.test_qr_url) ? release?.test_qr_url : null;
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

      {testQrUrl ? (
        <div className="flex flex-col gap-3 rounded-md border bg-background p-4 sm:flex-row sm:items-center">
          <Image
            alt="抖音小程序体验二维码"
            className="size-32 rounded-md border bg-card object-contain"
            height={128}
            src={testQrUrl}
            unoptimized
            width={128}
          />
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-sm font-semibold">体验二维码已就绪</p>
            <p className="text-xs leading-5 text-muted-foreground">
              请使用有体验权限的抖音账号扫码，确认品牌、案例、工地和咨询流程。
            </p>
          </div>
        </div>
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

function actionSummary(actions: TenantDouyinWorkspaceAction[]) {
  if (actions.includes("authorize")) return "连接租户自有抖音小程序";
  if (actions.includes("get_test_qr")) return "生成体验二维码并完成手机验收";
  if (actions.includes("submit_audit")) return "核对提审信息并提交平台审核";
  if (actions.includes("sync_status")) return "从抖音开放平台同步审核状态";
  if (actions.includes("publish")) return "审核已通过，可以正式发布";
  if (actions.includes("create_test_version")) return "生成体验版并完成验收";
  return "平台侧正在准备版本或当前版本已经发布";
}

function permissionForActions(
  actions: TenantDouyinWorkspaceAction[],
  canManage: boolean,
  canSubmitAuditPermission: boolean,
  canPublish: boolean,
) {
  if (actions.includes("submit_audit")) return canSubmitAuditPermission;
  if (actions.includes("publish")) return canPublish;
  return actions.length === 0 || canManage;
}
