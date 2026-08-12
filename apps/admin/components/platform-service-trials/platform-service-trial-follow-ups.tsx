"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageSquareText, RefreshCw } from "lucide-react";

import { StatusAlert } from "@/components/admin/status-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { requestBackendJson } from "@/lib/backend-client";

import { PlatformServiceTrialFollowUpForm } from "./platform-service-trial-follow-up-form";
import { formatTrialDateTime } from "./platform-service-trial-rules";
import type {
  PlatformServiceTrialFollowUp,
  PlatformServiceTrialFollowUpPage,
} from "./platform-service-trial-types";

export function PlatformServiceTrialFollowUps({
  trialId,
  enabled,
  canManage,
  onTrialRefresh,
}: {
  trialId: string;
  enabled: boolean;
  canManage: boolean;
  onTrialRefresh: () => Promise<void>;
}) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PlatformServiceTrialFollowUpPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestVersion = useRef(0);

  const loadPage = useCallback(async (targetPage: number) => {
    const version = ++requestVersion.current;
    setLoading(true);
    setError("");
    try {
      const result = await requestBackendJson<PlatformServiceTrialFollowUpPage>(
        `/platform/billing/service-trials/${trialId}/follow-ups?page=${targetPage}&pageSize=10`,
        { fallbackMessage: "试用跟进记录加载失败" },
      );
      if (requestVersion.current !== version) return;
      setPage(targetPage);
      setData(result);
    } catch (caught) {
      if (requestVersion.current === version) {
        setError(caught instanceof Error ? caught.message : "试用跟进记录加载失败");
      }
    } finally {
      if (requestVersion.current === version) setLoading(false);
    }
  }, [trialId]);

  useEffect(() => {
    if (!enabled) {
      requestVersion.current += 1;
      return;
    }
    setPage(1);
    setData(null);
    void loadPage(1);
    return () => {
      requestVersion.current += 1;
    };
  }, [enabled, loadPage]);

  const pagination = data?.pagination;
  const totalPages = Math.max(1, pagination?.totalPages || 1);

  return (
    <section className="flex flex-col gap-3" aria-labelledby={`trial-follow-ups-${trialId}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 id={`trial-follow-ups-${trialId}`} className="text-base font-semibold">运营跟进</h3>
          <p className="text-xs text-muted-foreground">最近沟通结果与后续跟进安排</p>
        </div>
        <PlatformServiceTrialFollowUpForm
          trialId={trialId}
          canManage={canManage}
          onCreated={async () => {
            await Promise.all([loadPage(1), onTrialRefresh()]);
          }}
        />
      </div>

      {error ? (
        <div className="flex flex-col gap-2">
          <StatusAlert>{error}</StatusAlert>
          <Button type="button" size="sm" variant="outline" className="self-start" onClick={() => void loadPage(page)}>
            <RefreshCw data-icon="inline-start" />
            重新加载跟进
          </Button>
        </div>
      ) : null}

      {loading && !data ? <FollowUpSkeleton /> : null}
      {!loading && data?.list.length === 0 ? (
        <Empty className="min-h-40 border">
          <EmptyHeader>
            <EmptyMedia variant="icon"><MessageSquareText /></EmptyMedia>
            <EmptyTitle>暂无跟进记录</EmptyTitle>
            <EmptyDescription>记录首次沟通后，这里会形成按时间排列的运营事实。</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}
      {data?.list.length ? (
        <ol className="flex flex-col">
          {data.list.map((followUp) => <FollowUpItem key={followUp.id} followUp={followUp} />)}
        </ol>
      ) : null}

      {data && data.pagination.total > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="tabular-nums">
            第 {data.pagination.page} / {totalPages} 页，共 {data.pagination.total} 条
          </span>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" disabled={loading || page <= 1} onClick={() => void loadPage(page - 1)}>上一页</Button>
            <Button type="button" size="sm" variant="outline" disabled={loading || page >= totalPages} onClick={() => void loadPage(page + 1)}>下一页</Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function FollowUpItem({ followUp }: { followUp: PlatformServiceTrialFollowUp }) {
  return (
    <li className="grid gap-2 border-b py-3 first:pt-0 last:border-b-0 last:pb-0 sm:grid-cols-[10rem_1fr]">
      <div className="flex flex-col gap-1 text-xs text-muted-foreground">
        <time className="tabular-nums">{formatTrialDateTime(followUp.created_at)}</time>
        <span>{followUpTypeLabel(followUp.follow_up_type)}</span>
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{followUp.summary}</span>
          <Badge variant={followUp.status === "pending" ? "warning" : followUp.status === "completed" ? "success" : "secondary"}>
            {followUpStatusLabel(followUp.status)}
          </Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{followUp.result}</p>
        {followUp.next_follow_up_at ? (
          <p className="mt-1 text-xs tabular-nums text-muted-foreground">
            下次跟进：{formatTrialDateTime(followUp.next_follow_up_at)}
          </p>
        ) : null}
      </div>
    </li>
  );
}

function FollowUpSkeleton() {
  return <div className="flex flex-col gap-3">{Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-20 w-full" />)}</div>;
}

function followUpTypeLabel(type: PlatformServiceTrialFollowUp["follow_up_type"]) {
  return ({ phone: "电话", wechat: "微信", online_meeting: "线上会议", onsite: "现场沟通", other: "其他" } as const)[type];
}

function followUpStatusLabel(status: PlatformServiceTrialFollowUp["status"]) {
  return ({ pending: "待继续", completed: "已完成", canceled: "已取消" } as const)[status];
}
