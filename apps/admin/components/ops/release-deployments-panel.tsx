"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, ExternalLink, GitBranch, GitCommit, Loader2, RefreshCw, Rocket, RotateCcw, ShieldCheck, Tag } from "lucide-react";
import { toast } from "sonner";
import { StatusAlert } from "@/components/admin/status-alert";
import { useReleaseDeploymentStore } from "@/components/ops/release-deployments-store";
import type {
  ReleaseCreateTagResult,
  ReleaseDispatchResult,
  ReleaseEnvironment,
  ReleaseOperation,
  ReleaseOptionsData,
  Pagination,
  ReleaseRefOption,
  ReleaseRefType,
  ReleaseRuntimeServiceVersion,
  ReleaseRuntimeVersionData,
  ReleaseRun,
  ReleaseRunFailureSummary,
  ReleaseRunListData,
  ReleaseService,
  ReleaseSuccessfulRef,
  ReleaseSuccessfulRefListData,
} from "@/components/ops/ops-types";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type ReleaseDeploymentsPanelProps = {
  options: ReleaseOptionsData | null;
  runs: ReleaseRun[];
  runsPagination: Pagination;
  successfulRefs: ReleaseSuccessfulRef[];
  successfulRefsPagination: Pagination;
  runtimeVersions: ReleaseRuntimeVersionData | null;
  runtimeError?: string | null;
  error?: string | null;
};

type ReleaseSearchEnvironment = ReleaseEnvironment | "all";

const REF_TYPE_OPTIONS: Array<{
  value: ReleaseRefType;
  label: string;
  description: string;
}> = [
  { value: "branch", label: "分支", description: "适合 dev 快速验证" },
  { value: "tag", label: "Tag", description: "适合生产发布" },
];
const RELEASE_RUN_POLL_MS = 15_000;
const RELEASE_RUN_FORCE_POLL_MS = 10 * 60_000;

function getPayloadMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

async function dispatchRelease(payload: {
  environment: ReleaseEnvironment;
  service: ReleaseService;
  services?: ReleaseService[];
  ref_type: ReleaseRefType;
  ref: string;
  operation?: ReleaseOperation;
  reason: string;
  confirm_text?: string;
}) {
  const response = await fetch("/api/backend/admin/ops/releases/dispatch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) {
    throw new Error(getPayloadMessage(data, "发布任务提交失败"));
  }
  return data.data as ReleaseDispatchResult;
}

async function createReleaseTag(payload: {
  tag: string;
  source_ref: string;
  message: string;
}) {
  const response = await fetch("/api/backend/admin/ops/releases/tags", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) {
    throw new Error(getPayloadMessage(data, "发布 Tag 创建失败"));
  }
  return data.data as ReleaseCreateTagResult;
}

async function createRollbackTag(payload: {
  source_ref: string;
  message?: string;
}) {
  const response = await fetch("/api/backend/admin/ops/releases/rollback-tag", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) {
    throw new Error(getPayloadMessage(data, "回滚 Tag 创建失败"));
  }
  return data.data as ReleaseCreateTagResult;
}

