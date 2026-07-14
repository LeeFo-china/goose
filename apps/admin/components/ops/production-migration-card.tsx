"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Database, GitBranch, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ReleaseMigrationMode, ReleaseOptionsData, ReleaseProductionMigrationPrecheckResult, ReleaseRefType } from "@/components/ops/ops-types";
import { ReleaseRefCombobox } from "@/components/ops/release-deployments-controls";
import { dispatchProductionMigration, dispatchProductionMigrationPrecheck, fetchProductionMigrationPrecheck, REF_TYPE_OPTIONS } from "@/components/ops/release-deployments-shared";
import { formatDateTime } from "@/components/ops/release-deployments-shared";

export function ProductionMigrationCard({
  options,
  onSubmitted,
}: {
  options: ReleaseOptionsData | null;
  onSubmitted: () => void;
}) {
  const migrationOptions = options?.production_migration;
  const defaultRef = migrationOptions?.default_ref || "main";
  const [pending, startTransition] = useTransition();
  const [precheckPending, startPrecheckTransition] = useTransition();
  const [mode, setMode] = useState<ReleaseMigrationMode>("plan");
  const [refType, setRefType] = useState<Exclude<ReleaseRefType, "commit">>("branch");
  const [ref, setRef] = useState(defaultRef);
  const [reason, setReason] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [precheckRunId, setPrecheckRunId] = useState("");
  const [precheck, setPrecheck] = useState<ReleaseProductionMigrationPrecheckResult | null>(null);
  const [precheckError, setPrecheckError] = useState("");

  const disabled = pending
    || !options?.configured
    || !migrationOptions
    || !ref.trim()
    || (mode === "apply" && confirmText !== "确认迁移生产数据库");
  const precheckDisabled = precheckPending || !options?.configured || !migrationOptions || !ref.trim();
  const modeLabel = mode === "apply" ? "执行" : "预检查";

  async function loadPrecheckResult(runId: string) {
    const data = await fetchProductionMigrationPrecheck(runId);
    setPrecheck(data);
    setPrecheckError("");
    return data;
  }

  function runPrecheckDispatch() {
    startPrecheckTransition(async () => {
      try {
        setPrecheckError("");
        const data = await dispatchProductionMigrationPrecheck({
          ref_type: refType,
          ref,
          reason: reason || "生产数据库迁移对比预检查",
        });
        const nextRunId = data.run?.id || "";
        setPrecheckRunId(nextRunId);
        toast.success(data.message || "生产数据库迁移对比预检查已提交");
        if (nextRunId) {
          await loadPrecheckResult(nextRunId);
        } else {
          setPrecheck(null);
        }
        onSubmitted();
      } catch (err) {
        setPrecheckError(err instanceof Error ? err.message : "迁移对比预检查提交失败");
      }
    });
  }

  function refreshPrecheckResult() {
    if (!precheckRunId) return;
    startPrecheckTransition(async () => {
      try {
        await loadPrecheckResult(precheckRunId);
      } catch (err) {
        setPrecheckError(err instanceof Error ? err.message : "迁移对比结果加载失败");
      }
    });
  }

  function runMigrationDispatch() {
    startTransition(async () => {
      try {
        const data = await dispatchProductionMigration({
          mode,
          ref_type: refType,
          ref,
          reason,
          confirm_text: mode === "apply" ? confirmText : undefined,
        });
        toast.success(data.message || "生产数据库迁移任务已提交");
        setConfirmText("");
        onSubmitted();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "生产数据库迁移任务提交失败");
      }
    });
  }

  useEffect(() => {
    if (!precheckRunId || precheck?.ready || precheck?.status === "completed") return;

    const timer = window.setTimeout(() => {
      refreshPrecheckResult();
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [precheckRunId, precheck?.ready, precheck?.status]);

  return (
    <div className="flex flex-col gap-4">
      {!options?.configured ? (
        <Alert variant="destructive">
          <ShieldCheck data-icon="inline-start" />
          <AlertTitle>发布令牌未配置</AlertTitle>
          <AlertDescription>后端需要配置 GITHUB_RELEASE_TOKEN 后才能发起数据库迁移。</AlertDescription>
        </Alert>
      ) : null}
      <Alert>
        <ShieldCheck data-icon="inline-start" />
        <AlertTitle>生产迁移规则</AlertTitle>
        <AlertDescription>
          apply 会先备份生产 public 与 supabase_migrations schema，再按未执行版本顺序应用 SQL。
        </AlertDescription>
      </Alert>

      <MigrationPrecheckPanel
        precheck={precheck}
        error={precheckError}
        pending={precheckPending}
        runId={precheckRunId}
        onRefresh={refreshPrecheckResult}
        onDispatch={runPrecheckDispatch}
        disabled={precheckDisabled}
      />

      <FieldGroup>
        <Field>
          <FieldLabel>Workflow</FieldLabel>
          <Input value={migrationOptions?.workflow_id || "-"} disabled />
        </Field>

        <Field>
          <FieldLabel>模式</FieldLabel>
          <Select
            value={mode}
            onValueChange={(value) => {
              setMode(value as ReleaseMigrationMode);
              setConfirmText("");
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="选择模式" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="plan">plan - 只预检查</SelectItem>
                <SelectItem value="apply">apply - 执行迁移</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <FieldDescription>
            plan 只展示待执行版本；apply 会修改生产数据库。
          </FieldDescription>
        </Field>

        <div className="grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)]">
          <Field>
            <FieldLabel>来源类型</FieldLabel>
            <Select
              value={refType}
              onValueChange={(value) => {
                const nextType = value as Exclude<ReleaseRefType, "commit">;
                setRefType(nextType);
                setRef(nextType === "branch" ? defaultRef : "");
                setPrecheck(null);
                setPrecheckRunId("");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="选择类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {REF_TYPE_OPTIONS.filter((item) => item.value !== "commit").map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>迁移版本</FieldLabel>
            <ReleaseRefCombobox
              type={refType}
              value={ref}
              defaultRef={defaultRef}
              disabled={!options?.configured}
              onChange={(value) => {
                setRef(value);
                setPrecheck(null);
                setPrecheckRunId("");
              }}
            />
            <FieldDescription>建议先刷新迁移对比，确认 pending 列表后再 apply。</FieldDescription>
          </Field>
        </div>

        <Field>
          <FieldLabel htmlFor="production-migration-reason">迁移说明</FieldLabel>
          <Textarea
            id="production-migration-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            placeholder="说明本次生产数据库迁移原因"
          />
        </Field>

        {mode === "apply" ? (
          <Field>
            <FieldLabel htmlFor="production-migration-confirm">生产迁移确认</FieldLabel>
            <Input
              id="production-migration-confirm"
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              placeholder="输入：确认迁移生产数据库"
            />
            <FieldDescription>执行前会创建备份，但仍需确认 SQL 已完成评审。</FieldDescription>
          </Field>
        ) : null}
      </FieldGroup>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button type="button" variant={mode === "apply" ? "destructive" : "outline"} disabled={disabled}>
            {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Database data-icon="inline-start" />}
            {modeLabel}生产数据库迁移
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认{modeLabel}生产数据库迁移</AlertDialogTitle>
            <AlertDialogDescription>
              将提交 {migrationOptions?.label || "生产数据库迁移"} 任务，模式为 {mode}，版本为 {ref}。
              {mode === "apply" ? ` ${applyPrecheckCopy(precheck)}` : " 该操作只生成待迁移清单。"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={runMigrationDispatch}>
              确认提交
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function applyPrecheckCopy(precheck: ReleaseProductionMigrationPrecheckResult | null) {
  if (!precheck?.ready) return "建议先刷新迁移对比；该操作会修改生产数据库。";
  if (precheck.needs_migration) {
    return `最近预检查显示需要迁移，将执行 ${precheck.pending_count ?? 0} 个 migration。`;
  }
  return "最近预检查显示无需迁移，通常不需要执行 apply。";
}

function MigrationPrecheckPanel({
  precheck,
  error,
  pending,
  runId,
  onRefresh,
  onDispatch,
  disabled,
}: {
  precheck: ReleaseProductionMigrationPrecheckResult | null;
  error: string;
  pending: boolean;
  runId: string;
  onRefresh: () => void;
  onDispatch: () => void;
  disabled: boolean;
}) {
  const variant = precheck?.ready
    ? precheck.needs_migration ? "warning" : "success"
    : "outline";
  const label = precheck?.ready
    ? precheck.needs_migration ? "需要迁移" : "无需迁移"
    : runId ? "检查中" : "未检查";

  return (
    <div className="rounded-lg border bg-muted/20 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-semibold">迁移对比提示</div>
            <Badge variant={variant}>{label}</Badge>
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            {precheck?.message || "对比当前选择版本与生产库已执行 migration，判断 apply 前是否需要迁移。"}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {runId ? (
            <Button type="button" variant="outline" size="sm" onClick={onRefresh} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}
              刷新结果
            </Button>
          ) : null}
          <Button type="button" variant="outline" size="sm" onClick={onDispatch} disabled={disabled}>
            {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Database data-icon="inline-start" />}
            刷新迁移对比
          </Button>
        </div>
      </div>

      {error ? <div className="mt-3 text-sm text-destructive">{error}</div> : null}
      {precheck ? <MigrationPrecheckDetails precheck={precheck} /> : null}
    </div>
  );
}

function MigrationPrecheckDetails({ precheck }: { precheck: ReleaseProductionMigrationPrecheckResult }) {
  return (
    <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
      <MigrationPrecheckMetric label="待执行" value={String(precheck.pending_count ?? "-")} />
      <MigrationPrecheckMetric label="生产最新版本" value={precheck.before_latest || "-"} />
      <MigrationPrecheckMetric label="检查时间" value={formatDateTime(precheck.checked_at)} />
      <div className="md:col-span-3">
        <div className="text-xs text-muted-foreground">pending_versions</div>
        <div className="mt-1 flex flex-wrap gap-2">
          {precheck.pending_versions.length > 0 ? precheck.pending_versions.map((version) => (
            <Badge key={version} variant="outline">{version}</Badge>
          )) : (
            <span className="text-sm text-muted-foreground">none</span>
          )}
        </div>
      </div>
      {precheck.run_url ? (
        <div className="md:col-span-3">
          <Button asChild variant="link" className="h-auto p-0 text-xs">
            <Link href={precheck.run_url} target="_blank" rel="noreferrer">
              <GitBranch data-icon="inline-start" />
              查看预检查 Run
            </Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function MigrationPrecheckMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 break-all font-medium">{value || "-"}</div>
    </div>
  );
}
