"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { requestBackendJson } from "@/lib/backend-client";

import {
  newIdempotencyKey,
  type PlatformSupplierDetailRecord,
} from "./platform-supplier-types";
import {
  availableLifecycleActions,
  isSupplierReadOnly,
  type LifecycleAction,
} from "./platform-supplier-rules";

const actionMeta: Record<
  LifecycleAction,
  {
    label: string;
    title: string;
    description: string;
    reasonRequired: boolean;
    destructive?: boolean;
  }
> = {
  submit: {
    label: "提交审核",
    title: "提交供应商审核",
    description: "提交后基本资料进入待审核状态。",
    reasonRequired: false,
  },
  approve: {
    label: "审核通过",
    title: "通过供应商审核",
    description: "通过后供应商取得平台准入资格。",
    reasonRequired: false,
  },
  reject: {
    label: "驳回申请",
    title: "驳回供应商申请",
    description: "请说明需要供应商补充或修改的内容。",
    reasonRequired: true,
    destructive: true,
  },
  suspend: {
    label: "暂停合作",
    title: "暂停供应商合作",
    description: "暂停后不能作为正常供应商开展新业务。",
    reasonRequired: true,
    destructive: true,
  },
  resume: {
    label: "恢复合作",
    title: "恢复供应商合作",
    description: "恢复后供应商重新进入正常运营状态。",
    reasonRequired: false,
  },
  blacklist: {
    label: "加入黑名单",
    title: "将供应商加入黑名单",
    description: "黑名单状态不可在当前流程中直接恢复，请谨慎操作。",
    reasonRequired: true,
    destructive: true,
  },
};

export function PlatformSupplierActions({
  supplier,
  canManage,
  canReview,
  canBlacklist,
  onChanged,
}: {
  supplier: PlatformSupplierDetailRecord;
  canManage: boolean;
  canReview: boolean;
  canBlacklist: boolean;
  onChanged: () => void;
}) {
  const router = useRouter();
  const [action, setAction] = useState<LifecycleAction | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState(false);
  const [pending, setPending] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const actions = availableLifecycleActions(supplier, {
    canManage,
    canReview,
    canBlacklist,
  });

  function openAction(nextAction: LifecycleAction) {
    setAction(nextAction);
    setReason("");
    setReasonError(false);
    setConflict(false);
    setIdempotencyKey(newIdempotencyKey(`supplier-${nextAction}`));
  }

  async function runAction(options?: { refreshVersion?: boolean }) {
    if (!action) return;
    const meta = actionMeta[action];
    if (meta.reasonRequired && !reason.trim()) {
      setReasonError(true);
      return;
    }
    setPending(true);
    setConflict(false);
    try {
      let expectedVersion = supplier.version;
      let requestKey = idempotencyKey;
      if (options?.refreshVersion) {
        const latest = await requestBackendJson<PlatformSupplierDetailRecord>(
          `/platform/suppliers/${supplier.id}`,
          { fallbackMessage: "刷新供应商版本失败" },
        );
        expectedVersion = latest.version;
        requestKey = newIdempotencyKey(`supplier-${action}-retry`);
        setIdempotencyKey(requestKey);
      }
      await requestBackendJson(`/platform/suppliers/${supplier.id}/${action}`, {
        method: "POST",
        headers: { "Idempotency-Key": requestKey },
        body: JSON.stringify({
          expected_version: expectedVersion,
          ...(reason.trim() ? { reason: reason.trim() } : {}),
        }),
        fallbackMessage: `${meta.label}失败`,
      });
      toast.success(`${meta.label}已完成`);
      setAction(null);
      router.refresh();
      onChanged();
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status === 409) {
        setConflict(true);
      } else {
        toast.error(error instanceof Error ? error.message : `${meta.label}失败`);
      }
    } finally {
      setPending(false);
    }
  }

  if (isSupplierReadOnly(supplier)) {
    return (
      <p className="text-sm text-muted-foreground">
        该供应商已加入黑名单，当前仅支持查看历史信息。
      </p>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
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
        {actions.length === 0 ? (
          <span className="text-sm text-muted-foreground">
            当前状态没有可执行操作
          </span>
        ) : null}
      </div>

      <Dialog
        open={action !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setAction(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {action ? actionMeta[action].title : "确认供应商操作"}
            </DialogTitle>
            <DialogDescription>
              {action ? actionMeta[action].description : ""}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field data-invalid={reasonError}>
              <FieldLabel htmlFor="supplier-action-reason">
                操作原因{action && actionMeta[action].reasonRequired ? "（必填）" : "（选填）"}
              </FieldLabel>
              <Textarea
                id="supplier-action-reason"
                value={reason}
                maxLength={500}
                rows={4}
                required={Boolean(action && actionMeta[action].reasonRequired)}
                aria-invalid={reasonError}
                placeholder="填写审核意见或状态变更原因"
                onChange={(event) => {
                  setReason(event.target.value);
                  if (event.target.value.trim()) setReasonError(false);
                }}
              />
              {reasonError ? (
                <FieldError>请填写操作原因后再提交。</FieldError>
              ) : null}
            </Field>
          </FieldGroup>
          {conflict ? (
            <Alert variant="destructive">
              <AlertTitle>数据版本已变化</AlertTitle>
              <AlertDescription className="flex flex-col gap-3">
                <p>其他人已更新该供应商，请刷新最新数据后确认是否重试。</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setAction(null);
                      router.refresh();
                      onChanged();
                    }}
                  >
                    刷新最新数据
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={pending}
                    onClick={() => void runAction({ refreshVersion: true })}
                  >
                    重试本次操作
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setAction(null)}
            >
              取消操作
            </Button>
            <Button
              type="button"
              variant={
                action && actionMeta[action].destructive
                  ? "destructive"
                  : "default"
              }
              disabled={pending || conflict}
              onClick={() => void runAction()}
            >
              {pending
                ? "正在提交"
                : action
                  ? actionMeta[action].label
                  : "确认操作"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