async function fetchReleaseRefs(input: {
  type: ReleaseRefType;
  keyword: string;
  baseRef?: string;
}) {
  const query = new URLSearchParams({
    type: input.type,
  });
  if (input.keyword.trim()) query.set("keyword", input.keyword.trim());
  if (input.baseRef?.trim()) query.set("base_ref", input.baseRef.trim());

  const response = await fetch(`/api/backend/admin/ops/releases/refs?${query.toString()}`, {
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) {
    throw new Error(getPayloadMessage(data, "版本列表加载失败"));
  }
  return (data.data?.list || []) as ReleaseRefOption[];
}

async function fetchReleaseRuns(input: { page: number; pageSize?: number }) {
  const query = new URLSearchParams({
    page: String(input.page),
    pageSize: String(input.pageSize || 5),
  });
  const response = await fetch(`/api/backend/admin/ops/releases/runs?${query.toString()}`, {
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) {
    throw new Error(getPayloadMessage(data, "最近发布记录刷新失败"));
  }
  return data.data as ReleaseRunListData;
}

async function fetchSuccessfulRefs(input: {
  page: number;
  pageSize?: number;
  environment: ReleaseSearchEnvironment;
  keyword: string;
}) {
  const query = new URLSearchParams({
    page: String(input.page),
    pageSize: String(input.pageSize || 5),
  });
  if (input.environment !== "all") query.set("environment", input.environment);
  if (input.keyword.trim()) query.set("keyword", input.keyword.trim());

  const response = await fetch(`/api/backend/admin/ops/releases/successful-refs?${query.toString()}`, {
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) {
    throw new Error(getPayloadMessage(data, "发布辅助刷新失败"));
  }
  return data.data as ReleaseSuccessfulRefListData;
}

async function fetchReleaseRuntimeVersions() {
  const response = await fetch("/api/backend/admin/ops/releases/runtime-versions", {
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) {
    throw new Error(getPayloadMessage(data, "运行版本刷新失败"));
  }
  return data.data as ReleaseRuntimeVersionData;
}

async function fetchReleaseRunFailureSummary(runId: string) {
  const response = await fetch(`/api/backend/admin/ops/releases/runs/${encodeURIComponent(runId)}/failure-summary`, {
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) {
    throw new Error(getPayloadMessage(data, "失败摘要加载失败"));
  }
  return data.data as ReleaseRunFailureSummary;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function statusLabel(run: ReleaseRun) {
  if (run.status === "completed") {
    if (run.conclusion === "success") return "成功";
    if (run.conclusion === "failure") return "失败";
    if (run.conclusion === "cancelled") return "已取消";
    return run.conclusion || "已完成";
  }
  if (run.status === "in_progress") return "执行中";
  if (run.status === "queued") return "排队中";
  return run.status || "-";
}

function statusVariant(run: ReleaseRun) {
  if (run.status === "completed" && run.conclusion === "success") return "success" as const;
  if (run.status === "completed" && run.conclusion) return "danger" as const;
  if (run.status === "in_progress" || run.status === "queued") return "warning" as const;
  return "outline" as const;
}

function isReleaseRunActive(run: ReleaseRun) {
  if (run.status === "queued" || run.status === "in_progress") return true;
  return run.status !== "completed" && !run.conclusion;
}

function shouldShowFailureSummary(run: ReleaseRun) {
  return run.status === "completed" && Boolean(run.conclusion) && run.conclusion !== "success";
}

function getRunActorLabel(run: ReleaseRun) {
  const employee = run.audit?.actor_employee;
  if (employee?.name && employee.phone) return `${employee.name} · ${employee.phone}`;
  if (employee?.name) return employee.name;
  if (employee?.phone) return employee.phone;
  if (run.audit?.actor_user_id) return run.audit.actor_user_id;
  return "未记录";
}

function getRunRefLabel(run: ReleaseRun) {
  if (run.audit?.ref) {
    return `${run.audit.ref_type_label || "版本"} · ${run.audit.ref}`;
  }
  return `${run.head_branch || "-"} · ${run.head_sha?.slice(0, 7) || "-"}`;
}

function getSuccessfulRefDescription(item: ReleaseSuccessfulRef) {
  return [
    item.workflow_label,
    item.head_branch ? `来源 ${item.head_branch}` : "",
    `发布时间 ${formatDateTime(item.created_at)}`,
  ].filter(Boolean).join(" · ");
}

function environmentLabel(environment: ReleaseEnvironment) {
  return environment === "production" ? "生产环境" : "开发环境";
}

function runtimeHealthVariant(item: ReleaseRuntimeServiceVersion) {
  if (item.health === "healthy") return "success" as const;
  if (item.health === "starting" || item.state === "running") return "warning" as const;
  if (item.health === "unhealthy" || item.health === "exited" || item.state !== "running") return "danger" as const;
  return "outline" as const;
}

function diffVariant(item: ReleaseRuntimeServiceVersion) {
  if (item.diff_status === "same_as_dev") return "success" as const;
  if (item.diff_status === "behind_dev") return "warning" as const;
  if (item.diff_status === "ahead_of_dev") return "danger" as const;
  return "secondary" as const;
}

function runtimeVersionLabel(item: ReleaseRuntimeServiceVersion) {
  if (item.revision_short) return item.revision_short;
  if (item.image_tag) return item.image_tag;
  return "等待新版镜像";
}

function shortenImageId(value: string | null | undefined) {
  if (!value) return "-";
  return value.replace(/^sha256:/, "").slice(0, 12);
}

function conclusionLabel(value: string | null | undefined) {
  if (value === "failure") return "失败";
  if (value === "timed_out") return "超时";
  if (value === "cancelled") return "已取消";
  if (value === "action_required") return "需要处理";
  return value || "-";
}

function FailureSummaryPanel({
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

function ReleaseRunDetailsDialog({ run }: { run: ReleaseRun }) {
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

function ReleaseRunDetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 break-all text-sm font-medium">{value || "-"}</div>
    </div>
  );
}

function TruncatedTooltipText({ value, className }: { value: string; className?: string }) {
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

function RuntimeVersionsPanel({
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

function getRefTypeIcon(type: ReleaseRefType) {
  if (type === "tag") return Tag;
  if (type === "commit") return GitCommit;
  return GitBranch;
}

function getRefEmptyMessage(type: ReleaseRefType, keyword: string, error: string) {
  if (error) return error;
  if (keyword.trim()) return "没有匹配的版本";
  if (type === "tag") return "仓库暂无 Tag，请先创建生产版本 Tag。";
  if (type === "commit") return "暂无可选 Commit，请输入关键词后重试。";
  return "暂无可选分支";
}

function getTodayTagPlaceholder() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `v${year}.${month}.${day}.1`;
}

function ReleaseRefCombobox({
  type,
  value,
  defaultRef,
  disabled,
  onChange,
}: {
  type: ReleaseRefType;
  value: string;
  defaultRef: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [options, setOptions] = useState<ReleaseRefOption[]>([]);
  const Icon = getRefTypeIcon(type);

  useEffect(() => {
    if (!open) return;

    const timer = window.setTimeout(() => {
      setLoading(true);
      setError("");
      fetchReleaseRefs({
        type,
        keyword,
        baseRef: defaultRef,
      })
        .then((list) => setOptions(list))
        .catch((err) => setError(err instanceof Error ? err.message : "版本列表加载失败"))
        .finally(() => setLoading(false));
    }, 180);

    return () => window.clearTimeout(timer);
  }, [defaultRef, keyword, open, type]);

  useEffect(() => {
    setKeyword("");
    setOptions([]);
  }, [type]);

  const selectedOption = options.find((item) => item.value === value);
  const displayValue = selectedOption?.label || value || "选择版本";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between"
        >
          <span className="flex min-w-0 items-center gap-2">
            <Icon data-icon="inline-start" />
            <span className="truncate">{displayValue}</span>
          </span>
          <ChevronsUpDown data-icon="inline-end" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[--radix-popover-trigger-width] p-0">
        <Command shouldFilter={false}>
          <CommandInput
            value={keyword}
            onValueChange={setKeyword}
            placeholder="搜索版本..."
          />
          <CommandList>
            <CommandEmpty>{loading ? "加载中..." : getRefEmptyMessage(type, keyword, error)}</CommandEmpty>
            <CommandGroup>
              {options.map((item) => (
                <CommandItem
                  key={`${item.type}-${item.value}`}
                  value={item.value}
                  onSelect={() => {
                    onChange(item.value);
                    setOpen(false);
                  }}
                >
                  <Check className={cn(value === item.value ? "opacity-100" : "opacity-0")} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{item.label}</div>
                    <div className="truncate text-xs text-muted-foreground">{item.description}</div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function ReleaseServiceMultiSelect({
  options,
  value,
  disabled,
  onChange,
}: {
  options: Array<{ value: ReleaseService; label: string }>;
  value: ReleaseService[];
  disabled?: boolean;
  onChange: (value: ReleaseService[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = value.length ? value : [];
  const selectedSet = new Set(selected);
  const selectedLabels = selected.includes("all")
    ? "全部服务"
    : options
      .filter((item) => selectedSet.has(item.value))
      .map((item) => item.label);
  const displayValue = Array.isArray(selectedLabels)
    ? selectedLabels.length ? selectedLabels.join("、") : "选择服务"
    : selectedLabels;

  function toggleService(nextValue: ReleaseService) {
    if (nextValue === "all") {
      onChange(selectedSet.has("all") ? [] : ["all"]);
      return;
    }

    const next = selected.filter((item) => item !== "all");
    if (selectedSet.has(nextValue)) {
      onChange(next.filter((item) => item !== nextValue));
      return;
    }
    onChange([...next, nextValue]);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between"
        >
          <span className="truncate">{displayValue}</span>
          <ChevronsUpDown data-icon="inline-end" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[--radix-popover-trigger-width] p-0">
        <Command>
          <CommandInput placeholder="搜索服务..." />
          <CommandList>
            <CommandEmpty>没有匹配的服务</CommandEmpty>
            <CommandGroup>
              {options.map((item) => {
                const checked = selectedSet.has(item.value);
                const allSelected = selectedSet.has("all");
                const disabledByAll = allSelected && item.value !== "all";

                return (
                  <CommandItem
                    key={item.value}
                    value={`${item.label} ${item.value}`}
                    onSelect={() => toggleService(item.value)}
                    disabled={disabledByAll}
                  >
                    <Checkbox
                      checked={checked}
                      disabled={disabledByAll}
                      aria-label={item.label}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{item.label}</div>
                      {item.value === "all" ? (
                        <div className="truncate text-xs text-muted-foreground">构建并发布当前环境的全部业务服务</div>
                      ) : null}
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function CompactPagination({
  pagination,
  pending,
  onPageChange,
}: {
  pagination: Pagination;
  pending?: boolean;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.max(pagination.totalPages || 0, 1);
  const page = Math.min(Math.max(pagination.page || 1, 1), totalPages);

  return (
    <div className="flex items-center justify-between gap-3 border-t px-5 py-3">
      <div className="text-xs text-muted-foreground">
        第 {page} / {totalPages} 页，共 {pagination.total} 条
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending || page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          上一页
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending || page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          下一页
        </Button>
      </div>
    </div>
  );
}

function successfulRefEnvironmentLabel(value: ReleaseSearchEnvironment) {
  if (value === "production") return "生产";
  if (value === "dev") return "开发";
  return "全部";
}

export function ReleaseDeploymentsPanel({
  options,
  runs,
  runsPagination,
  successfulRefs,
  successfulRefsPagination,
  runtimeVersions,
  runtimeError,
  error,
}: ReleaseDeploymentsPanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rollbackConfirmText, setRollbackConfirmText] = useState("");
  const [currentRuns, setCurrentRuns] = useState(runs);
  const [currentRunsPagination, setCurrentRunsPagination] = useState(runsPagination);
  const [currentSuccessfulRefs, setCurrentSuccessfulRefs] = useState(successfulRefs);
  const [currentSuccessfulRefsPagination, setCurrentSuccessfulRefsPagination] = useState(successfulRefsPagination);
  const [currentRuntimeVersions, setCurrentRuntimeVersions] = useState(runtimeVersions);
  const [runsRefreshing, setRunsRefreshing] = useState(false);
  const [successfulRefsRefreshing, setSuccessfulRefsRefreshing] = useState(false);
  const [runsPollError, setRunsPollError] = useState("");
  const [lastRunsRefreshedAt, setLastRunsRefreshedAt] = useState<string | null>(null);
  const [forcePollUntil, setForcePollUntil] = useState(0);
  const [runsPage, setRunsPage] = useState(runsPagination.page || 1);
  const [successfulRefsPage, setSuccessfulRefsPage] = useState(successfulRefsPagination.page || 1);
  const [successfulRefEnvironment, setSuccessfulRefEnvironment] = useState<ReleaseSearchEnvironment>("all");
  const [successfulRefKeyword, setSuccessfulRefKeyword] = useState("");
  const {
    environment,
    service,
    services,
    refType,
    ref,
    reason,
    confirmText,
    latestDispatch,
    productionVersionMode,
    tagName,
    tagSourceRefType,
    tagSourceRef,
    tagMessage,
    rollbackPendingId,
    setDraft,
    resetEnvironment,
    resetRefType,
  } = useReleaseDeploymentStore();
  const currentEnvironment = useMemo(
    () => options?.environments.find((item) => item.environment === environment) || null,
    [environment, options],
  );
  const hasActiveRuns = useMemo(() => currentRuns.some(isReleaseRunActive), [currentRuns]);
  const shouldPollRuns = hasActiveRuns || Date.now() < forcePollUntil;

  useEffect(() => {
    setCurrentRuns(runs);
  }, [runs]);

  useEffect(() => {
    setCurrentRunsPagination(runsPagination);
    setRunsPage(runsPagination.page || 1);
  }, [runsPagination]);

  useEffect(() => {
    setCurrentSuccessfulRefs(successfulRefs);
  }, [successfulRefs]);

  useEffect(() => {
    setCurrentSuccessfulRefsPagination(successfulRefsPagination);
    setSuccessfulRefsPage(successfulRefsPagination.page || 1);
  }, [successfulRefsPagination]);

  useEffect(() => {
    setCurrentRuntimeVersions(runtimeVersions);
  }, [runtimeVersions]);

  const refreshReleaseSnapshots = useCallback(async ({
    silent = false,
    nextRunsPage = runsPage,
    nextSuccessfulRefsPage = successfulRefsPage,
    nextSuccessfulRefEnvironment = successfulRefEnvironment,
    nextSuccessfulRefKeyword = successfulRefKeyword,
  }: {
    silent?: boolean;
    nextRunsPage?: number;
    nextSuccessfulRefsPage?: number;
    nextSuccessfulRefEnvironment?: ReleaseSearchEnvironment;
    nextSuccessfulRefKeyword?: string;
  } = {}) => {
    if (!silent) setRunsRefreshing(true);
    if (!silent) setSuccessfulRefsRefreshing(true);
    try {
      const [nextRuns, nextSuccessfulRefs, nextRuntimeVersions] = await Promise.all([
        fetchReleaseRuns({ page: nextRunsPage, pageSize: 5 }),
        fetchSuccessfulRefs({
          page: nextSuccessfulRefsPage,
          pageSize: 5,
          environment: nextSuccessfulRefEnvironment,
          keyword: nextSuccessfulRefKeyword,
        }),
        fetchReleaseRuntimeVersions(),
      ]);
      setCurrentRuns(nextRuns.list || []);
      setCurrentRunsPagination(nextRuns.pagination);
      setRunsPage(nextRuns.pagination.page || nextRunsPage);
      setCurrentSuccessfulRefs(nextSuccessfulRefs.list || []);
      setCurrentSuccessfulRefsPagination(nextSuccessfulRefs.pagination);
      setSuccessfulRefsPage(nextSuccessfulRefs.pagination.page || nextSuccessfulRefsPage);
      setCurrentRuntimeVersions(nextRuntimeVersions);
      setLastRunsRefreshedAt(new Date().toISOString());
      setRunsPollError("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "发布状态刷新失败";
      setRunsPollError(message);
      if (!silent) toast.error(message);
    } finally {
      if (!silent) setRunsRefreshing(false);
      if (!silent) setSuccessfulRefsRefreshing(false);
    }
  }, [runsPage, successfulRefEnvironment, successfulRefKeyword, successfulRefsPage]);

  useEffect(() => {
    if (!shouldPollRuns) return undefined;

    let cancelled = false;
    const tick = async () => {
      if (document.visibilityState !== "visible" || cancelled) return;
      setRunsRefreshing(true);
      try {
        const [nextRuns, nextSuccessfulRefs, nextRuntimeVersions] = await Promise.all([
          fetchReleaseRuns({ page: runsPage, pageSize: 5 }),
          fetchSuccessfulRefs({
            page: successfulRefsPage,
            pageSize: 5,
            environment: successfulRefEnvironment,
            keyword: successfulRefKeyword,
          }),
          fetchReleaseRuntimeVersions(),
        ]);
        if (cancelled) return;
        setCurrentRuns(nextRuns.list || []);
        setCurrentRunsPagination(nextRuns.pagination);
        setCurrentSuccessfulRefs(nextSuccessfulRefs.list || []);
        setCurrentSuccessfulRefsPagination(nextSuccessfulRefs.pagination);
        setCurrentRuntimeVersions(nextRuntimeVersions);
        setLastRunsRefreshedAt(new Date().toISOString());
        setRunsPollError("");
      } catch (err) {
        if (!cancelled) setRunsPollError(err instanceof Error ? err.message : "发布状态刷新失败");
      } finally {
        if (!cancelled) setRunsRefreshing(false);
      }
    };

    const timer = window.setInterval(tick, RELEASE_RUN_POLL_MS);
    void tick();

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [runsPage, shouldPollRuns, successfulRefEnvironment, successfulRefKeyword, successfulRefsPage]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setSuccessfulRefsPage(1);
      setSuccessfulRefsRefreshing(true);
      fetchSuccessfulRefs({
        page: 1,
        pageSize: 5,
        environment: successfulRefEnvironment,
        keyword: successfulRefKeyword,
      })
        .then((data) => {
          if (cancelled) return;
          setCurrentSuccessfulRefs(data.list || []);
          setCurrentSuccessfulRefsPagination(data.pagination);
          setSuccessfulRefsPage(data.pagination.page || 1);
        })
        .catch((err) => {
          if (!cancelled) setRunsPollError(err instanceof Error ? err.message : "发布辅助刷新失败");
        })
        .finally(() => {
          if (!cancelled) setSuccessfulRefsRefreshing(false);
        });
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [successfulRefEnvironment, successfulRefKeyword]);

  function onEnvironmentChange(value: ReleaseEnvironment) {
    const nextEnvironment = options?.environments.find((item) => item.environment === value) || null;
    const nextService = nextEnvironment?.services.find((item) => item.value !== "all")?.value
      || nextEnvironment?.services[0]?.value
      || "admin";
    resetEnvironment({
      environment: value,
      defaultRef: nextEnvironment?.default_ref || "feature/multi-tenant",
      service: nextService,
    });
  }

  function onRefTypeChange(value: ReleaseRefType) {
    resetRefType({
      refType: value,
      defaultRef: currentEnvironment?.default_ref || "feature/multi-tenant",
    });
  }

  function changeRunsPage(nextPage: number) {
    const normalized = Math.max(1, Math.min(nextPage, Math.max(currentRunsPagination.totalPages, 1)));
    setRunsPage(normalized);
    void refreshReleaseSnapshots({ nextRunsPage: normalized });
  }

  function changeSuccessfulRefsPage(nextPage: number) {
    const normalized = Math.max(1, Math.min(nextPage, Math.max(currentSuccessfulRefsPagination.totalPages, 1)));
    setSuccessfulRefsPage(normalized);
    void refreshReleaseSnapshots({ nextSuccessfulRefsPage: normalized });
  }

  function applySuccessfulRef(item: ReleaseSuccessfulRef) {
    setDraft({
      environment: "production",
      refType: "tag",
      productionVersionMode: "new_tag",
      tagSourceRefType: "commit",
      tagSourceRef: item.head_sha,
      tagMessage: tagMessage.trim() || `release from ${item.head_sha.slice(0, 7)}`,
    });
    toast.success("已填入生产发布来源，请在左侧补充 Tag 名称后提交");
  }

  async function runCreateRollbackTag(item: ReleaseSuccessfulRef) {
    setDraft({ rollbackPendingId: item.id });
    try {
      const data = await createRollbackTag({
        source_ref: item.head_sha,
        message: `rollback to ${item.head_sha.slice(0, 7)}`,
      });
      setDraft({
        environment: "production",
        refType: "tag",
        ref: data.tag,
        confirmText: "",
        reason: reason.trim() || `回滚发布 ${data.tag}`,
        tagName: "",
        tagSourceRefType: "commit",
        tagSourceRef: data.target_sha,
        tagMessage: "",
        productionVersionMode: "existing_tag",
      });
      toast.success(data.message || "回滚 Tag 已创建，请确认后发布生产");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "回滚 Tag 创建失败");
    } finally {
      setDraft({ rollbackPendingId: "" });
    }
  }

  async function runRollbackDispatch(item: ReleaseSuccessfulRef) {
    setDraft({ rollbackPendingId: item.id });
    const fallbackReason = `生产回滚到 ${item.head_sha.slice(0, 7)}：${item.title}`;
    try {
      const tagData = await createRollbackTag({
        source_ref: item.head_sha,
        message: `rollback to ${item.head_sha.slice(0, 7)}`,
      });
      const data = await dispatchRelease({
        environment: "production",
        service: "all",
        services: ["all"],
        ref_type: "tag",
        ref: tagData.tag,
        operation: "rollback",
        reason: reason.trim() || fallbackReason,
        confirm_text: "确认回滚生产",
      });
      setDraft({
        environment: "production",
        service: "all",
        services: ["all"],
        refType: "tag",
        ref: tagData.tag,
        confirmText: "",
        reason: reason.trim() || fallbackReason,
        tagName: "",
        tagSourceRefType: "commit",
        tagSourceRef: tagData.target_sha,
        tagMessage: "",
        latestDispatch: data,
        productionVersionMode: "existing_tag",
      });
      setRollbackConfirmText("");
      toast.success(data.message || `已提交生产回滚：${tagData.tag}`);
      router.refresh();
      setForcePollUntil(Date.now() + RELEASE_RUN_FORCE_POLL_MS);
      void refreshReleaseSnapshots({ silent: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "生产回滚提交失败");
    } finally {
      setDraft({ rollbackPendingId: "" });
    }
  }

  function runDispatch() {
    const selectedServices = services;
    startTransition(async () => {
      let createdTag = "";
      try {
        let releaseRef = ref;
        if (environment === "production" && productionVersionMode === "new_tag") {
          const tagData = await createReleaseTag({
            tag: tagName,
            source_ref: tagSourceRef,
            message: tagMessage,
          });
          releaseRef = tagData.tag;
          createdTag = tagData.tag;
          setDraft({
            ref: tagData.tag,
            productionVersionMode: "existing_tag",
            reason: reason.trim() || `发布 ${tagData.tag}`,
            tagName: "",
            tagSourceRefType: "branch",
            tagSourceRef: currentEnvironment?.default_ref || "feature/multi-tenant",
            tagMessage: "",
          });
          toast.success(tagData.message || "发布 Tag 已创建");
        }

        const data = await dispatchRelease({
          environment,
          service: selectedServices.includes("all") ? "all" : selectedServices[0] || service,
          services: selectedServices,
          ref_type: refType,
          ref: releaseRef,
          reason: reason || (environment === "production" && productionVersionMode === "new_tag" ? `发布 ${releaseRef}` : ""),
          confirm_text: environment === "production" ? confirmText : undefined,
        });
        setDraft({ latestDispatch: data });
        toast.success(data.message || "发布任务已提交");
        router.refresh();
        setForcePollUntil(Date.now() + RELEASE_RUN_FORCE_POLL_MS);
        void refreshReleaseSnapshots({ silent: true });
      } catch (err) {
        if (createdTag) {
          toast.error(`Tag ${createdTag} 已创建，但发布任务提交失败：${err instanceof Error ? err.message : "未知错误"}`);
          return;
        }
        toast.error(err instanceof Error ? err.message : "发布任务提交失败");
      }
    });
  }

  const serviceOptions = currentEnvironment?.services || [];
  const selectedServices = services;
  const production = environment === "production";
  const creatingProductionTag = production && productionVersionMode === "new_tag";
  const selectedServiceLabel = selectedServices.includes("all")
    ? "全部服务"
    : serviceOptions
      .filter((item) => selectedServices.includes(item.value))
      .map((item) => item.label)
      .join("、");
  const releaseRefReady = creatingProductionTag
    ? Boolean(tagName.trim() && tagSourceRef.trim() && tagMessage.trim())
    : Boolean(ref.trim());
  const confirmRefLabel = creatingProductionTag ? tagName || "新 Tag" : ref || "-";
  const disabled = pending || !options?.configured || !currentEnvironment || selectedServices.length === 0 || !releaseRefReady || (production && confirmText !== "确认发布生产");

  return (
    <div className="flex flex-col gap-3">
      <RuntimeVersionsPanel
        data={currentRuntimeVersions}
        error={runtimeError}
        refreshing={runsRefreshing}
        onRefresh={() => void refreshReleaseSnapshots()}
      />

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(520px,0.9fr)] 2xl:grid-cols-[minmax(0,1fr)_minmax(580px,0.9fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Rocket data-icon="inline-start" />
              发起发布
            </CardTitle>
            <CardDescription>
              后台只提交 GitHub Actions，构建、部署和日志仍由 CI/CD 执行。
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {error ? <StatusAlert>{error}</StatusAlert> : null}
            {!options?.configured ? (
              <Alert variant="destructive">
                <ShieldCheck data-icon="inline-start" />
                <AlertTitle>发布令牌未配置</AlertTitle>
                <AlertDescription>后端需要配置 GITHUB_RELEASE_TOKEN 后才能从后台发起发布。</AlertDescription>
              </Alert>
            ) : null}
            {latestDispatch?.run?.html_url ? (
              <Alert>
                <Rocket data-icon="inline-start" />
                <AlertTitle>发布任务已创建</AlertTitle>
                <AlertDescription>
                  {latestDispatch.service_label} · {latestDispatch.ref}
                  <Button asChild variant="link" className="ml-2 h-auto p-0">
                    <Link href={latestDispatch.run.html_url} target="_blank" rel="noreferrer">
                      查看本次发布
                    </Link>
                  </Button>
                </AlertDescription>
              </Alert>
            ) : null}
            {production ? (
              <Alert>
                <ShieldCheck data-icon="inline-start" />
                <AlertTitle>生产发布规则</AlertTitle>
                <AlertDescription>
                  生产只允许发布 Tag；可以选择已有 Tag，也可以在本表单中创建新 Tag 后自动发起发布。
                </AlertDescription>
              </Alert>
            ) : null}

          <FieldGroup>
            <Field>
              <FieldLabel>环境</FieldLabel>
              <Select value={environment} onValueChange={(value) => onEnvironmentChange(value as ReleaseEnvironment)}>
                <SelectTrigger>
                  <SelectValue placeholder="选择环境" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {options?.environments.map((item) => (
                      <SelectItem key={item.environment} value={item.environment}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription>{currentEnvironment?.workflow_id || "-"}</FieldDescription>
            </Field>

            <Field>
              <FieldLabel>服务</FieldLabel>
              <ReleaseServiceMultiSelect
                options={serviceOptions}
                value={selectedServices}
                disabled={!options?.configured}
                onChange={(value) => {
                  const nextService = value.includes("all")
                    ? "all"
                    : value[0] || serviceOptions.find((item) => item.value !== "all")?.value || serviceOptions[0]?.value || "admin";
                  setDraft({ service: nextService, services: value });
                }}
              />
              <FieldDescription>
                {production ? "生产支持选择全部服务，也支持一次选择多个服务。" : "开发环境按需选择要验证的服务。"}
              </FieldDescription>
            </Field>

            {production ? (
              <>
                <Field>
                  <FieldLabel>生产版本</FieldLabel>
                  <Select
                    value={productionVersionMode}
                    onValueChange={(value) => {
                      const nextMode = value as "existing_tag" | "new_tag";
                      setDraft({
                        productionVersionMode: nextMode,
                        refType: "tag",
                        ref: nextMode === "new_tag" ? "" : ref,
                      });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择生产版本方式" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="existing_tag">选择已有 Tag</SelectItem>
                        <SelectItem value="new_tag">创建新 Tag 并发布</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FieldDescription>
                    {productionVersionMode === "new_tag"
                      ? "提交时会先创建 Tag，再用这个 Tag 发起生产发布。"
                      : "适合发布已经创建并确认过的生产 Tag。"}
                  </FieldDescription>
                </Field>

                {productionVersionMode === "existing_tag" ? (
                  <Field>
                    <FieldLabel>发布 Tag</FieldLabel>
                    <ReleaseRefCombobox
                      type="tag"
                      value={ref}
                      defaultRef={currentEnvironment?.default_ref || "feature/multi-tenant"}
                      disabled={!options?.configured}
                      onChange={(value) => setDraft({ ref: value, refType: "tag" })}
                    />
                    <FieldDescription>生产环境只允许选择 Tag 发布。</FieldDescription>
                  </Field>
                ) : (
                  <>
                    <Field>
                      <FieldLabel htmlFor="release-tag-name">Tag 名称</FieldLabel>
                      <Input
                        id="release-tag-name"
                        value={tagName}
                        onChange={(event) => setDraft({ tagName: event.target.value })}
                        placeholder={getTodayTagPlaceholder()}
                      />
                      <FieldDescription>格式固定为 vYYYY.MM.DD.N，例如 {getTodayTagPlaceholder()}。</FieldDescription>
                    </Field>

                    <div className="grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)]">
                      <Field>
                        <FieldLabel>来源类型</FieldLabel>
                        <Select
                          value={tagSourceRefType}
                          onValueChange={(value) => {
                            const nextType = value as ReleaseRefType;
                            setDraft({
                              tagSourceRefType: nextType,
                              tagSourceRef: nextType === "branch" ? currentEnvironment?.default_ref || "feature/multi-tenant" : "",
                            });
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="选择类型" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {REF_TYPE_OPTIONS.map((item) => (
                                <SelectItem key={item.value} value={item.value}>
                                  {item.label}
                                </SelectItem>
                              ))}
                              <SelectItem value="commit">Commit</SelectItem>
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field>
                        <FieldLabel>来源版本</FieldLabel>
                        <ReleaseRefCombobox
                          type={tagSourceRefType}
                          value={tagSourceRef}
                          defaultRef={currentEnvironment?.default_ref || "feature/multi-tenant"}
                          disabled={!options?.configured}
                          onChange={(value) => setDraft({ tagSourceRef: value })}
                        />
                        <FieldDescription>
                          建议选择已验收通过的 Commit；也可以选择分支或已有 Tag 作为来源。
                        </FieldDescription>
                      </Field>
                    </div>

                    <Field>
                      <FieldLabel htmlFor="release-tag-message">Tag 说明</FieldLabel>
                      <Textarea
                        id="release-tag-message"
                        value={tagMessage}
                        onChange={(event) => setDraft({ tagMessage: event.target.value })}
                        rows={3}
                        placeholder="说明这个生产版本包含的内容"
                      />
                    </Field>
                  </>
                )}
              </>
            ) : (
              <>
                <Field>
                  <FieldLabel>版本来源</FieldLabel>
                  <Select value={refType} onValueChange={(value) => onRefTypeChange(value as ReleaseRefType)}>
                    <SelectTrigger>
                      <SelectValue placeholder="选择版本来源" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {REF_TYPE_OPTIONS.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FieldDescription>
                    {REF_TYPE_OPTIONS.find((item) => item.value === refType)?.description}
                  </FieldDescription>
                </Field>

                <Field>
                  <FieldLabel>发布版本</FieldLabel>
                  <ReleaseRefCombobox
                    type={refType}
                    value={ref}
                    defaultRef={currentEnvironment?.default_ref || "feature/multi-tenant"}
                    disabled={!options?.configured}
                    onChange={(value) => setDraft({ ref: value })}
                  />
                  <FieldDescription>开发环境默认使用 feature/multi-tenant，也可以选择 Tag。</FieldDescription>
                </Field>
              </>
            )}

            <Field>
              <FieldLabel htmlFor="release-reason">发布说明</FieldLabel>
              <Textarea
                id="release-reason"
                value={reason}
                onChange={(event) => setDraft({ reason: event.target.value })}
                rows={3}
                placeholder="说明本次发布内容或关联事项"
              />
            </Field>

            {production ? (
              <Field>
                <FieldLabel htmlFor="release-confirm">生产确认</FieldLabel>
                <Input
                  id="release-confirm"
                  value={confirmText}
                  onChange={(event) => setDraft({ confirmText: event.target.value })}
                  placeholder="输入：确认发布生产"
                />
                <FieldDescription>生产发布会触发构建并重建对应生产容器。</FieldDescription>
              </Field>
            ) : null}
          </FieldGroup>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" disabled={disabled}>
                {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Rocket data-icon="inline-start" />}
                {creatingProductionTag ? "创建 Tag 并提交发布" : "提交发布"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{production ? "确认发布生产版本" : "确认发布开发环境"}</AlertDialogTitle>
                <AlertDialogDescription>
                  将提交 {currentEnvironment?.label || "-"} 的 {selectedServiceLabel || "-"} 发布任务，版本为 {confirmRefLabel}。
                  {creatingProductionTag ? " 系统会先创建这个 Tag，再发起生产发布。" : ""}
                  任务提交后请在 GitHub Actions 或发布记录中查看执行状态。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction onClick={runDispatch}>确认提交</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Tag data-icon="inline-start" />
            发布辅助
          </CardTitle>
          <CardDescription>从成功 Commit 选择生产来源，或生成回滚 Tag。</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-2">
              <div className="text-sm font-medium">成功 Commit</div>
              <Badge variant="outline">
                {successfulRefEnvironmentLabel(successfulRefEnvironment)} · {currentSuccessfulRefsPagination.total}
              </Badge>
              {successfulRefsRefreshing ? <Loader2 className="animate-spin text-muted-foreground" data-icon="inline-start" /> : null}
            </div>
            <div className="grid gap-2 sm:grid-cols-[120px_minmax(220px,1fr)] lg:w-[420px]">
              <Select
                value={successfulRefEnvironment}
                onValueChange={(value) => setSuccessfulRefEnvironment(value as ReleaseSearchEnvironment)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="环境" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="production">生产</SelectItem>
                    <SelectItem value="dev">开发</SelectItem>
                    <SelectItem value="all">全部</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Input
                value={successfulRefKeyword}
                onChange={(event) => setSuccessfulRefKeyword(event.target.value)}
                placeholder="搜索 SHA / 标题 / 分支"
              />
            </div>
          </div>
          {currentSuccessfulRefs.length === 0 ? (
            <div className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
              {successfulRefKeyword.trim() ? "未找到匹配发布版本" : "暂无成功发布版本"}
            </div>
          ) : (
            <TooltipProvider delayDuration={200}>
              {currentSuccessfulRefs.map((item) => (
                <div
                  key={`${item.environment}-${item.id}`}
                  className="flex items-center justify-between gap-3 border-b py-2 last:border-b-0"
                >
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <Badge variant="outline" className="shrink-0">{item.workflow_label}</Badge>
                      <span className="truncate text-sm font-medium">{item.head_sha.slice(0, 7)}</span>
                    </div>
                    <TruncatedTooltipText
                      value={item.title}
                      className="mt-1 text-xs text-muted-foreground"
                    />
                    <TruncatedTooltipText
                      value={getSuccessfulRefDescription(item)}
                      className="mt-0.5 text-xs text-muted-foreground"
                    />
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                {item.html_url ? (
                  <Button asChild variant="ghost" size="icon" title="查看发布记录">
                    <Link href={item.html_url} target="_blank" rel="noreferrer">
                      <ExternalLink data-icon="icon-only" />
                    </Link>
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => applySuccessfulRef(item)}
                >
                  作为来源
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={Boolean(rollbackPendingId)}
                  onClick={() => runCreateRollbackTag(item)}
                >
                  {rollbackPendingId === item.id ? (
                    <Loader2 className="animate-spin" data-icon="inline-start" />
                  ) : (
                    <Tag data-icon="inline-start" />
                  )}
                  回滚 Tag
                </Button>
                <AlertDialog onOpenChange={(open) => {
                  if (open) setRollbackConfirmText("");
                }}>
                  <AlertDialogTrigger asChild>
                    <Button type="button" variant="destructive" size="sm" disabled={Boolean(rollbackPendingId)}>
                      <RotateCcw data-icon="inline-start" />
                      回滚发布
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>确认回滚生产环境</AlertDialogTitle>
                      <AlertDialogDescription>
                        将基于 {item.head_sha.slice(0, 7)} 创建回滚 Tag，并发布生产环境全部服务。该操作会重建生产容器。
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <FieldGroup>
                      <Field>
                        <FieldLabel htmlFor={`rollback-confirm-${item.id}`}>确认文本</FieldLabel>
                        <Input
                          id={`rollback-confirm-${item.id}`}
                          value={rollbackConfirmText}
                          onChange={(event) => setRollbackConfirmText(event.target.value)}
                          placeholder="输入：确认回滚生产"
                        />
                        <FieldDescription>输入确认文本后才能提交生产回滚。</FieldDescription>
                      </Field>
                    </FieldGroup>
                    <AlertDialogFooter>
                      <AlertDialogCancel>取消</AlertDialogCancel>
                      <AlertDialogAction
                        disabled={rollbackConfirmText !== "确认回滚生产" || Boolean(rollbackPendingId)}
                        onClick={() => runRollbackDispatch(item)}
                      >
                        {rollbackPendingId === item.id ? (
                          <Loader2 className="animate-spin" data-icon="inline-start" />
                        ) : (
                          <RotateCcw data-icon="inline-start" />
                        )}
                        确认回滚
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                  </div>
                </div>
              ))}
            </TooltipProvider>
          )}
          <p className="text-xs text-muted-foreground">
            “作为来源”会把 Commit 填入左侧创建新 Tag 流程；“回滚 Tag”只创建并填入发布版本；“回滚发布”会创建 Tag 并提交生产全部服务回滚。
          </p>
          <CompactPagination
            pagination={currentSuccessfulRefsPagination}
            pending={successfulRefsRefreshing}
            onPageChange={changeSuccessfulRefsPage}
          />
        </CardContent>
      </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">最近发布记录</CardTitle>
            <CardDescription>
              读取 GitHub Actions 最近运行记录，包含手动发布和 dev 自动发布。
              {lastRunsRefreshedAt ? ` 最近刷新 ${formatDateTime(lastRunsRefreshedAt)}` : ""}
              {runsPollError ? ` ${runsPollError}` : ""}
            </CardDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge variant={hasActiveRuns ? "warning" : "outline"}>
              {hasActiveRuns ? "自动刷新中" : "状态已稳定"}
            </Badge>
            <Badge variant="outline">{currentRunsPagination.total} 条</Badge>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-7 rounded-md"
              onClick={() => void refreshReleaseSnapshots()}
              disabled={runsRefreshing}
              aria-label="刷新发布记录"
              title="刷新发布记录"
            >
              <RefreshCw className={cn(runsRefreshing && "animate-spin")} data-icon="icon-only" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>环境</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>服务</TableHead>
                <TableHead>版本</TableHead>
                <TableHead>时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {currentRuns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-sm text-muted-foreground">
                    暂无发布记录
                  </TableCell>
                </TableRow>
              ) : currentRuns.map((run) => (
                <TableRow key={`${run.environment}-${run.id}`}>
                  <TableCell>
                    <div className="font-medium">{run.workflow_label}</div>
                    <div className="text-xs text-muted-foreground">{run.workflow_id}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(run)}>{statusLabel(run)}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={run.service_label === "未记录" ? "secondary" : "outline"}>
                      {run.service_label}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="max-w-[260px] truncate text-sm">{run.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {run.head_branch || "-"} · {run.head_sha?.slice(0, 7) || "-"}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDateTime(run.created_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <ReleaseRunDetailsDialog run={run} />
                      {run.html_url ? (
                        <Button asChild variant="ghost" size="sm">
                          <Link href={run.html_url} target="_blank" rel="noreferrer">
                            <ExternalLink data-icon="inline-start" />
                            日志
                          </Link>
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <CompactPagination
            pagination={currentRunsPagination}
            pending={runsRefreshing}
            onPageChange={changeRunsPage}
          />
        </CardContent>
      </Card>
    </div>
  );
}
