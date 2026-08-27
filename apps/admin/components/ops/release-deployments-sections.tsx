"use client";

import Link from "next/link";
import { ExternalLink, Loader2, RefreshCw, RotateCcw, ShieldCheck, Tag } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { ReleaseEnvironment, ReleaseRefType } from "@/components/ops/ops-types";
import { cn } from "@/lib/utils";
import { CompactPagination, successfulRefEnvironmentLabel } from "@/components/ops/release-deployments-controls";
import { ReleaseRunDetailsDialog, TruncatedTooltipText } from "@/components/ops/release-deployments-dialogs";
import { formatDateTime, getSuccessfulRefDescription, statusLabel, statusVariant, type ReleaseSearchEnvironment } from "@/components/ops/release-deployments-shared";

export function SuccessfulRefsCard({ state, actions, embedded = false }: { state: any; actions: any; embedded?: boolean }) {
  const { successfulRefEnvironment, currentSuccessfulRefsPagination, successfulRefsRefreshing, successfulRefKeyword, currentSuccessfulRefs, rollbackPendingId, rollbackConfirmText } = state;
  const { setSuccessfulRefEnvironment, setSuccessfulRefKeyword, applySuccessfulRef, runCreateRollbackTag, setRollbackConfirmText, runRollbackDispatch, changeSuccessfulRefsPage } = actions;
  const content = (
        <div className="flex flex-col gap-3">
          <div className={cn("flex flex-col gap-3", !embedded && "lg:flex-row lg:items-center lg:justify-between")}>
            <div className="flex items-center gap-2">
              <div className="text-sm font-medium">{embedded ? "选择已部署来源" : "成功 Commit"}</div>
              <Badge variant="outline">
                {successfulRefEnvironmentLabel(successfulRefEnvironment)} · {currentSuccessfulRefsPagination.total}
              </Badge>
              {successfulRefsRefreshing ? <Loader2 className="animate-spin text-muted-foreground" data-icon="inline-start" /> : null}
            </div>
            <div className={cn("grid gap-2", embedded ? "2xl:grid-cols-[120px_minmax(220px,1fr)]" : "sm:grid-cols-[120px_minmax(220px,1fr)] lg:w-[420px]")}>
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
              <div className={cn(embedded && "border-y xl:max-h-[520px] xl:overflow-y-auto")}>
              {currentSuccessfulRefs.map((item: any) => (
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
                      构建回滚候选
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>确认构建回滚候选</AlertDialogTitle>
                      <AlertDialogDescription>
                        将基于 {item.head_sha.slice(0, 7)} 创建回滚 Tag，并构建生产候选。本阶段不会修改生产容器。
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <FieldGroup>
                      <Field>
                        <FieldLabel htmlFor={`rollback-confirm-${item.id}`}>确认文本</FieldLabel>
                        <Input
                          id={`rollback-confirm-${item.id}`}
                          value={rollbackConfirmText}
                          onChange={(event) => setRollbackConfirmText(event.target.value)}
                          placeholder="输入：确认构建生产候选"
                        />
                        <FieldDescription>输入确认文本后才能构建回滚候选；生产部署仍需在候选证据区二次确认。</FieldDescription>
                      </Field>
                    </FieldGroup>
                    <AlertDialogFooter>
                      <AlertDialogCancel>取消</AlertDialogCancel>
                      <AlertDialogAction
                        disabled={rollbackConfirmText !== "确认构建生产候选" || Boolean(rollbackPendingId)}
                        onClick={() => runRollbackDispatch(item)}
                      >
                        {rollbackPendingId === item.id ? (
                          <Loader2 className="animate-spin" data-icon="inline-start" />
                        ) : (
                          <RotateCcw data-icon="inline-start" />
                        )}
                        确认构建候选
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                  </div>
                </div>
              ))}
              </div>
            </TooltipProvider>
          )}
          <p className="text-xs text-muted-foreground">
            {embedded
              ? "包含自动开发部署和手动发布成功记录；“作为来源”会把 Commit 填入创建新 Tag 流程，回滚候选不会修改生产容器。"
              : "“作为来源”会把 Commit 填入创建新 Tag 流程；“回滚 Tag”只创建并填入发布版本；“构建回滚候选”会创建 Tag 并提交生产候选构建。"}
          </p>
          <CompactPagination
            pagination={currentSuccessfulRefsPagination}
            pending={successfulRefsRefreshing}
            onPageChange={changeSuccessfulRefsPage}
          />
        </div>
  );
  if (embedded) return content;
  return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Tag data-icon="inline-start" />
            发布辅助
          </CardTitle>
          <CardDescription>从成功 Commit 选择生产来源，或生成回滚 Tag。</CardDescription>
        </CardHeader>
        <CardContent>{content}</CardContent>
      </Card>
  );
}

export function ReleaseRunsCard({ state, actions }: { state: any; actions: any }) {
  const { lastRunsRefreshedAt, runsPollError, hasActiveRuns, currentRunsPagination, runsRefreshing, currentRuns, selectedCandidateRunId } = state;
  const { refreshReleaseSnapshots, changeRunsPage, selectCandidateRun } = actions;
  return (
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
          <Table className="min-w-[760px]" containerClassName="overflow-x-auto">
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
              ) : currentRuns.map((run: any) => (
                <TableRow key={`${run.environment}-${run.id}`} data-state={selectedCandidateRunId === run.id ? "selected" : undefined}>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-2 font-medium">
                      <span>{run.workflow_label}</span>
                      {run.legacy ? <Badge variant="outline">历史任务</Badge> : null}
                    </div>
                    <div className="text-xs text-muted-foreground">{run.workflow_id}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(run)}>{run.legacy ? statusLabel(run) : run.stage_label}</Badge>
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
                      {canSelectCandidateRun(run) ? (
                        <Button
                          type="button"
                          variant={selectedCandidateRunId === run.id ? "default" : "outline"}
                          size="sm"
                          onClick={() => selectCandidateRun(run.id)}
                        >
                          <ShieldCheck data-icon="inline-start" />
                          部署候选
                        </Button>
                      ) : null}
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
  );
}

function canSelectCandidateRun(run: any) {
  return run.environment === "production" && run.stage === "ready_to_deploy" && !run.legacy;
}
