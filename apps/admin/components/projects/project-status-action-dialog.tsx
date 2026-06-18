"use client";

import { Dispatch, SetStateAction } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type {
  ProjectStatusActionItem,
} from "@/components/projects/project-mutation-types";

type ProjectStatusActionDialogProps = {
  selectedAction: ProjectStatusActionItem | null;
  pending: boolean;
  reason: string;
  setReason: Dispatch<SetStateAction<string>>;
  closeActionDialog: () => void;
  submitAction: () => void;
};

export function ProjectStatusActionDialog({
  selectedAction,
  pending,
  reason,
  setReason,
  closeActionDialog,
  submitAction,
}: ProjectStatusActionDialogProps) {
  const isPaymentCollection =
    selectedAction?.workflow_business_domain === "payment_collection";

  return (
    <Dialog open={Boolean(selectedAction)} onOpenChange={(open) => !open && closeActionDialog()}>
      <DialogContent className="max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{selectedAction?.label || "流程操作"}</DialogTitle>
          <DialogDescription>
            {isPaymentCollection
              ? "确认后仅校验是否已有已确认入账记录；不会在此录入金额或凭证，满足条件后推进 workflow。"
              : selectedAction
              ? "将通过后端返回的 workflow task 执行该动作。"
              : "确认执行该 workflow 操作。"}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="project-status-reason">
              {selectedAction?.requires_reason ? "原因" : "备注"}
            </Label>
            <Textarea
              id="project-status-reason"
              value={reason}
              disabled={pending}
              placeholder={selectedAction?.requires_reason ? "请输入原因" : "可选"}
              className="min-h-[96px]"
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={closeActionDialog}>
            取消
          </Button>
          <Button
            type="button"
            disabled={pending}
            onClick={submitAction}
          >
            {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
            确认执行
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
