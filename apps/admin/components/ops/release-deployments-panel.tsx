"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, ExternalLink, GitBranch, GitCommit, Loader2, Rocket, ShieldCheck, Tag } from "lucide-react";
import { toast } from "sonner";
import { StatusAlert } from "@/components/admin/status-alert";
import type {
  ReleaseEnvironment,
  ReleaseOptionsData,
  ReleaseRefOption,
  ReleaseRefType,
  ReleaseRun,
  ReleaseService,
} from "@/components/ops/ops-types";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

type ReleaseDeploymentsPanelProps = {
  options: ReleaseOptionsData | null;
  runs: ReleaseRun[];
  error?: string | null;
};

type DispatchResponse = {
  message: string;
  workflow_url: string;
};

const REF_TYPE_OPTIONS: Array<{
  value: ReleaseRefType;
  label: string;
  description: string;
}> = [
  { value: "branch", label: "分支", description: "适合 dev 快速验证" },
  { value: "tag", label: "Tag", description: "适合生产发布" },
  { value: "commit", label: "Commit", description: "按固定提交发布" },
];

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
  ref_type: ReleaseRefType;
  ref: string;
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
  return data.data as DispatchResponse;
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

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
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

function getRefTypeIcon(type: ReleaseRefType) {
  if (type === "tag") return Tag;
  if (type === "commit") return GitCommit;
  return GitBranch;
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
            <CommandEmpty>{loading ? "加载中..." : error || "没有匹配的版本"}</CommandEmpty>
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

export function ReleaseDeploymentsPanel({ options, runs, error }: ReleaseDeploymentsPanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [environment, setEnvironment] = useState<ReleaseEnvironment>("dev");
  const currentEnvironment = useMemo(
    () => options?.environments.find((item) => item.environment === environment) || null,
    [environment, options],
  );
  const [service, setService] = useState<ReleaseService>("admin");
  const [refType, setRefType] = useState<ReleaseRefType>("branch");
  const [ref, setRef] = useState("feature/multi-tenant");
  const [reason, setReason] = useState("");
  const [confirmText, setConfirmText] = useState("");

  function onEnvironmentChange(value: ReleaseEnvironment) {
    const nextEnvironment = options?.environments.find((item) => item.environment === value) || null;
    setEnvironment(value);
    const nextRefType = value === "production" ? "tag" : "branch";
    setRefType(nextRefType);
    setRef(nextRefType === "branch" ? nextEnvironment?.default_ref || "feature/multi-tenant" : "");
    setService(nextEnvironment?.services[0]?.value || "admin");
    setConfirmText("");
  }

  function onRefTypeChange(value: ReleaseRefType) {
    setRefType(value);
    setRef(value === "branch" ? currentEnvironment?.default_ref || "feature/multi-tenant" : "");
  }

  function runDispatch() {
    startTransition(async () => {
      try {
        const data = await dispatchRelease({
          environment,
          service,
          ref_type: refType,
          ref,
          reason,
          confirm_text: environment === "production" ? confirmText : undefined,
        });
        toast.success(data.message || "发布任务已提交");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "发布任务提交失败");
      }
    });
  }

  const serviceOptions = currentEnvironment?.services || [];
  const production = environment === "production";
  const disabled = pending || !options?.configured || !currentEnvironment || !ref.trim() || (production && confirmText !== "确认发布生产");

  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(360px,420px)_1fr]">
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
              <Select value={service} onValueChange={(value) => setService(value as ReleaseService)}>
                <SelectTrigger>
                  <SelectValue placeholder="选择服务" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {serviceOptions.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel>版本来源</FieldLabel>
              <Select value={refType} onValueChange={(value) => onRefTypeChange(value as ReleaseRefType)}>
                <SelectTrigger>
                  <SelectValue placeholder="选择版本来源" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {REF_TYPE_OPTIONS.map((item) => (
                      <SelectItem
                        key={item.value}
                        value={item.value}
                        disabled={production && item.value === "branch"}
                      >
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
                onChange={setRef}
              />
              <FieldDescription>
                {production ? "生产环境只能选择 Tag 或 Commit SHA。" : "开发环境默认使用 feature/multi-tenant，也可以选择最近提交。"}
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="release-reason">发布说明</FieldLabel>
              <Textarea
                id="release-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
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
                  onChange={(event) => setConfirmText(event.target.value)}
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
                提交发布
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{production ? "确认发布生产版本" : "确认发布开发环境"}</AlertDialogTitle>
                <AlertDialogDescription>
                  将提交 {currentEnvironment?.label || "-"} 的 {service} 发布任务，版本为 {ref || "-"}。
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
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">最近发布记录</CardTitle>
            <CardDescription>读取 GitHub Actions workflow_dispatch 记录。</CardDescription>
          </div>
          <Badge variant="outline">{runs.length} 条</Badge>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>环境</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>版本</TableHead>
                <TableHead>时间</TableHead>
                <TableHead className="text-right">日志</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-sm text-muted-foreground">
                    暂无发布记录
                  </TableCell>
                </TableRow>
              ) : runs.map((run) => (
                <TableRow key={`${run.environment}-${run.id}`}>
                  <TableCell>
                    <div className="font-medium">{run.workflow_label}</div>
                    <div className="text-xs text-muted-foreground">{run.workflow_id}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(run)}>{statusLabel(run)}</Badge>
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
                    {run.html_url ? (
                      <Button asChild variant="ghost" size="sm">
                        <Link href={run.html_url} target="_blank" rel="noreferrer">
                          <ExternalLink data-icon="inline-start" />
                          查看
                        </Link>
                      </Button>
                    ) : "-"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
