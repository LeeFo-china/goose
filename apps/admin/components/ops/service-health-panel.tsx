"use client";

import type { ComponentProps, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Container, Loader2, RefreshCw, Server, ShieldCheck, TriangleAlert } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import type { OpsServiceHealth } from "@/components/ops/ops-types";
import { OpsTabsList } from "@/components/ops/ops-tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requestBackendJson } from "@/lib/backend-client";
import { cn } from "@/lib/utils";

const AUTO_REFRESH_INTERVAL_MS = 5000;
const GROUP_LABELS: Record<OpsServiceHealth["containers"][number]["group"], string> = {
  business: "业务服务",
  supabase: "Supabase",
  infrastructure: "基础设施",
};

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

function healthLabel(value: OpsServiceHealth["containers"][number]["health"]) {
  const labels = {
    healthy: "健康",
    unhealthy: "异常",
    starting: "启动中",
    none: "未配置",
    exited: "已停止",
    unknown: "未知",
  };
  return labels[value] || value;
}

function healthVariant(value: OpsServiceHealth["containers"][number]["health"]): ComponentProps<typeof Badge>["variant"] {
  if (value === "healthy") return "success";
  if (value === "unhealthy" || value === "exited") return "danger";
  if (value === "starting" || value === "unknown") return "warning";
  return "outline";
}

async function requestServiceHealth() {
  return requestBackendJson<OpsServiceHealth>("/admin/ops/service-health", {
    cache: "no-store",
    fallbackMessage: "微服务健康状态加载失败",
  });
}

