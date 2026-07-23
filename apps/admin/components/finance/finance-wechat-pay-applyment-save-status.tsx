"use client";

import { Check, CircleAlert, RotateCcw } from "lucide-react";

import { StatusAlert } from "@/components/admin/status-alert";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";

import type { ApplymentDraftSaveState } from "./finance-wechat-pay-applyment-autosave";
import {
  getWechatPayApplymentStatusMeta,
  type WechatPayApplymentRecord,
} from "./finance-wechat-pay-applyment-shared";

export function FinanceWechatPayApplymentSaveStatus({
  state,
  error,
  onRetry,
}: {
  state: ApplymentDraftSaveState;
  error: string;
  onRetry: () => void;
}) {
  if (state === "idle") return null;
  if (state === "saving") {
    return (
      <div
        role="status"
        className="flex items-center gap-2 text-sm text-muted-foreground"
      >
        <Spinner aria-label="保存中" />
        保存中
      </div>
    );
  }
  if (state === "saved") {
    return (
      <div
        role="status"
        className="flex items-center gap-2 text-sm text-muted-foreground"
      >
        <Check aria-hidden="true" />
        已自动保存
      </div>
    );
  }
  return (
    <Alert variant="destructive">
      <CircleAlert />
      <AlertTitle>保存失败</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
        <span>{error || "本地填写内容仍保留，请重试保存。"}</span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onRetry}
        >
          <RotateCcw data-icon="inline-start" />
          重试保存
        </Button>
      </AlertDescription>
    </Alert>
  );
}

export function FinanceWechatPayApplymentPanelStatus({
  applyment,
  saveState,
  saveError,
  error,
  stageError,
  materialsError,
  editable,
  onRetry,
}: {
  applyment: WechatPayApplymentRecord | null;
  saveState: ApplymentDraftSaveState;
  saveError: string;
  error: string;
  stageError: string;
  materialsError: string;
  editable: boolean;
  onRetry: () => void;
}) {
  const statusMeta = getWechatPayApplymentStatusMeta(applyment?.status);
  return (
    <>
      <FinanceWechatPayApplymentSaveStatus
        state={saveState}
        error={saveError}
        onRetry={onRetry}
      />
      {error ? <StatusAlert>{error}</StatusAlert> : null}
      {stageError ? <StatusAlert>{stageError}</StatusAlert> : null}
      {materialsError ? <StatusAlert>{materialsError}</StatusAlert> : null}
      {!editable ? (
        <StatusAlert tone="warning">
          当前账号无编辑权限，或申请已进入只读处理阶段。
        </StatusAlert>
      ) : null}
      {applyment?.rejected_reason ? (
        <StatusAlert tone="warning" title="驳回原因">
          {applyment.rejected_reason}
        </StatusAlert>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
        {applyment?.application_no
          ? <Badge variant="outline">{applyment.application_no}</Badge>
          : null}
        {applyment?.sub_mchid
          ? <Badge variant="outline">子商户 {applyment.sub_mchid}</Badge>
          : null}
        {applyment?.has_sensitive_payload
          ? <Badge variant="success">敏感资料已加密</Badge>
          : null}
      </div>
    </>
  );
}
