"use client";

import { useEffect, useState } from "react";
import { ConfirmActionDialog } from "@/components/admin/action-dialogs";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { WORKFLOW_VERSION_EFFECT_COPY } from "@/components/workflows/workflow-version-semantics";

export function WorkflowPublishConfirmDialog({
  open,
  onOpenChange,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  onConfirm: (versionLabel: string) => void;
}) {
  const [versionLabel, setVersionLabel] = useState("");

  useEffect(() => {
    if (!open) setVersionLabel("");
  }, [open]);

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) setVersionLabel("");
    onOpenChange(nextOpen);
  }

  return (
    <ConfirmActionDialog
      open={open}
      onOpenChange={handleOpenChange}
      title="发布新流程版本"
      description={WORKFLOW_VERSION_EFFECT_COPY.publishConfirm}
      confirmLabel="确认发布"
      pending={pending}
      onConfirm={() => onConfirm(versionLabel.trim())}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="workflow-version-label">版本标签</FieldLabel>
          <Input
            id="workflow-version-label"
            value={versionLabel}
            maxLength={80}
            placeholder="例如：开启水电验收"
            disabled={pending}
            onChange={(event) => setVersionLabel(event.target.value)}
          />
          <FieldDescription>
            用于区分发布记录，不影响已运行实例。
          </FieldDescription>
        </Field>
      </FieldGroup>
    </ConfirmActionDialog>
  );
}
