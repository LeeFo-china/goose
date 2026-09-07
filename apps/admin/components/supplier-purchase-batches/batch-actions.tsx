"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { StatusAlert } from "@/components/admin/status-alert";
import { useBatchCommand } from "./use-batch-command";
import type { BatchRevision } from "./batch-revision-notice";
import type {
  BatchCommandKind,
  BatchCommandResult,
  BatchDetail,
} from "./batch-types";

export type BatchActionChoice = {
  kind: Exclude<BatchCommandKind, "save-draft">;
  action?: "approve" | "reject";
  label: string;
  reasonRequired: boolean;
  disabled?: boolean;
  disabledReason?: string;
};
export function batchActionChoices(batch: BatchDetail): BatchActionChoice[] {
  const actions = batch.actions;
  if (!actions) return [];
  const choices: BatchActionChoice[] = [];
  if (actions.can_submit) {
    choices.push({ kind: "submit", label: "提交审批", reasonRequired: false });
  }
  if (actions.can_withdraw) {
    choices.push({ kind: "withdraw", label: "撤回", reasonRequired: false });
  }
  if (actions.can_cancel) {
    choices.push({ kind: "cancel", label: "取消批次", reasonRequired: true });
  }
  if (actions.can_review) {
    if (batch.workflow_state) {
      for (const action of batch.workflow_state.actions) {
        if (
          action.business_action !== "approve" &&
          action.business_action !== "reject"
        ) continue;
        choices.push({
          kind: "review",
          action: action.business_action,
          label: action.label,
          reasonRequired: action.requires_reason ||
            action.business_action === "reject",
          disabled: action.disabled,
          disabledReason: action.disabled_reason ?? action.blocked_reason,
        });
      }
    } else {
      // Legacy project approval is supported by the batch review API without workflow task metadata.
      choices.push({
        kind: "review",
        action: "approve",
        label: "批准",
        reasonRequired: false,
      }, {
        kind: "review",
        action: "reject",
        label: "驳回",
        reasonRequired: true,
      });
    }
  }
  return choices;
}
export function BatchActions(
  { batch, onAccepted, onRevision, onEdit }: {
    batch: BatchDetail;
    onAccepted: (result: BatchCommandResult) => void;
    onRevision: (revision: BatchRevision) => void;
    onEdit: () => void;
  },
) {
  const [choice, setChoice] = useState<BatchActionChoice | null>(null);
  const [reason, setReason] = useState("");
  const [validation, setValidation] = useState("");
  const command = useBatchCommand(batch.id, (result) => {
    setChoice(null);
    onAccepted(result);
  }, (id) => {
    setChoice(null);
    onRevision(id);
  });
  function confirm() {
    if (!choice || choice.disabled || command.busy || command.pending) return;
    if (choice.reasonRequired && !reason.trim()) {
      setValidation("请填写操作原因或审批意见");
      return;
    }
    const payload = {
      expected_version: batch.version,
      ...(choice.kind === "review"
        ? { action: choice.action, remark: reason.trim() || null }
        : choice.kind === "cancel" || choice.kind === "withdraw"
        ? { ...(reason.trim() ? { reason: reason.trim() } : {}) }
        : {}),
    };
    void command.execute(choice.kind, batch.id, payload, batch);
  }
  return (
    <div className="space-y-3">
      {command.error ? <StatusAlert>{command.error}</StatusAlert> : null}
      {command.pending
        ? (
          <StatusAlert tone="warning">
            {command.canRetry
              ? "上次操作的结果尚未确认。请重试原请求，避免重复操作。"
              : "旧请求仍保留，核查完成前不可发起新操作。"}
            <Button
              type="button"
              variant="outline"
              disabled={command.busy || !command.canRetry}
              onClick={command.retry}
            >
              使用原请求重试
            </Button>
          </StatusAlert>
        )
        : null}
      <div className="flex flex-wrap gap-2">
        {batch.actions?.can_edit
          ? (
            <Button
              type="button"
              variant="outline"
              disabled={!command.ready || command.busy ||
                Boolean(command.pending)}
              onClick={onEdit}
            >
              编辑草稿
            </Button>
          )
          : null}
        {batchActionChoices(batch).map((action) => (
          <Button
            key={`${action.kind}:${action.action ?? ""}`}
            type="button"
            variant={action.kind === "submit" || action.action === "approve"
              ? "default"
              : "outline"}
            disabled={!command.ready || command.busy ||
              Boolean(command.pending) || action.disabled}
            title={action.disabledReason}
            onClick={() => {
              setChoice(action);
              setReason("");
              setValidation("");
            }}
          >
            {action.label}
          </Button>
        ))}
      </div>
      <Dialog
        open={Boolean(choice)}
        onOpenChange={(open) => {
          if (!open && !command.busy) setChoice(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{choice?.label}采购批次</DialogTitle>
            <DialogDescription>
              {batch.batch_no}{" "}
              · 操作将由服务端校验当前版本、价格、预算与审批权限。
            </DialogDescription>
          </DialogHeader>
          {choice?.kind !== "submit"
            ? (
              <Field>
                <FieldLabel htmlFor="batch-action-reason">
                  {choice?.kind === "review" ? "审批意见" : "操作原因"}
                  {choice?.reasonRequired ? "（必填）" : "（选填）"}
                </FieldLabel>
                <Textarea
                  id="batch-action-reason"
                  value={reason}
                  disabled={command.busy || Boolean(command.pending)}
                  maxLength={500}
                  onChange={(event) => setReason(event.target.value)}
                />
              </Field>
            )
            : null}
          {validation ? <StatusAlert>{validation}</StatusAlert> : null}
          {command.error ? <StatusAlert>{command.error}</StatusAlert> : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={command.busy}
              onClick={() => setChoice(null)}
            >
              返回
            </Button>
            {command.pending
              ? (
                <Button
                  type="button"
                  disabled={command.busy || !command.canRetry}
                  onClick={command.retry}
                >
                  使用原请求重试
                </Button>
              )
              : (
                <Button type="button" disabled={command.busy} onClick={confirm}>
                  {command.busy
                    ? "正在处理…"
                    : `确认${choice?.label ?? "操作"}`}
                </Button>
              )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
