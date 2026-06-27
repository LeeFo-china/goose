"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Play, TerminalSquare } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import type { OpsScript, OpsScriptRun } from "@/components/ops/ops-types";
import { Badge } from "@/components/ui/badge";
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

async function requestOps<T>(path: string, payload?: unknown) {
  return requestBackendJson<T>(path, {
    method: "POST",
    body: JSON.stringify(payload || {}),
    fallbackMessage: "脚本执行失败",
  });
}

function statusVariant(status: OpsScriptRun["status"]) {
  if (status === "success") return "success";
  if (status === "running") return "warning";
  if (status === "timeout") return "danger";
  return "danger";
}

function statusLabel(status: OpsScriptRun["status"]) {
  if (status === "success") return "成功";
  if (status === "running") return "运行中";
  if (status === "timeout") return "超时";
  return "失败";
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function RunOpsScriptButton({ script }: { script: OpsScript }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [result, setResult] = useState<OpsScriptRun | null>(null);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const stdoutId = `${script.key}-stdout-log`;
  const stderrId = `${script.key}-stderr-log`;
  const reasonId = `${script.key}-run-reason`;
  const canRun = reason.trim().length > 0 && !pending;

  function openConfirmation() {
    setError("");
    setResult(null);
    setReason("");
    setOpen(true);
  }

  function run() {
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setError("请填写执行原因");
      return;
    }

    setError("");
    startTransition(async () => {
      try {
        const data = await requestOps<OpsScriptRun>(
          `/admin/ops/scripts/${script.key}/run`,
          { reason: trimmedReason },
        );
        setResult(data);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "脚本执行失败");
      }
    });
  }

  return (
    <>
      <Button
        type="button"
        variant={script.danger_level === "medium" ? "outline" : "default"}
        onClick={openConfirmation}
        disabled={pending}
        aria-label={`运行脚本 ${script.label}`}
      >
        {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Play data-icon="inline-start" />}
        运行
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[88vh] max-w-[860px] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-md bg-accent text-accent-foreground">
                <TerminalSquare className="size-4" />
              </div>
              <div>
                <DialogTitle>{script.label}</DialogTitle>
                <DialogDescription>
                  手动执行平台运维脚本，结果会同步记录到脚本执行历史。
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          {error ? <StatusAlert>{error}</StatusAlert> : null}
          {!pending && !result ? (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">风险</div>
                  <Badge className="mt-1" variant={script.danger_level === "medium" ? "warning" : "outline"}>
                    {script.danger_level === "medium" ? "会发送通知" : "低风险"}
                  </Badge>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">超时限制</div>
                  <div className="mt-1 font-medium">{script.timeout_ms}ms</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">脚本 Key</div>
                  <div className="mt-1 truncate font-medium">{script.key}</div>
                </div>
              </div>
              <div>
                <div className="mb-2 text-sm font-medium">脚本说明</div>
                <p className="rounded-md border bg-muted/35 px-3 py-2 text-sm text-muted-foreground">
                  {script.description}
                </p>
              </div>
              <div>
                <label htmlFor={reasonId} className="mb-2 block text-sm font-medium">
                  执行原因
                </label>
                <Textarea
                  id={reasonId}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  maxLength={200}
                  rows={3}
                  placeholder="说明本次手动执行的原因，最多 200 字"
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  取消
                </Button>
                <Button type="button" onClick={run} disabled={!canRun}>
                  <Play data-icon="inline-start" />
                  确认运行脚本
                </Button>
              </DialogFooter>
            </div>
          ) : null}
          {pending ? (
            <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-4 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              脚本正在运行...
            </div>
          ) : null}
          {result ? (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">状态</div>
                  <Badge className="mt-1" variant={statusVariant(result.status)}>
                    {statusLabel(result.status)}
                  </Badge>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">退出码</div>
                  <div className="mt-1 font-medium">{result.exit_code ?? "-"}</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">耗时</div>
                  <div className="mt-1 font-medium">{result.duration_ms ?? 0}ms</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">开始时间</div>
                  <div className="mt-1 font-medium">{formatDateTime(result.started_at)}</div>
                </div>
              </div>
              <div>
                <label htmlFor={stdoutId} className="mb-2 block text-sm font-medium">stdout</label>
                <Textarea id={stdoutId} readOnly rows={10} value={result.stdout || ""} className="font-mono text-xs" />
              </div>
              <div>
                <label htmlFor={stderrId} className="mb-2 block text-sm font-medium">stderr</label>
                <Textarea id={stderrId} readOnly rows={6} value={result.stderr || ""} className="font-mono text-xs" />
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
