"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, Gauge, HardDrive, Loader2, MemoryStick, Pause, Play, RefreshCw } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import type { OpsSystemMetrics } from "@/components/ops/ops-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  const response = await fetch("/api/backend/admin/ops/system-metrics", {
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(payload.message || `资源指标加载失败(${response.status})`);
  }
  return payload.data as OpsSystemMetrics;
}

function RingMetric({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  const percent = clampPercent(value);
  return (
    <div className="flex items-center gap-4 rounded-md border p-4">
      <div
        className="relative grid size-20 place-items-center rounded-full"
        style={{
          background: `conic-gradient(hsl(var(--primary)) ${percent * 3.6}deg, hsl(var(--muted)) 0deg)`,
        }}
      >
        <div className="absolute inset-2 rounded-full bg-card" />
        <div className="relative text-lg font-semibold">{percent.toFixed(0)}%</div>
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {icon}
          {label}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">实时采样</div>
      </div>
    </div>
  );
}

function BarMetric({
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
    <div className="rounded-md border p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          {icon}
          {label}
        </div>
        <div className="text-sm font-semibold">{percent.toFixed(1)}%</div>
      </div>
      <div className="mt-3 h-2 rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full",
            percent >= 85 ? "bg-destructive" : percent >= 70 ? "bg-warning" : "bg-primary",
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="mt-2 text-xs text-muted-foreground">{detail}</div>
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

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle>实时资源状态</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            前台每 2 秒刷新一次，页面隐藏时暂停，失败后自动降频重试。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={autoRefresh && pageVisible ? "success" : "outline"}>
            {autoRefresh ? pageVisible ? "自动刷新" : "页面隐藏暂停" : "已暂停"}
          </Badge>
          <Badge variant={lastAutoFailed ? "warning" : "outline"}>
            {lastAutoFailed ? "8 秒重试" : "2 秒刷新"}
          </Badge>
          <Button type="button" variant="outline" onClick={() => setAutoRefresh((value) => !value)}>
            {autoRefresh ? <Pause data-icon="inline-start" /> : <Play data-icon="inline-start" />}
            {autoRefresh ? "暂停" : "继续"}
          </Button>
          <Button
            type="button"
            size="icon"
            onClick={() => void loadMetrics({ manual: true })}
            disabled={manualPending}
            aria-label="刷新资源状态"
            title="刷新资源状态"
          >
            {manualPending ? <Loader2 className="animate-spin" data-icon="icon-only" /> : <RefreshCw data-icon="icon-only" />}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? <StatusAlert>{error}</StatusAlert> : null}

        <div className="grid gap-3 lg:grid-cols-4">
          <RingMetric
            label="CPU"
            value={metrics?.server.cpu_usage_percent ?? 0}
            icon={<Gauge className="size-4" />}
          />
          <BarMetric
            label="内存"
            value={metrics?.server.memory.usage_percent ?? 0}
            detail={metrics ? `${formatMb(metrics.server.memory.used_mb)} / ${formatMb(metrics.server.memory.total_mb)}` : "-"}
            icon={<MemoryStick className="size-4" />}
          />
          <BarMetric
            label="磁盘"
            value={metrics?.server.disk.usage_percent ?? 0}
            detail={metrics ? `${formatMb(metrics.server.disk.used_mb)} / ${formatMb(metrics.server.disk.total_mb)}` : "-"}
            icon={<HardDrive className="size-4" />}
          />
          <div className="rounded-md border p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Activity className="size-4" />
              Load Average
            </div>
            <div className="mt-3 text-2xl font-semibold">{loadAverage}</div>
            <div className="mt-2 text-xs text-muted-foreground">
              最近检查 {formatDateTime(metrics?.checked_at)}
            </div>
          </div>
        </div>

      </CardContent>
    </Card>
  );
}
