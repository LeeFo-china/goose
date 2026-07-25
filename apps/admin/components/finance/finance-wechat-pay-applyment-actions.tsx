"use client";

import { Save, SendHorizontal } from "lucide-react";

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
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export function FinanceWechatPayApplymentActions({
  updatedAtLabel,
  pending,
  saving,
  materialsPending,
  hasApplyment,
  editable,
  canSubmit,
  reviewConfirmed,
  onSubmitApplyment,
}: {
  updatedAtLabel: string;
  pending: boolean;
  saving: boolean;
  materialsPending: boolean;
  hasApplyment: boolean;
  editable: boolean;
  canSubmit: boolean;
  reviewConfirmed: boolean;
  onSubmitApplyment: () => void;
}) {
  const busy = pending || materialsPending;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
      <div className="text-xs text-muted-foreground">
        最近更新：{updatedAtLabel}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          variant="outline"
          disabled={busy || !editable}
        >
          {saving
            ? <Spinner data-icon="inline-start" aria-label="保存中" />
            : <Save data-icon="inline-start" />}
          保存申请
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              disabled={
                busy ||
                !hasApplyment ||
                !editable ||
                !canSubmit ||
                !reviewConfirmed
              }
            >
              <SendHorizontal data-icon="inline-start" />
              提交平台审核
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>提交微信支付开通申请？</AlertDialogTitle>
              <AlertDialogDescription>
                提交后租户侧资料将进入只读状态，由平台审核并决定是否发送微信正式进件。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>继续检查</AlertDialogCancel>
              <AlertDialogAction type="button" onClick={onSubmitApplyment}>
                确认提交
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
