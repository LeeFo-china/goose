"use client";

import { Fragment } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, Gauge, HardDrive, Loader2, MemoryStick, Pause, Play, RefreshCw } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { OpsSection } from "@/components/ops/ops-section";
import type { OpsSystemMetrics } from "@/components/ops/ops-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { requestBackendJson } from "@/lib/backend-client";
import { cn } from "@/lib/utils";

const AUTO_REFRESH_INTERVAL_MS = 2000;
const ERROR_REFRESH_INTERVAL_MS = 8000;

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function formatMb(value: number) {
  if (!Number.isFinite(value)) return "-";
  if (value >= 1024) return `${(value / 1024).toFixed(1)} GB`;
  return `${value.toFixed(0)} MB`;
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
    second: "2-digit",
  });
}

async function requestMetrics() {
  return requestBackendJson<OpsSystemMetrics>("/admin/ops/system-metrics", {
    cache: "no-store",
    fallbackMessage: "资源指标加载失败",
  });
}

function ResourceMetric({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: number;
  detail: string;
  icon: React.ReactNode;
}) {
  const percent = clampPercent(value);
  return (
    <div className="flex flex-col gap-2 py-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
          {icon}
          <span className="truncate">{label}</span>
        </div>
        <div className="text-sm font-semibold tabular-nums">{percent.toFixed(1)}%</div>
      </div>
      <div className="h-1.5 rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full",
            percent >= 85 ? "bg-destructive" : percent >= 70 ? "bg-warning" : "bg-primary",
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}

function TextMetric({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm font-medium">
          {icon}
          <span>{label}</span>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
      </div>
      <div className="text-right text-base font-semibold tabular-nums">{value}</div>
    </div>
  );
}

export function SystemMetricsPanel() {
  const [metrics, setMetrics] = useState<OpsSystemMetrics | null>(null);
  const [error, setError] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);
  const [lastAutoFailed, setLastAutoFailed] = useState(false);
  const [manualPending, setManualPending] = useState(false);
  const hasMetricsRef = useRef(false);
  const loadingRef = useRef(false);

  const loadMetrics = useCallback(async (options?: { manual?: boolean }) => {
    const manual = Boolean(options?.manual);
    if (loadingRef.current && !manual) {
      return null;
    }

    loadingRef.current = true;
    if (manual) {
      setManualPending(true);
      setError("");
    }

    try {
      const data = await requestMetrics();
      setMetrics(data);
      hasMetricsRef.current = true;
      setLastAutoFailed(false);
      if (manual) setError("");
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "资源指标加载失败";
      if (!manual) {
        setLastAutoFailed(true);
      }
      if (manual || !hasMetricsRef.current) {
        setError(message);
      }
      return false;
    } finally {
      loadingRef.current = false;
      if (manual) setManualPending(false);
    }
  }, []);

  useEffect(() => {
    void loadMetrics({ manual: true });
  }, [loadMetrics]);

  useEffect(() => {
    const syncPageVisible = () => {
      setPageVisible(!document.hidden);
    };

    syncPageVisible();
    document.addEventListener("visibilitychange", syncPageVisible);
    return () => document.removeEventListener("visibilitychange", syncPageVisible);
  }, []);

  useEffect(() => {
    if (!autoRefresh || !pageVisible) return;

    let cancelled = false;
    let timer: number | undefined;

    const schedule = (delay: number) => {
      timer = window.setTimeout(async () => {
        const ok = await loadMetrics();
        if (cancelled) return;
        schedule(ok === false ? ERROR_REFRESH_INTERVAL_MS : AUTO_REFRESH_INTERVAL_MS);
      }, delay);
    };

    schedule(lastAutoFailed ? ERROR_REFRESH_INTERVAL_MS : AUTO_REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [autoRefresh, lastAutoFailed, loadMetrics, pageVisible]);

  useEffect(() => {
    if (autoRefresh && pageVisible) {
      void loadMetrics();
    }
  }, [autoRefresh, loadMetrics, pageVisible]);

  const loadAverage = useMemo(() => {
    return metrics?.server.load_average?.map((value) => value.toFixed(2)).join(" / ") || "-";
  }, [metrics]);
  const resourceMetrics = [
    {
      key: "cpu",
      node: (
        <ResourceMetric
          label="CPU"
          value={metrics?.server.cpu_usage_percent ?? 0}
          detail="实时采样"
          icon={<Gauge className="size-4" />}
        />
      ),
    },
    {
      key: "memory",
      node: (
        <ResourceMetric
          label="内存"
          value={metrics?.server.memory.usage_percent ?? 0}
          detail={metrics ? `${formatMb(metrics.server.memory.used_mb)} / ${formatMb(metrics.server.memory.total_mb)}` : "-"}
          icon={<MemoryStick className="size-4" />}
        />
      ),
    },
    {
      key: "disk",
      node: (
        <ResourceMetric
          label="磁盘"
          value={metrics?.server.disk.usage_percent ?? 0}
          detail={metrics ? `${formatMb(metrics.server.disk.used_mb)} / ${formatMb(metrics.server.disk.total_mb)}` : "-"}
          icon={<HardDrive className="size-4" />}
        />
      ),
    },
    {
      key: "load",
      node: (
        <TextMetric
          label="Load Average"
          value={loadAverage}
          detail={`最近检查 ${formatDateTime(metrics?.checked_at)}`}
          icon={<Activity className="size-4" />}
        />
      ),
    },
  ];

  return (
    <OpsSection
      title="实时资源状态"
      description="前台每 2 秒刷新一次，页面隐藏时暂停，失败后自动降频重试。"
      actions={
        <>
          <Badge variant={autoRefresh && pageVisible ? "success" : "outline"}>
            {autoRefresh ? pageVisible ? "自动刷新" : "页面隐藏暂停" : "已暂停"}
          </Badge>
          <Badge variant={lastAutoFailed ? "warning" : "outline"}>
            {lastAutoFailed ? "8 秒重试" : "2 秒刷新"}
          </Badge>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-6 rounded-md"
            onClick={() => setAutoRefresh((value) => !value)}
            aria-label={autoRefresh ? "暂停自动刷新" : "继续自动刷新"}
            title={autoRefresh ? "暂停自动刷新" : "继续自动刷新"}
          >
            {autoRefresh ? <Pause data-icon="icon-only" /> : <Play data-icon="icon-only" />}
          </Button>
          <Button
            type="button"
            size="icon"
            className="size-6 rounded-md"
            onClick={() => void loadMetrics({ manual: true })}
            disabled={manualPending}
            aria-label="刷新资源状态"
            title="刷新资源状态"
          >
            {manualPending ? <Loader2 className="animate-spin" data-icon="icon-only" /> : <RefreshCw data-icon="icon-only" />}
          </Button>
        </>
      }
    >
      {error ? <StatusAlert>{error}</StatusAlert> : null}

      <div className="flex flex-col">
        {resourceMetrics.map((item, index) => (
          <Fragment key={item.key}>
            {index > 0 ? <Separator /> : null}
            {item.node}
          </Fragment>
        ))}
      </div>
    </OpsSection>
  );
}
