"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ReleaseRuntimeVersionData, ReleaseRun, ReleaseRunFailureSummary } from "@/components/ops/ops-types";
import { cn } from "@/lib/utils";
import { conclusionLabel, diffVariant, environmentLabel, fetchReleaseRunFailureSummary, formatDateTime, getRunActorLabel, getRunRefLabel, runtimeHealthVariant, runtimeVersionLabel, shortenImageId, shouldShowFailureSummary, statusLabel, statusVariant } from "@/components/ops/release-deployments-shared";

export function FailureSummaryPanel({
  summary,
  pending,
  error,
}: {
  summary: ReleaseRunFailureSummary | null;
  pending: boolean;
  error: string;
}) {
  if (pending) {
    return (
      <Alert>
        <Loader2 className="animate-spin" data-icon="inline-start" />
        <AlertTitle>正在读取失败摘要</AlertTitle>
        <AlertDescription>正在从 GitHub Actions 拉取失败 Job 和 Step。</AlertDescription>
      </Alert>
    );
  }

  if (error) {
    return <StatusAlert>{error}</StatusAlert>;
  }

  if (!summary) return null;

  if (!summary.has_failure) {
    return (
      <Alert>
        <AlertTitle>未发现失败步骤</AlertTitle>
        <AlertDescription>{summary.summary}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="text-sm font-medium">失败摘要</div>
      {summary.failed_jobs.map((job) => (
        <div key={job.id} className="rounded-md border bg-background p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{job.name}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {formatDateTime(job.started_at)} - {formatDateTime(job.completed_at)}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge variant="danger">{conclusionLabel(job.conclusion)}</Badge>
              {job.html_url ? (
                <Button asChild variant="ghost" size="sm">
                  <Link href={job.html_url} target="_blank" rel="noreferrer">
                    <ExternalLink data-icon="inline-start" />
                    Job
                  </Link>
                </Button>
              ) : null}
            </div>
          </div>

          {job.failed_steps.length ? (
            <div className="mt-3 flex flex-col gap-2">
              {job.failed_steps.map((step) => (
                <div key={`${job.id}-${step.number}-${step.name}`} className="rounded-md bg-muted/40 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate text-sm">{step.name}</div>
                    <Badge variant="danger">{conclusionLabel(step.conclusion)}</Badge>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Step {step.number || "-"} · {formatDateTime(step.started_at)} - {formatDateTime(step.completed_at)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-3 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              GitHub 未返回失败 Step，建议打开 Job 日志查看完整输出。
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function ReleaseRunDetailsDialog({ run }: { run: ReleaseRun }) {
  const githubUrl = run.audit?.run_url || run.html_url;
  const [open, setOpen] = useState(false);
  const [failureSummary, setFailureSummary] = useState<ReleaseRunFailureSummary | null>(null);
  const [failureSummaryPending, setFailureSummaryPending] = useState(false);
  const [failureSummaryError, setFailureSummaryError] = useState("");

  useEffect(() => {
    if (!open || !shouldShowFailureSummary(run)) return;

    let cancelled = false;
    setFailureSummaryPending(true);
    setFailureSummaryError("");
    fetchReleaseRunFailureSummary(run.id)
      .then((data) => {
        if (!cancelled) setFailureSummary(data);
      })
      .catch((err) => {
        if (!cancelled) setFailureSummaryError(err instanceof Error ? err.message : "失败摘要加载失败");
      })
      .finally(() => {
        if (!cancelled) setFailureSummaryPending(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, run]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          详情
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>发布详情</DialogTitle>
          <DialogDescription>
            {run.workflow_label} · {run.service_label}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={statusVariant(run)}>{statusLabel(run)}</Badge>
            <Badge variant="outline">{run.service_label}</Badge>
            <Badge variant="secondary">{run.event || "unknown"}</Badge>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <ReleaseRunDetailItem label="环境" value={run.workflow_label} />
            <ReleaseRunDetailItem label="类型" value={run.audit?.operation_label || "发布"} />
            <ReleaseRunDetailItem label="服务" value={run.service_label} />
            <ReleaseRunDetailItem label="版本" value={getRunRefLabel(run)} />
            <ReleaseRunDetailItem label="GitHub Run ID" value={run.audit?.run_id || run.id} />
            <ReleaseRunDetailItem label="发起人" value={getRunActorLabel(run)} />
            <ReleaseRunDetailItem label="发布时间" value={formatDateTime(run.created_at)} />
          </div>

          <Separator />

          {shouldShowFailureSummary(run) ? (
            <>
              <FailureSummaryPanel
                summary={failureSummary}
                pending={failureSummaryPending}
                error={failureSummaryError}
              />
              <Separator />
            </>
          ) : null}

          <div className="flex flex-col gap-2">
            <div className="text-sm font-medium">发布说明</div>
            <div className="min-h-16 rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
              {run.audit?.reason || run.audit?.summary || "未记录"}
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            {run.audit?.workflow_url ? (
              <Button asChild variant="outline" size="sm">
                <Link href={run.audit.workflow_url} target="_blank" rel="noreferrer">
                  <ExternalLink data-icon="inline-start" />
                  Workflow
                </Link>
              </Button>
            ) : null}
            {githubUrl ? (
              <Button asChild size="sm">
                <Link href={githubUrl} target="_blank" rel="noreferrer">
                  <ExternalLink data-icon="inline-start" />
                  GitHub 日志
                </Link>
              </Button>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ReleaseRunDetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 break-all text-sm font-medium">{value || "-"}</div>
    </div>
  );
}

export function TruncatedTooltipText({ value, className }: { value: string; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={cn("truncate", className)}>{value || "-"}</div>
      </TooltipTrigger>
      <TooltipContent align="start" className="max-w-[360px] leading-5">
        {value || "-"}
      </TooltipContent>
    </Tooltip>
  );
}

export function RuntimeVersionsPanel({
  data,
  error,
  refreshing,
  onRefresh,
}: {
  data: ReleaseRuntimeVersionData | null;
  error?: string | null;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const services = data?.services || [];
  const latestDevSha = data?.latest_successful.dev?.head_sha || null;
  const latestProdSha = data?.latest_successful.production?.head_sha || null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div>
          <CardTitle className="text-base">当前部署版本</CardTitle>
          <CardDescription>
            从 Docker 容器读取实际运行镜像；新版镜像会显示 Commit，旧镜像会显示 tag 或提示等待新版镜像。
          </CardDescription>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant="outline">
            dev {latestDevSha ? latestDevSha.slice(0, 7) : "未知"}
          </Badge>
          <Badge variant="outline">
            prod {latestProdSha ? latestProdSha.slice(0, 7) : "未知"}
          </Badge>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-7 rounded-md"
            onClick={onRefresh}
            disabled={refreshing}
            aria-label="刷新部署版本"
            title="刷新部署版本"
          >
            <RefreshCw className={cn(refreshing && "animate-spin")} data-icon="icon-only" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {error ? (
          <div className="px-5 pb-4">
            <StatusAlert>{error}</StatusAlert>
          </div>
        ) : null}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>环境</TableHead>
              <TableHead>服务</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>运行版本</TableHead>
              <TableHead>镜像</TableHead>
              <TableHead>Dev 差异</TableHead>
              <TableHead>启动时间</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {services.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-sm text-muted-foreground">
                  暂无运行版本信息
                </TableCell>
              </TableRow>
            ) : services.map((item) => (
              <TableRow key={`${item.environment}-${item.service}-${item.container_name}`}>
                <TableCell>
                  <Badge variant={item.environment === "production" ? "default" : "outline"}>
                    {environmentLabel(item.environment)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="font-medium">{item.service_label}</div>
                  <div className="text-xs text-muted-foreground">{item.container_name}</div>
                </TableCell>
                <TableCell>
                  <Badge variant={runtimeHealthVariant(item)}>
                    {item.health === "none" ? item.state : item.health}
                  </Badge>
                </TableCell>
                <TableCell>
                  <TruncatedTooltipText
                    value={item.revision || item.image_tag || "等待新版镜像 labels"}
                    className="max-w-[180px] text-sm font-medium"
                  />
                  <div className="text-xs text-muted-foreground">{runtimeVersionLabel(item)}</div>
                </TableCell>
                <TableCell>
                  <TruncatedTooltipText value={item.image} className="max-w-[260px] text-sm" />
                  <div className="text-xs text-muted-foreground">ID {shortenImageId(item.image_id)}</div>
                </TableCell>
                <TableCell>
                  <Badge variant={diffVariant(item)}>{item.diff_label}</Badge>
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                  {formatDateTime(item.started_at)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
