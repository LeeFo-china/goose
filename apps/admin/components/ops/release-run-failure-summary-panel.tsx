"use client";

import Link from "next/link";
import { ExternalLink, Loader2 } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ReleaseRunFailureSummary } from "@/components/ops/ops-types";
import { conclusionLabel, formatDateTime } from "@/components/ops/release-deployments-shared";

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
