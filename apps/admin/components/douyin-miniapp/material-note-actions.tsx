"use client";

import { useState } from "react";
import type { DouyinMaterialNoteStatus } from "@gooes/domain";
import { Archive, Loader2, Send, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import {
  createMaterialNoteCommandRequest,
  executeMaterialNoteCommand,
  getMaterialNoteErrorMessage,
  type MaterialNoteCommandRequest,
} from "@/components/douyin-miniapp/material-note-api";
import {
  getMaterialNoteActions,
  type MaterialNoteAction,
} from "@/components/douyin-miniapp/material-note-contract";
import { StatusAlert } from "@/components/admin/status-alert";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const actionCopy: Record<MaterialNoteAction, {
  title: string;
  description: string;
  submit: string;
  success: string;
}> = {
  publish: {
    title: "发布当前内容",
    description: "发布后，新访客将看到并领取当前已保存内容；已领取资料仍保留领取时内容。",
    submit: "确认发布",
    success: "当前内容已发布",
  },
  archive: {
    title: "归档资料",
    description: "归档后资料不再公开且不能新增领取，已有领取仍可查看锁定版本。",
    submit: "确认归档",
    success: "资料已归档",
  },
  withdraw: {
    title: "永久撤回资料",
    description: "撤回后不能恢复，公开访问和已有领取都不能再读取正文。",
    submit: "确认永久撤回",
    success: "资料已永久撤回",
  },
};

export function MaterialNoteActions({
  noteId,
  status,
  versionId,
  canPublish,
  onCompleted,
}: {
  noteId: string;
  status: DouyinMaterialNoteStatus;
  versionId: string;
  canPublish: boolean;
  onCompleted: () => void;
}) {
  const actions = getMaterialNoteActions(status, canPublish);
  if (!canPublish) {
    return <p className="text-xs text-muted-foreground">
      发布、归档和撤回需要 douyin_material_note.publish 权限。
    </p>;
  }
  if (actions.length === 0) {
    return <p className="text-xs text-muted-foreground">已撤回资料为终态，没有可执行的状态操作。</p>;
  }
  return <div className="flex flex-wrap gap-2">{actions.map((action) => (
    <MaterialNoteActionDialog
      key={action}
      noteId={noteId}
      status={status}
      versionId={versionId}
      action={action}
      onCompleted={onCompleted}
    />
  ))}</div>;
}

export function MaterialNoteActionDialog({
  noteId,
  status,
  versionId,
  action,
  onCompleted,
  size,
  className,
}: {
  noteId: string;
  status: DouyinMaterialNoteStatus;
  versionId: string;
  action: MaterialNoteAction;
  onCompleted: () => void;
  size?: ButtonProps["size"];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [retryRequest, setRetryRequest] = useState<MaterialNoteCommandRequest | null>(null);
  const copy = actionCopy[action];
  const Icon = action === "publish" ? Send : action === "archive" ? Archive : ShieldAlert;

  function reset() {
    setReason("");
    setError("");
    setRetryRequest(null);
  }

  async function submit(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    let request = retryRequest;
    try {
      if (!request) {
        request = createMaterialNoteCommandRequest({
          noteId,
          action,
          expectedStatus: status,
          versionId: action === "publish" ? versionId : undefined,
          reason: action === "publish" ? undefined : reason,
        });
      }
    } catch (validationError) {
      setError(validationError instanceof Error
        ? validationError.message
        : action === "withdraw" ? "撤回原因不能为空" : "操作参数无效");
      return;
    }

    setPending(true);
    setError("");
    try {
      await executeMaterialNoteCommand(request);
      toast.success(copy.success);
      setRetryRequest(null);
      setOpen(false);
      onCompleted();
    } catch (commandError) {
      setRetryRequest(request);
      setError(getMaterialNoteErrorMessage(commandError, "资料状态更新失败"));
    } finally {
      setPending(false);
    }
  }

  const requiresReason = action !== "publish";
  return (
    <AlertDialog open={open} onOpenChange={(nextOpen) => {
      if (pending) return;
      setOpen(nextOpen);
      if (!nextOpen) reset();
    }}>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant={action === "publish" ? "default" : action === "withdraw" ? "destructive" : "outline"}
          size={size}
          className={className}
          onClick={() => reset()}
        ><Icon data-icon="inline-start" />{action === "publish" ? "发布当前内容" : action === "archive" ? "归档" : "永久撤回"}</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>{copy.title}</AlertDialogTitle>
          <AlertDialogDescription>{copy.description}</AlertDialogDescription>
        </AlertDialogHeader>
        {action === "publish" ? <p className="rounded-md bg-muted px-3 py-2 text-sm">
          本次发布会使用当前已保存内容。若刚修改过正文，请先保存修改再发布。
        </p> : null}
        {requiresReason ? <Field data-invalid={Boolean(error && !reason.trim())}>
          <FieldLabel htmlFor={`material-${action}-reason`}>{action === "withdraw" ? "撤回原因" : "归档原因"}</FieldLabel>
          <Textarea
            id={`material-${action}-reason`}
            rows={4}
            maxLength={1_000}
            value={reason}
            disabled={pending}
            required
            aria-required
            aria-invalid={Boolean(error && !reason.trim())}
            aria-describedby={`material-${action}-reason-error`}
            placeholder={action === "withdraw" ? "必填，请记录不可恢复撤回的合规原因" : "必填，请记录本次归档原因"}
            onChange={(event) => { setReason(event.target.value); setError(""); setRetryRequest(null); }}
          />
          <FieldDescription>{action === "withdraw" ? "撤回后不能恢复；需要重新提供时只能创建新资料。" : "归档后可在后续重新发布当前内容。"}</FieldDescription>
          {!reason.trim() && error ? <FieldError id={`material-${action}-reason-error`}>
            {action === "withdraw" ? "撤回原因不能为空" : "归档原因不能为空"}
          </FieldError> : null}
        </Field> : null}
        {error ? <StatusAlert>{error}{retryRequest ? "；重试会复用本次请求的幂等键。" : ""}</StatusAlert> : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>取消</AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              type="button"
              variant={action === "withdraw" ? "destructive" : "default"}
              disabled={pending || (requiresReason && !reason.trim())}
              onClick={submit}
            >{pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}{retryRequest ? `重试${copy.submit}` : copy.submit}</Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