function SummaryItem({
  icon,
  label,
  value,
  tone = "default",
}: {
  icon: ReactNode;
  label: string;
  value: number;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  return (
    <div className="rounded-md border p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {icon}
          {label}
        </div>
        <div
          className={cn(
            "text-xl font-semibold",
            tone === "success" && "text-success",
            tone === "warning" && "text-warning",
            tone === "danger" && "text-destructive",
          )}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

function ContainersTable({
  containers,
}: {
  containers: OpsServiceHealth["containers"];
}) {
  return (
    <div className="overflow-hidden rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>服务</TableHead>
            <TableHead>分组</TableHead>
            <TableHead>运行状态</TableHead>
            <TableHead>Healthcheck</TableHead>
            <TableHead>镜像</TableHead>
            <TableHead>端口</TableHead>
            <TableHead>启动时间</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {containers.map((container) => (
            <TableRow key={container.id}>
              <TableCell>
                <div className="font-medium">{container.name}</div>
                <div className="mt-1 text-xs text-muted-foreground">{container.id}</div>
              </TableCell>
              <TableCell>{GROUP_LABELS[container.group]}</TableCell>
              <TableCell>
                <Badge variant={container.state === "running" ? "success" : "danger"}>{container.state}</Badge>
              </TableCell>
              <TableCell>
                <div className="flex flex-col gap-1">
                  <Badge variant={healthVariant(container.health)}>{healthLabel(container.health)}</Badge>
                  {container.failing_streak ? (
                    <span className="text-xs text-destructive">失败 {container.failing_streak} 次</span>
                  ) : null}
                </div>
              </TableCell>
              <TableCell className="max-w-[260px] truncate text-xs text-muted-foreground">
                {container.image}
              </TableCell>
              <TableCell className="max-w-[220px] text-xs text-muted-foreground">
                {container.ports.length ? container.ports.join(" / ") : "-"}
              </TableCell>
              <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                {formatDateTime(container.started_at)}
              </TableCell>
            </TableRow>
          ))}
          {containers.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="h-24 text-center text-sm text-muted-foreground">
                暂无匹配容器
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}

export function ServiceHealthPanel() {
  const [snapshot, setSnapshot] = useState<OpsServiceHealth | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const hasSnapshotRef = useRef(false);
  const loadingRef = useRef(false);

  const loadHealth = useCallback(async (manual = false) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    if (manual) {
      setPending(true);
      setError("");
    }

    try {
      const data = await requestServiceHealth();
      setSnapshot(data);
      hasSnapshotRef.current = true;
      setError("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "微服务健康状态加载失败";
      if (manual || !hasSnapshotRef.current) setError(message);
    } finally {
      loadingRef.current = false;
      if (manual) setPending(false);
    }
  }, []);

  useEffect(() => {
    void loadHealth(true);
  }, [loadHealth]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!document.hidden) void loadHealth(false);
    }, AUTO_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [loadHealth]);

  const containersByGroup = useMemo(() => {
    const containers = snapshot?.containers || [];
    return {
      all: containers,
      business: containers.filter((item) => item.group === "business"),
      supabase: containers.filter((item) => item.group === "supabase"),
      infrastructure: containers.filter((item) => item.group === "infrastructure"),
    };
  }, [snapshot]);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle>微服务健康</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            读取 Docker 容器状态和 Healthcheck，重点观察 API、Admin、视频转文本 Worker 与 COS 对账 Worker。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">5 秒刷新</Badge>
          <Badge variant={snapshot?.summary.unhealthy || snapshot?.summary.exited ? "danger" : "success"}>
            {snapshot?.summary.unhealthy || snapshot?.summary.exited ? "存在异常" : "状态正常"}
          </Badge>
          <Button
            type="button"
            size="icon"
            className="size-6 rounded-md"
            onClick={() => void loadHealth(true)}
            disabled={pending}
            aria-label="刷新微服务健康"
            title="刷新微服务健康"
          >
            {pending ? <Loader2 className="animate-spin" data-icon="icon-only" /> : <RefreshCw data-icon="icon-only" />}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error ? <StatusAlert>{error}</StatusAlert> : null}

        <div className="grid gap-3 md:grid-cols-4">
          <SummaryItem icon={<Container className="size-4" />} label="容器总数" value={snapshot?.summary.total || 0} />
          <SummaryItem icon={<ShieldCheck className="size-4" />} label="健康" value={snapshot?.summary.healthy || 0} tone="success" />
          <SummaryItem icon={<TriangleAlert className="size-4" />} label="异常/停止" value={(snapshot?.summary.unhealthy || 0) + (snapshot?.summary.exited || 0)} tone={(snapshot?.summary.unhealthy || snapshot?.summary.exited) ? "danger" : "default"} />
          <SummaryItem icon={<Server className="size-4" />} label="无 Healthcheck" value={snapshot?.summary.without_healthcheck || 0} tone={(snapshot?.summary.without_healthcheck || 0) > 0 ? "warning" : "default"} />
        </div>

        <Tabs defaultValue="business" className="flex flex-col gap-3">
          <OpsTabsList>
            <TabsTrigger value="business">
              业务服务
              <span className="ml-2 text-xs text-muted-foreground">{containersByGroup.business.length}</span>
            </TabsTrigger>
            <TabsTrigger value="supabase">
              Supabase
              <span className="ml-2 text-xs text-muted-foreground">{containersByGroup.supabase.length}</span>
            </TabsTrigger>
            <TabsTrigger value="infrastructure">
              基础设施
              <span className="ml-2 text-xs text-muted-foreground">{containersByGroup.infrastructure.length}</span>
            </TabsTrigger>
            <TabsTrigger value="all">
              全部
              <span className="ml-2 text-xs text-muted-foreground">{containersByGroup.all.length}</span>
            </TabsTrigger>
          </OpsTabsList>
          <TabsContent value="business" className="mt-0">
            <ContainersTable containers={containersByGroup.business} />
          </TabsContent>
          <TabsContent value="supabase" className="mt-0">
            <ContainersTable containers={containersByGroup.supabase} />
          </TabsContent>
          <TabsContent value="infrastructure" className="mt-0">
            <ContainersTable containers={containersByGroup.infrastructure} />
          </TabsContent>
          <TabsContent value="all" className="mt-0">
            <ContainersTable containers={containersByGroup.all} />
          </TabsContent>
        </Tabs>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>最近检查 {formatDateTime(snapshot?.checked_at)}</span>
          <span>业务容器 {containersByGroup.business.length} 个</span>
        </div>
      </CardContent>
    </Card>
  );
}
