"use client";

import { type FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import type {
  FinanceDifferenceResolutionRecord,
  FinanceDifferenceResolutionUpdateInput,
  FinanceDifferenceSourceRecord,
} from "@/components/finance/finance-difference-sources-requests";
import {
  financeDifferenceResolutionStatusMeta,
  type FinanceDifferenceResolutionWriteStatus,
} from "@/components/finance/finance-difference-sources-utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { requestBackendJson } from "@/lib/backend-client";
import { refreshAfterDialogClose } from "@/lib/deferred-refresh";

const ACTIONS: Array<{
  status: FinanceDifferenceResolutionWriteStatus;
  label: string;
}> = [
  { status: "confirmed", label: "确认" },
  { status: "ignored", label: "忽略" },
  { status: "resolved", label: "修复" },
];

export function FinanceDifferenceResolutionActions({
  month,
  row,
}: {
  month: string;
  row: FinanceDifferenceSourceRecord;
}) {
  const router = useRouter();
  const [status, setStatus] =
    useState<FinanceDifferenceResolutionWriteStatus | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const activeMeta = status
    ? financeDifferenceResolutionStatusMeta(status)
    : null;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!status) return;
    setError("");
    const form = new FormData(event.currentTarget);
    const note = String(form.get("note") || "").trim();
    const payload: FinanceDifferenceResolutionUpdateInput = {
      month,
      source_type: row.source_type,
      source_id: row.source_id,
      project_id: row.project_id,
      status,
      ...(note ? { note } : {}),
    };

    startTransition(async () => {
      try {
        await requestBackendJson<FinanceDifferenceResolutionRecord>(
          "/finance/reports/monthly-overview/difference-resolutions",
          {
            method: "PUT",
            body: JSON.stringify(payload),
            fallbackMessage: "保存差异处理状态失败",
          },
        );
        setStatus(null);
        refreshAfterDialogClose(router);
      } catch (err) {
        setError(err instanceof Error ? err.message : "保存差异处理状态失败");
      }
    });
  }

  return (
    <>
      <div className="mt-1 flex justify-end gap-1">
        {ACTIONS.map((action) => (
          <Button
            key={action.status}
            type="button"
            variant="outline"
            size="sm"
            disabled={pending || row.resolution.status === action.status}
            onClick={() => setStatus(action.status)}
          >
            {action.label}
          </Button>
        ))}
      </div>

      <Dialog open={Boolean(status)} onOpenChange={(open) => !open && setStatus(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{activeMeta?.label || "处理差异"}</DialogTitle>
            <DialogDescription>
              {row.source_label} · {row.description}
            </DialogDescription>
          </DialogHeader>

          {error ? <StatusAlert>{error}</StatusAlert> : null}

          <form id={`difference-resolution-${row.id}`} className="grid gap-3" onSubmit={submit}>
            <label className="grid gap-1.5 text-sm">
              <span className="text-xs font-medium text-muted-foreground">
                处理备注
              </span>
              <Textarea
                name="note"
                maxLength={500}
                disabled={pending}
                defaultValue={row.resolution.note || ""}
                placeholder="填写确认原因、忽略说明或修复结果"
              />
            </label>
          </form>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setStatus(null)}
            >
              取消
            </Button>
            <Button
              type="submit"
              form={`difference-resolution-${row.id}`}
              disabled={pending}
            >
              {pending ? <Loader2 data-icon="inline-start" className="animate-spin" /> : null}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
