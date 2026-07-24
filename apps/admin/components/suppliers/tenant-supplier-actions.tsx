"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { requestBackendJson } from "@/lib/backend-client";

import { isRelationshipReadOnly } from "./supplier-workspace-rules";
import {
  newIdempotencyKey,
  type TenantSupplierRelationship,
} from "./supplier-types";

type Action = "activate" | "suspend" | "terminate" | "blacklist";

const actionMeta: Record<Action, {
  label: string;
  title: string;
  description: string;
  reasonRequired: boolean;
  destructive?: boolean;
}> = {
  activate: {
    label: "启用合作",
    title: "启用供应商合作",
    description: "启用后仍需满足平台准入、资质和合同策略才能创建新订单。",
    reasonRequired: false,
  },
  suspend: {
    label: "暂停合作",
    title: "暂停供应商合作",
    description: "暂停后不能创建新订单，历史合同与记录继续保留。",
    reasonRequired: true,
    destructive: true,
  },
  terminate: {
    label: "终止合作",
    title: "终止供应商合作",
    description: "终止是业务结束状态，请确认现有合同和账务已妥善处理。",
    reasonRequired: true,
    destructive: true,
  },
  blacklist: {
    label: "加入租户黑名单",
    title: "加入租户黑名单",
    description: "仅影响当前租户，不改变平台供应商的全局状态。",
    reasonRequired: true,
    destructive: true,
  },
};

function availableActions(relationship: TenantSupplierRelationship): Action[] {
  if (isRelationshipReadOnly(relationship.relationship_status)) return [];
  if (relationship.relationship_status === "evaluating") return ["activate", "blacklist"];
  if (relationship.relationship_status === "active") {
    return ["suspend", "terminate", "blacklist"];
  }
  if (relationship.relationship_status === "suspended") {
    return ["activate", "terminate", "blacklist"];
  }
  return [];
}

export function TenantSupplierActions({
  relationship,
  canManage,
  onChanged,
  loadLatest,
}: {
  relationship: TenantSupplierRelationship;
  canManage: boolean;
  onChanged: () => void;
  loadLatest: () => Promise<TenantSupplierRelationship | null>;
}) {
  const [action, setAction] = useState<Action | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState(false);
  const [pending, setPending] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const actions = canManage ? availableActions(relationship) : [];

  function openAction(nextAction: Action) {
    setAction(nextAction);
    setReason("");
    setReasonError(false);
    setConflict(false);
    setIdempotencyKey(newIdempotencyKey(`tenant-supplier-${nextAction}`));
  }

  async function submitAction(retry = false) {
    if (!action) return;
    const meta = actionMeta[action];
    if (meta.reasonRequired && !reason.trim()) {
      setReasonError(true);
      return;
    }
    setPending(true);
    setConflict(false);
    try {
      const latest = retry ? await loadLatest() : relationship;
      if (!latest) return;
      const key = retry
        ? newIdempotencyKey(`tenant-supplier-${action}-retry`)
        : idempotencyKey;
      if (retry) setIdempotencyKey(key);
      await requestBackendJson(`/suppliers/${relationship.id}/${action}`, {
        method: "POST",
        headers: { "Idempotency-Key": key },
        body: JSON.stringify({
          expected_version: latest.version,
          ...(reason.trim() ? { reason: reason.trim() } : {}),
        }),
        fallbackMessage: `${meta.label}失败`,
      });
      toast.success(`${meta.label}已完成`);
      setAction(null);
      onChanged();
    } catch (error) {
      if ((error as { status?: number }).status === 409) {
        setConflict(true);
      } else {
        toast.error(error instanceof Error ? error.message : `${meta.label}失败`);
      }
    } finally {
      setPending(false);
    }
  }

  if (!canManage) {
    return <p className="text-sm text-muted-foreground">当前账号仅可查看合作关系。</p>;
  }
  if (isRelationshipReadOnly(relationship.relationship_status)) {
    return (
      <p className="text-sm text-muted-foreground">
        该合作关系已终止或加入租户黑名单，当前仅可查看历史资料。
      </p>
    );
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {actions.map((item) => (
          <Button
            key={item}
            type="button"
            size="sm"
            variant={actionMeta[item].destructive ? "destructive" : "outline"}
            onClick={() => openAction(item)}
          >
            {actionMeta[item].label}
          </Button>
        ))}
      </div>
      <Dialog
        open={action !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !pending) setAction(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{action ? actionMeta[action].title : "确认操作"}</DialogTitle>
            <DialogDescription>
              {action ? actionMeta[action].description : ""}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field data-invalid={reasonError}>
              <FieldLabel htmlFor="tenant-supplier-action-reason">
                操作原因{action && actionMeta[action].reasonRequired ? "（必填）" : "（选填）"}
              </FieldLabel>
              <Textarea
                id="tenant-supplier-action-reason"
                value={reason}
                maxLength={500}
                rows={4}
                aria-invalid={reasonError}
                onChange={(event) => {
                  setReason(event.target.value);
                  if (event.target.value.trim()) setReasonError(false);
                }}
              />
              {reasonError ? <FieldError>请填写操作原因。</FieldError> : null}
            </Field>
          </FieldGroup>
          {conflict ? (
            <Alert variant="destructive">
              <AlertTitle>数据版本已变化</AlertTitle>
              <AlertDescription className="flex flex-col gap-3">
                <p>其他人已更新这条合作关系，请刷新最新数据后再确认。</p>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => void loadLatest()}>
                    刷新最新数据
                  </Button>
                  <Button type="button" size="sm" disabled={pending} onClick={() => void submitAction(true)}>
                    重试本次操作
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={() => setAction(null)}>
              取消
            </Button>
            <Button
              type="button"
              variant={action && actionMeta[action].destructive ? "destructive" : "default"}
              disabled={pending}
              onClick={() => void submitAction()}
            >
              {pending ? "正在提交" : action ? actionMeta[action].label : "确认"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
