"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, ExternalLink, GitBranch, GitCommit, Loader2, Rocket, ShieldCheck, Tag } from "lucide-react";
import { toast } from "sonner";
import { StatusAlert } from "@/components/admin/status-alert";
import { useReleaseDeploymentStore } from "@/components/ops/release-deployments-store";
import type {
  ReleaseCreateTagResult,
  ReleaseDispatchResult,
  ReleaseEnvironment,
  ReleaseOptionsData,
  ReleaseRefOption,
  ReleaseRefType,
  ReleaseRun,
  ReleaseService,
  ReleaseSuccessfulRef,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type ReleaseDeploymentsPanelProps = {
  options: ReleaseOptionsData | null;
  runs: ReleaseRun[];
  successfulRefs: ReleaseSuccessfulRef[];
  error?: string | null;
};

const REF_TYPE_OPTIONS: Array<{
  value: ReleaseRefType;
  label: string;
  description: string;
}> = [
  { value: "branch", label: "分支", description: "适合 dev 快速验证" },
  { value: "tag", label: "Tag", description: "适合生产发布" },
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

export function ReleaseDeploymentsPanel({ options, runs, successfulRefs, error }: ReleaseDeploymentsPanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tagPending, startTagTransition] = useTransition();
  const {
    environment,
    service,
    refType,
    ref,
    reason,
    confirmText,
    latestDispatch,
    tagName,
    tagSourceRefType,
    tagSourceRef,
    tagMessage,
    auxiliaryTab,
    rollbackPendingId,
    setDraft,
    resetEnvironment,
    resetRefType,
  } = useReleaseDeploymentStore();
  const currentEnvironment = useMemo(
    () => options?.environments.find((item) => item.environment === environment) || null,
    [environment, options],
  );

  function onEnvironmentChange(value: ReleaseEnvironment) {
    const nextEnvironment = options?.environments.find((item) => item.environment === value) || null;
    resetEnvironment({
      environment: value,
      defaultRef: nextEnvironment?.default_ref || "feature/multi-tenant",
      service: nextEnvironment?.services[0]?.value || "admin",
    });
  }

  function onRefTypeChange(value: ReleaseRefType) {
    resetRefType({
      refType: value,
      defaultRef: currentEnvironment?.default_ref || "feature/multi-tenant",
    });
  }

  function applySuccessfulRef(item: ReleaseSuccessfulRef) {
    setDraft({
      auxiliaryTab: "tag",
      tagSourceRefType: "commit",
      tagSourceRef: item.head_sha,
      tagMessage: tagMessage.trim() || `release from ${item.head_sha.slice(0, 7)}`,
    });
    toast.success("已填入创建 Tag 的来源 Commit，请先创建 Tag 后发布");
  }

  function runCreateTag() {
    startTagTransition(async () => {
      try {
        const data = await createReleaseTag({
          tag: tagName,
          source_ref: tagSourceRef,
          message: tagMessage,
        });
        setDraft({
          environment: "production",
          refType: "tag",
          ref: data.tag,
          confirmText: "",
          reason: reason.trim() || `发布 ${data.tag}`,
          tagName: "",
          tagSourceRefType: "branch",
          tagSourceRef: currentEnvironment?.default_ref || "feature/multi-tenant",
          tagMessage: "",
        });
        toast.success(data.message || "发布 Tag 已创建");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "发布 Tag 创建失败");
      }
    });
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
        auxiliaryTab: "successful",
      });
      toast.success(data.message || "回滚 Tag 已创建，请确认后发布生产");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "回滚 Tag 创建失败");
    } finally {
      setDraft({ rollbackPendingId: "" });
    }
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
        setDraft({ latestDispatch: data });
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
  const createTagDisabled = tagPending || !options?.configured || !tagName.trim() || !tagSourceRef.trim() || !tagMessage.trim();

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_420px]">
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
                  生产只允许 Tag；如需发布指定 Commit，请先在右侧创建 Tag。
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
              <Select value={service} onValueChange={(value) => setDraft({ service: value as ReleaseService })}>
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
                onChange={(value) => setDraft({ ref: value })}
              />
              <FieldDescription>
                {production ? "生产环境只能选择 Tag。" : "开发环境默认使用 feature/multi-tenant，也可以选择 Tag。"}
              </FieldDescription>
            </Field>

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
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Tag data-icon="inline-start" />
            发布辅助
          </CardTitle>
          <CardDescription>创建生产 Tag，或基于成功 Commit 生成回滚 Tag。</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs
            value={auxiliaryTab}
            onValueChange={(value) => setDraft({ auxiliaryTab: value as "tag" | "successful" })}
            className="flex flex-col gap-4"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="tag">创建 Tag</TabsTrigger>
              <TabsTrigger value="successful">
                成功 Commit
                <span className="ml-2 text-xs text-muted-foreground">{successfulRefs.length}</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="tag" className="mt-0 flex flex-col gap-4">
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="release-tag-name">Tag 名称</FieldLabel>
                  <Input
                    id="release-tag-name"
                    value={tagName}
                    onChange={(event) => setDraft({ tagName: event.target.value })}
                    placeholder={getTodayTagPlaceholder()}
                  />
                  <FieldDescription>格式固定为 vYYYY.MM.DD.N，例如 v2026.05.17.2。</FieldDescription>
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
              </FieldGroup>

              <Button type="button" variant="outline" disabled={createTagDisabled} onClick={runCreateTag}>
                {tagPending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Tag data-icon="inline-start" />}
                创建并填入 Tag
              </Button>
            </TabsContent>

            <TabsContent value="successful" className="mt-0 flex flex-col gap-2">
              {successfulRefs.length === 0 ? (
                <div className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
                  暂无成功发布版本
                </div>
              ) : successfulRefs.map((item) => (
                <div
                  key={`${item.environment}-${item.id}`}
                  className="flex items-center justify-between gap-3 border-b py-2 last:border-b-0"
                >
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <Badge variant="outline" className="shrink-0">{item.workflow_label}</Badge>
                      <span className="truncate text-sm font-medium">{item.head_sha.slice(0, 7)}</span>
                    </div>
                    <div className="mt-1 truncate text-xs text-muted-foreground">{item.title}</div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">{item.description}</div>
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
                  </div>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                回滚 Tag 只会创建并填入生产发布版本，不会自动提交生产发布。
              </p>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      </div>

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
