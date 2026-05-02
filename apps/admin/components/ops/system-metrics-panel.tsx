"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, Gauge, HardDrive, Loader2, MemoryStick, Pause, Play, RefreshCw } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import type { OpsSystemMetrics } from "@/components/ops/ops-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const REFRESH_INTERVAL_MS = 5000;

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

function statusVariant(status: string) {
  return status === "online" ? "success" : status === "stopped" ? "danger" : "warning";
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
  const [manualPending, setManualPending] = useState(false);
  const hasMetricsRef = useRef(false);

  const loadMetrics = useCallback(async (options?: { manual?: boolean }) => {
    const manual = Boolean(options?.manual);
    if (manual) {
      setManualPending(true);
      setError("");
    }

    try {
      const data = await requestMetrics();
      setMetrics(data);
      hasMetricsRef.current = true;
      if (manual) setError("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "资源指标加载失败";
      if (manual || !hasMetricsRef.current) {
        setError(message);
      }
    } finally {
      if (manual) setManualPending(false);
    }
  }, []);

  useEffect(() => {
    void loadMetrics({ manual: true });
  }, [loadMetrics]);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = window.setInterval(() => {
      void loadMetrics();
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [autoRefresh, loadMetrics]);

  const loadAverage = useMemo(() => {
    return metrics?.server.load_average?.map((value) => value.toFixed(2)).join(" / ") || "-";
  }, [metrics]);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle>实时资源状态</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            每 5 秒刷新一次，不写入脚本执行记录。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={autoRefresh ? "success" : "outline"}>
            {autoRefresh ? "自动刷新" : "已暂停"}
          </Badge>
          <Button type="button" variant="outline" onClick={() => setAutoRefresh((value) => !value)}>
            {autoRefresh ? <Pause data-icon="inline-start" /> : <Play data-icon="inline-start" />}
            {autoRefresh ? "暂停" : "继续"}
          </Button>
          <Button type="button" onClick={() => void loadMetrics({ manual: true })} disabled={manualPending}>
            {manualPending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}
            刷新
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

        <div className="grid gap-3 lg:grid-cols-2">
          {(metrics?.pm2 || []).map((process) => (
            <div key={process.name} className="rounded-md border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-medium">{process.name}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    PID {process.pid ?? "-"} · uptime {process.uptime} · 重启 {process.restarts}
                  </div>
                </div>
                <Badge variant={statusVariant(process.status)}>{process.status}</Badge>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <BarMetric
                  label="CPU"
                  value={process.cpu_percent}
                  detail={`${process.cpu_percent.toFixed(1)}%`}
                  icon={<Gauge className="size-4" />}
                />
                <div className="rounded-md border p-4">
                  <div className="text-sm font-medium">内存</div>
                  <div className="mt-2 text-xl font-semibold">{formatMb(process.memory_mb)}</div>
                  <div className="mt-2 text-xs text-muted-foreground">PM2 进程占用</div>
                </div>
              </div>
            </div>
          ))}
          {metrics && metrics.pm2.length === 0 ? (
            <div className="rounded-md border p-4 text-sm text-muted-foreground">
              未发现 goose PM2 进程
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
