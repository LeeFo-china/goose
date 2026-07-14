"use client";

import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import type {
  ProjectOperationalRiskAiSummary,
  ProjectOperationalRiskRpcPage,
} from "@gooes/domain";
import { StatusAlert } from "@/components/admin/status-alert";
import { ProjectHealthAiSummary } from "@/components/project-health/project-health-ai-summary";
import { ProjectHealthFilters } from "@/components/project-health/project-health-filters";
import {
  fetchProjectHealthAiSummary,
  fetchProjectHealthRisks,
} from "@/components/project-health/project-health-api";
import { ProjectHealthPagination } from "@/components/project-health/project-health-pagination";
import { ProjectHealthSummaryCards } from "@/components/project-health/project-health-summary-cards";
import { ProjectHealthTable } from "@/components/project-health/project-health-table";
import {
  buildProjectHealthHref,
  type ProjectHealthQueryState,
} from "@/components/project-health/project-health-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function filtersFromLocation(): ProjectHealthQueryState {
  const params = new URLSearchParams(window.location.search);
  return {
    page: params.get("page") || 1,
    severity: params.get("severity") as ProjectHealthQueryState["severity"],
    riskType: params.get("risk_type") as ProjectHealthQueryState["riskType"],
    keyword: params.get("keyword") || "",
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function ProjectHealthClientShell({
  initialData,
  initialFilters,
  initialError,
  headerIcon: HeaderIcon,
}: {
  initialData: ProjectOperationalRiskRpcPage | null;
  initialFilters: ProjectHealthQueryState;
  initialError: string | null;
  headerIcon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}) {
  const [data, setData] = useState(initialData);
  const [filters, setFilters] = useState(initialFilters);
  const [error, setError] = useState(initialError);
  const [isListLoading, setIsListLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState<ProjectOperationalRiskAiSummary | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const listRequestRef = useRef<AbortController | null>(null);
  const listRequestIdRef = useRef(0);
  const aiRequestRef = useRef<AbortController | null>(null);
  const aiRequestIdRef = useRef(0);

  const loadRisks = useCallback(async (
    nextFilters: ProjectHealthQueryState,
    nextPage = nextFilters.page ?? 1,
    options: { replaceUrl?: boolean } = {},
  ) => {
    listRequestRef.current?.abort();
    const controller = new AbortController();
    const requestId = listRequestIdRef.current + 1;
    listRequestIdRef.current = requestId;
    listRequestRef.current = controller;
    setIsListLoading(true);

    const requestFilters = { ...nextFilters, page: nextPage };

    try {
      const nextData = await fetchProjectHealthRisks(requestFilters, {
        signal: controller.signal,
      });
      if (listRequestIdRef.current !== requestId) return;
      setData(nextData);
      setFilters(requestFilters);
      setError(null);
      aiRequestRef.current?.abort();
      aiRequestIdRef.current += 1;
      setAiSummary(null);
      setAiError(null);
      setIsAiLoading(false);
      if (options.replaceUrl !== false) {
        window.history.replaceState(null, "", buildProjectHealthHref(requestFilters));
      }
    } catch (loadError) {
      if (isAbortError(loadError)) return;
      if (listRequestIdRef.current !== requestId) return;
      setError(loadError instanceof Error ? loadError.message : "项目风险加载失败");
    } finally {
      if (listRequestIdRef.current === requestId) setIsListLoading(false);
    }
  }, []);

  useEffect(() => {
    function handlePopState() {
      void loadRisks(filtersFromLocation(), undefined, { replaceUrl: false });
    }

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      listRequestRef.current?.abort();
      aiRequestRef.current?.abort();
    };
  }, [loadRisks]);

  const handleGenerateAiSummary = useCallback(async () => {
    aiRequestRef.current?.abort();
    const controller = new AbortController();
    const requestId = aiRequestIdRef.current + 1;
    aiRequestIdRef.current = requestId;
    aiRequestRef.current = controller;
    setIsAiLoading(true);
    setAiError(null);

    try {
      const nextSummary = await fetchProjectHealthAiSummary(filters, {
        signal: controller.signal,
      });
      if (aiRequestIdRef.current !== requestId) return;
      setAiSummary(nextSummary);
      setAiError(null);
    } catch (generateError) {
      if (isAbortError(generateError)) return;
      if (aiRequestIdRef.current !== requestId) return;
      setAiError(
        generateError instanceof Error
          ? generateError.message
          : "AI 摘要生成失败",
      );
    } finally {
      if (aiRequestIdRef.current === requestId) setIsAiLoading(false);
    }
  }, [filters]);

  const generatedAt = data?.generated_at
    ? new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(data.generated_at))
    : "等待数据";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground">
            <HeaderIcon aria-hidden={true} className="size-4" />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-normal">项目风险</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              聚合流程、施工、日志、验收和客服风险。生成时间：{generatedAt}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={isListLoading}
            onClick={() => void loadRisks(filters)}
          >
            <RefreshCw data-icon="inline-start" />
            刷新
          </Button>
          <Button
            type="button"
            disabled={isAiLoading || isListLoading}
            onClick={() => void handleGenerateAiSummary()}
          >
            <Sparkles data-icon="inline-start" />
            {isAiLoading ? "正在生成" : "生成 AI 经营摘要"}
          </Button>
        </div>
      </div>

      <ProjectHealthSummaryCards data={data} />

      <ProjectHealthAiSummary
        summary={aiSummary}
        error={aiError}
        isLoading={isAiLoading}
        onRetry={() => void handleGenerateAiSummary()}
      />

      {error ? <StatusAlert>{error}</StatusAlert> : null}

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-none">
        <CardHeader className="shrink-0 border-b bg-muted/20 p-3">
          <ProjectHealthFilters
            filters={filters}
            disabled={isListLoading}
            onSubmit={(nextFilters) => void loadRisks(nextFilters, 1)}
            onReset={() => void loadRisks({ page: 1, severity: "", riskType: "", keyword: "" }, 1)}
          />
        </CardHeader>
        <CardContent className="relative flex min-h-0 flex-1 flex-col bg-card p-0">
          <div
            data-testid="project-health-table-viewport"
            aria-busy={isListLoading}
            className="min-h-0 flex-1 overflow-auto"
          >
            <div className={isListLoading ? "opacity-60" : undefined}>
              {data ? (
                <ProjectHealthTable items={data.items} />
              ) : (
                <div className="flex min-h-[320px] flex-col gap-3 p-4">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <Skeleton key={index} className="h-10 w-full" />
                  ))}
                </div>
              )}
            </div>
          </div>
          {isListLoading ? (
            <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
              <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground shadow-sm">
                <Loader2 className="animate-spin" data-icon="inline-start" />
                正在更新列表
              </div>
            </div>
          ) : null}
        </CardContent>
        <CardFooter className="shrink-0 flex-col gap-3 border-t bg-card px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline" className="tabular-nums">
              第 {data?.pagination.page ?? 1} / {Math.max(data?.pagination.total_pages ?? 1, 1)} 页
            </Badge>
            <span className="tabular-nums">
              当前显示 {data?.items.length ?? 0} 条，共 {data?.pagination.total ?? 0} 条
            </span>
          </div>
          <ProjectHealthPagination
            pagination={data?.pagination ?? null}
            disabled={isListLoading || !data}
            onPageChange={(page) => void loadRisks(filters, page)}
          />
        </CardFooter>
      </Card>
    </div>
  );
}
