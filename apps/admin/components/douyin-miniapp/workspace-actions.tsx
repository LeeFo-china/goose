"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { isDouyinTestQrUrlUsable } from "@gooes/domain";
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  QrCode,
  RefreshCw,
  Send,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { requestBackendJson } from "@/lib/backend-client";

import type { TenantDouyinWorkspace } from "./workspace-types";

export type TenantDouyinWorkspaceAction =
  | "authorize"
  | "get_test_qr"
  | "submit_audit"
  | "sync_status";

export type AuditChecklist = {
  authorizationActive: boolean;
  profilePublished: boolean;
  testQrReady: boolean;
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
  if (!release) return [];

  switch (workspace.release_state) {
    case "uploaded":
      return ["get_test_qr"];
    case "testing":
      return isDouyinTestQrUrlUsable(release.test_qr_url)
        ? ["submit_audit"]
        : ["get_test_qr"];
    case "audit_pending":
    case "audit_rejected":
    case "audit_approved":
    case "sync_error":
      return ["sync_status"];
    case "not_uploaded":
    case "created":
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
  canSubmitAudit: boolean;
  workspace: TenantDouyinWorkspace;
};

type Release = NonNullable<TenantDouyinWorkspace["latest_release"]>;

export function TenantDouyinMiniappWorkspaceActions({
  canManage,
  canSubmitAudit: canSubmitAuditPermission,
  workspace,
}: WorkspaceActionsProps) {
  const [release, setRelease] = useState(workspace.latest_release);
  const [pending, setPending] = useState<TenantDouyinWorkspaceAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [auditOpen, setAuditOpen] = useState(false);
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
    auditFieldsComplete,
  };
  const auditReady = canSubmitAudit(checklist);

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
    action: Exclude<TenantDouyinWorkspaceAction, "authorize">,
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
              生成体验二维码
            </Button>
          ) : null}
          {actions.includes("submit_audit") ? (
            <Button
              disabled={!canSubmitAuditPermission || pending !== null}
              onClick={() => setAuditOpen(true)}
              size="sm"
            >
              <Send data-icon="inline-start" />
              提交审核
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
        ) ? (
          <p className="text-xs text-muted-foreground">
            当前账号缺少执行该操作的权限，请联系租户管理员。
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

      <Dialog open={auditOpen} onOpenChange={setAuditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>提交抖音小程序审核</DialogTitle>
            <DialogDescription>
              填写审核宿主名称和版本说明，提交后可在工作台同步审核结果。
            </DialogDescription>
          </DialogHeader>

          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="douyin-audit-host-names">
                宿主名称
              </FieldLabel>
              <Input
                aria-invalid={hostNamesInput.length > 0 && hostNames.length === 0}
                id="douyin-audit-host-names"
                onChange={(event) => setHostNamesInput(event.target.value)}
                placeholder="douyin，可使用逗号或换行分隔"
                value={hostNamesInput}
              />
              <FieldDescription>
                最多 20 个，仅支持字母、数字、点和连字符。
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="douyin-audit-note">审核说明</FieldLabel>
              <Textarea
                id="douyin-audit-note"
                maxLength={1000}
                onChange={(event) => setAuditNote(event.target.value)}
                placeholder="说明本版本的品牌、案例、工地和咨询能力"
                value={auditNote}
              />
              <FieldDescription>
                {auditNote.trim().length}/1000 字符
              </FieldDescription>
            </Field>
          </FieldGroup>

          <div className="flex flex-col gap-2 rounded-md border bg-muted/20 p-3">
            <p className="text-sm font-semibold">提交前检查</p>
            <ChecklistItem
              complete={checklist.authorizationActive}
              label="租户小程序授权有效"
            />
            <ChecklistItem
              complete={checklist.profilePublished}
              label="公开资料已发布"
            />
            <ChecklistItem
              complete={checklist.testQrReady}
              label="体验二维码已生成"
            />
            <ChecklistItem
              complete={checklist.auditFieldsComplete}
              label="审核信息填写完整"
            />
          </div>

          <DialogFooter>
            <Button
              onClick={() => setAuditOpen(false)}
              type="button"
              variant="outline"
            >
              取消
            </Button>
            <Button
              disabled={
                !canSubmitAuditPermission
                || !auditReady
                || pending !== null
              }
              onClick={() =>
                mutateRelease(
                  "submit_audit",
                  `${releaseBasePath}/submit-audit`,
                  JSON.stringify({
                    host_names: hostNames,
                    audit_note: auditNote.trim(),
                  }),
                  "审核已提交",
                )}
              type="button"
            >
              {pending === "submit_audit"
                ? <Loader2 className="animate-spin" data-icon="inline-start" />
                : <Send data-icon="inline-start" />}
              确认提交
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ChecklistItem({
  complete,
  label,
}: {
  complete: boolean;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 text-xs">
      {complete
        ? <CheckCircle2 className="text-success" aria-hidden="true" />
        : <XCircle className="text-muted-foreground" aria-hidden="true" />}
      <span>{label}</span>
      <Badge variant={complete ? "success" : "secondary"}>
        {complete ? "已完成" : "待完成"}
      </Badge>
    </div>
  );
}

function actionSummary(actions: TenantDouyinWorkspaceAction[]) {
  if (actions.includes("authorize")) return "连接租户自有抖音小程序";
  if (actions.includes("get_test_qr")) return "生成体验二维码并完成手机验收";
  if (actions.includes("submit_audit")) return "核对提审信息并提交平台审核";
  if (actions.includes("sync_status")) return "从抖音开放平台同步审核状态";
  return "平台侧正在准备版本或当前版本已经发布";
}

function permissionForActions(
  actions: TenantDouyinWorkspaceAction[],
  canManage: boolean,
  canSubmitAuditPermission: boolean,
) {
  if (actions.includes("submit_audit")) return canSubmitAuditPermission;
  return actions.length === 0 || canManage;
}
