"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { AcceptanceDialogState } from "@/components/projects/project-acceptance-types";

export function AcceptanceActionDialog({
  state,
  error,
  loading,
  onOpenChange,
  onCommentChange,
  onConfirm,
}: {
  state: AcceptanceDialogState;
  error: string;
  loading: boolean;
  onOpenChange: (open: boolean) => void;
  onCommentChange: (comment: string) => void;
  onConfirm: () => void;
}) {
  const isOpen = Boolean(state);
  const isApprove = state?.type === "approve";
  const isReject = state?.type === "reject";
  const isDelete = state?.type === "delete";

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isApprove ? "复核通过" : isReject ? "退回整改" : "删除草稿"}
          </DialogTitle>
          <DialogDescription>
            {isDelete
              ? `确认删除「${state?.title || "当前验收单"}」草稿？删除后可重新发起。`
              : `当前验收单：${state?.title || "-"}`}
          </DialogDescription>
        </DialogHeader>

        {isApprove || isReject ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="acceptance-action-comment">
              {isApprove ? "复核说明" : "退回原因"}
            </Label>
            <Textarea
              id="acceptance-action-comment"
              value={state?.comment || ""}
              placeholder={isApprove ? "填写复核说明" : "请填写退回整改原因"}
              disabled={loading}
              aria-invalid={Boolean(error)}
              onChange={(event) => onCommentChange(event.target.value)}
            />
            {error ? <div className="text-sm text-destructive">{error}</div> : null}
          </div>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={() => onOpenChange(false)}
          >
            取消
          </Button>
          <Button
            type="button"
            variant={isDelete || isReject ? "destructive" : "default"}
            disabled={loading}
            onClick={onConfirm}
          >
            {loading ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
            {isApprove ? "确认通过" : isReject ? "确认退回" : "确认删除"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
