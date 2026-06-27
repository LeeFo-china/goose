"use client";

import Link from "next/link";
import { ExternalLink, Loader2, RefreshCw, RotateCcw, Tag } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { CompactPagination, successfulRefEnvironmentLabel } from "@/components/ops/release-deployments-controls";
import { ReleaseRunDetailsDialog, TruncatedTooltipText } from "@/components/ops/release-deployments-dialogs";
import { formatDateTime, getSuccessfulRefDescription, statusLabel, statusVariant, type ReleaseSearchEnvironment } from "@/components/ops/release-deployments-shared";

export function SuccessfulRefsCard({ state, actions }: { state: any; actions: any }) {
  const { successfulRefEnvironment, currentSuccessfulRefsPagination, successfulRefsRefreshing, successfulRefKeyword, currentSuccessfulRefs, rollbackPendingId, rollbackConfirmText } = state;
  const { setSuccessfulRefEnvironment, setSuccessfulRefKeyword, applySuccessfulRef, runCreateRollbackTag, setRollbackConfirmText, runRollbackDispatch, changeSuccessfulRefsPage } = actions;
  return (
    <section className="space-y-3 border-t pt-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold tracking-normal">
            <Tag data-icon="inline-start" />
            发布辅助
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">从成功 Commit 选择生产来源，或生成回滚 Tag。</p>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2">
            <div className="text-sm font-medium">成功 Commit</div>
            <Badge variant="outline">
              {successfulRefEnvironmentLabel(successfulRefEnvironment)} / {currentSuccessfulRefsPagination.total}
            </Badge>
            {successfulRefsRefreshing ? <Loader2 className="animate-spin text-muted-foreground" data-icon="inline-start" /> : null}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center lg:w-[420px]">
            <Select
              value={successfulRefEnvironment}
              onValueChange={(value) => setSuccessfulRefEnvironment(value as ReleaseSearchEnvironment)}
            >
              <SelectTrigger className="sm:w-[120px]">
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
            {currentSuccessfulRefs.map((item: any) => (
              <div
                key={`${item.environment}-${item.id}`}
                className="flex flex-col gap-3 border-b py-3 last:border-b-0 lg:flex-row lg:items-center lg:justify-between"
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
                <div className="flex flex-wrap items-center gap-1 lg:justify-end">
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
      </div>
    </section>
  );
}

export function ReleaseRunsCard({ state, actions }: { state: any; actions: any }) {
  const { lastRunsRefreshedAt, runsPollError, hasActiveRuns, currentRunsPagination, runsRefreshing, currentRuns } = state;
  const { refreshReleaseSnapshots, changeRunsPage } = actions;
  return (
    <section className="space-y-3 border-t pt-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-normal">最近发布记录</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            读取 GitHub Actions 最近运行记录，包含手动发布和 dev 自动发布。
            {lastRunsRefreshedAt ? ` 最近刷新 ${formatDateTime(lastRunsRefreshedAt)}` : ""}
            {runsPollError ? ` ${runsPollError}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
      </div>
      {currentRuns.length === 0 ? (
        <div className="border-t py-10 text-center text-sm text-muted-foreground">
          暂无发布记录
        </div>
      ) : (
        <div className="overflow-x-auto border-t">
          <Table className="min-w-[940px]">
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
              {currentRuns.map((run: any) => (
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
                      {run.head_branch || "-"} / {run.head_sha?.slice(0, 7) || "-"}
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
        </div>
      )}
      <CompactPagination
        pagination={currentRunsPagination}
        pending={runsRefreshing}
        onPageChange={changeRunsPage}
      />
    </section>
  );
}
