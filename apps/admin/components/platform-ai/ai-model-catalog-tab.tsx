"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { RefreshCw, Save } from "lucide-react";
import { toast } from "sonner";
import type {
  AiCatalogEntryRecord,
  AiCatalogRunRecord,
  AiModelRecord,
  AiProviderRecord,
  PageData,
} from "@/components/platform-ai/ai-config-types";
import { requestBackend } from "@/components/platform-ai/ai-model-routing-shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type CatalogTabProps = {
  providers: AiProviderRecord[];
  models: AiModelRecord[];
  credits?: {
    total_credits: number;
    total_usage: number;
  } | null;
  usageSummary?: {
    requests_24h: number;
    estimated_cost_usd_24h: number;
  };
  runs: PageData<AiCatalogRunRecord>;
  entries: PageData<AiCatalogEntryRecord>;
};

const CHANGE_LABEL: Record<string, string> = {
  new: "新增",
  changed: "能力或价格变化",
  unchanged: "未变化",
  removed: "已下架",
};

export function changeTypeLabel(value: string) {
  return CHANGE_LABEL[value] ?? "未知变化";
}

function pageLabel(prefix: string, page: PageData<unknown>["pagination"]) {
  return `${prefix}第 ${page.page} / ${Math.max(page.totalPages, 1)} 页`;
}

function PageControls({
  label,
  pagination,
  visibleCount,
  pending,
  onPageChange,
}: {
  label: string;
  pagination: PageData<unknown>["pagination"];
  visibleCount: number;
  pending: boolean;
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t bg-card px-4 py-3 text-sm">
      <div className="text-muted-foreground">
        {pageLabel(label, pagination)}，当前显示 {visibleCount} 条，共 {pagination.total} 条
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending || pagination.page <= 1}
          onClick={() => onPageChange(Math.max(1, pagination.page - 1))}
        >
          上一页
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending || pagination.page >= Math.max(pagination.totalPages, 1)}
          onClick={() => onPageChange(pagination.page + 1)}
        >
          下一页
        </Button>
      </div>
    </div>
  );
}

function priceSummary(value: AiCatalogEntryRecord["raw_price_projection"]) {
  if (!value) return "-";
  const entries = Object.entries(value)
    .filter((entry): entry is [string, string | number] =>
      typeof entry[1] === "string" || typeof entry[1] === "number")
    .slice(0, 3);
  return entries.length
    ? entries.map(([key, price]) => `${key}:${price}`).join(" / ")
    : "-";
}

function emptyEntryPage(): PageData<AiCatalogEntryRecord> {
  return { list: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } };
}

function summaryValue(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function probeSummary(models: AiModelRecord[]) {
  return models.reduce((summary, model) => {
    if (model.probe_status === "eligible") summary.eligible += 1;
    if (model.probe_status === "ineligible") summary.ineligible += 1;
    if (model.probe_status === "stale") summary.stale += 1;
    if (!model.probe_status || model.probe_status === "unverified") summary.unverified += 1;
    return summary;
  }, { eligible: 0, ineligible: 0, stale: 0, unverified: 0 });
}

export function AiModelCatalogTab({
  providers,
  models,
  credits: initialCredits,
  usageSummary,
  runs,
  entries,
}: CatalogTabProps) {
  const routerProviderId = providers.find((provider) => provider.provider_type === "openrouter")?.id ?? "";
  const [providerId, setProviderId] = useState(routerProviderId);
  const [credits, setCredits] = useState(initialCredits ?? null);
  const [runPage, setRunPage] = useState(runs);
  const [selectedRun, setSelectedRun] = useState(runs.list[0]?.id ?? "");
  const [entryPage, setEntryPage] = useState(entries);
  const [entryError, setEntryError] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [isEntryLoading, setIsEntryLoading] = useState(false);
  const [isRunLoading, setIsRunLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [isCreditsLoading, setIsCreditsLoading] = useState(false);
  const [selectedEntries, setSelectedEntries] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();
  const runRequestSeq = useRef(0);
  const entryRequestSeq = useRef(0);
  const creditsRequestSeq = useRef(0);
  const providerScopedModels = useMemo(
    () => models.filter((model) => model.provider_id === providerId),
    [models, providerId],
  );
  const probes = useMemo(() => probeSummary(providerScopedModels), [providerScopedModels]);
  const activeRun = useMemo(
    () => runPage.list.find((run) => run.id === selectedRun) ?? runPage.list[0] ?? null,
    [runPage.list, selectedRun],
  );

  function refreshPage() {
    startTransition(() => window.location.reload());
  }

  function toggleEntry(id: string, checked: boolean) {
    setSelectedEntries((current) => {
      const next = checked
        ? Array.from(new Set([...current, id]))
        : current.filter((item) => item !== id);
      return next.slice(0, 100);
    });
  }

  async function syncPreview() {
    if (!providerId) {
      toast.error("请先配置 OpenRouter 供应商");
      return;
    }
    setIsSyncing(true);
    try {
      await requestBackend("/platform/ai-config/openrouter/models/sync-preview", {
        method: "POST",
        body: JSON.stringify({ provider_id: providerId }),
      });
      toast.success("OpenRouter 模型目录预览已同步");
      refreshPage();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "OpenRouter 模型目录同步失败");
    } finally {
      setIsSyncing(false);
    }
  }

  function nextSequence(ref: { current: number }) {
    ref.current += 1;
    return ref.current;
  }

  async function loadRunEntries(runId: string, page = 1, requestSeq = nextSequence(entryRequestSeq)) {
    setEntryError(null);
    setIsEntryLoading(true);
    try {
      const response = await requestBackend<PageData<AiCatalogEntryRecord>>(
        `/platform/ai-config/catalog-runs/${runId}/entries?page=${page}&pageSize=20`,
      );
      if (requestSeq !== entryRequestSeq.current) return;
      setSelectedRun(runId);
      setSelectedEntries([]);
      setEntryPage(response);
    } catch (error) {
      if (requestSeq !== entryRequestSeq.current) return;
      setEntryError(error instanceof Error ? error.message : "目录条目加载失败");
    } finally {
      if (requestSeq === entryRequestSeq.current) setIsEntryLoading(false);
    }
  }

  async function loadRuns(page: number, nextProviderId = providerId, requestSeq = nextSequence(runRequestSeq)) {
    entryRequestSeq.current += 1;
    setIsEntryLoading(false);
    setRunError(null);
    setIsRunLoading(true);
    try {
      const response = await requestBackend<PageData<AiCatalogRunRecord>>(
        `/platform/ai-config/catalog-runs?page=${page}&pageSize=20&provider_id=${nextProviderId}`,
      );
      if (requestSeq !== runRequestSeq.current) return;
      setRunPage(response);
      const firstRunId = response.list[0]?.id;
      if (firstRunId) {
        await loadRunEntries(firstRunId, 1);
      } else {
        setSelectedRun("");
        setEntryPage(emptyEntryPage());
      }
    } catch (error) {
      if (requestSeq !== runRequestSeq.current) return;
      setRunError(error instanceof Error ? error.message : "目录记录加载失败");
    } finally {
      if (requestSeq === runRequestSeq.current) setIsRunLoading(false);
    }
  }

  function beginProviderSwitch(nextProviderId: string) {
    const requestSeq = nextSequence(runRequestSeq);
    entryRequestSeq.current += 1;
    creditsRequestSeq.current += 1;
    setProviderId(nextProviderId);
    setCredits(null);
    setSelectedRun("");
    setSelectedEntries([]);
    setRunPage({ list: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } });
    setEntryPage(emptyEntryPage());
    setIsEntryLoading(false);
    setIsCreditsLoading(false);
    void loadRuns(1, nextProviderId, requestSeq);
  }

  async function applySelected() {
    if (!activeRun || selectedEntries.length === 0) {
      toast.error("请选择要应用的目录条目");
      return;
    }
    if (selectedEntries.length > 100) {
      toast.error("单次最多应用 100 个目录条目");
      return;
    }
    setIsApplying(true);
    try {
      await requestBackend("/platform/ai-config/openrouter/models/apply", {
        method: "POST",
        body: JSON.stringify({
          run_id: activeRun.id,
          entry_ids: selectedEntries,
          expected_catalog_hash: activeRun.catalog_hash,
        }),
      });
      toast.success("OpenRouter 模型目录已应用");
      setSelectedEntries([]);
      refreshPage();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "OpenRouter 模型目录应用失败");
    } finally {
      setIsApplying(false);
    }
  }

  async function loadCredits() {
    if (!providerId) {
      toast.error("请先配置 OpenRouter 供应商");
      return;
    }
    setIsCreditsLoading(true);
    const requestSeq = nextSequence(creditsRequestSeq);
    const requestedProviderId = providerId;
    try {
      const response = await requestBackend<{ total_credits: number; total_usage: number }>(
        `/platform/ai-config/openrouter/credits?provider_id=${requestedProviderId}`,
      );
      if (requestSeq === creditsRequestSeq.current && requestedProviderId === providerId) {
        setCredits(response);
      }
    } catch (error) {
      if (requestSeq !== creditsRequestSeq.current) return;
      toast.error(error instanceof Error ? error.message : "OpenRouter 余额读取失败");
    } finally {
      if (requestSeq === creditsRequestSeq.current) setIsCreditsLoading(false);
    }
  }

  return (
    <div className="grid h-full min-h-0 gap-4 overflow-auto xl:grid-cols-[360px_minmax(0,1fr)] xl:overflow-hidden">
      <Card className="flex min-h-0 flex-col overflow-hidden">
        <CardHeader className="shrink-0">
          <CardTitle>同步 OpenRouter 模型</CardTitle>
          <CardDescription>
            只保存模型目录、安全能力投影和价格快照；不会把 API Key 返回到浏览器。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto">
          <div className="flex flex-col gap-2">
            <div className="text-sm font-medium">OpenRouter 供应商</div>
            <Select
              value={providerId}
              onValueChange={beginProviderSwitch}
            >
              <SelectTrigger>
                <SelectValue placeholder="选择 OpenRouter 供应商" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {providers.filter((item) => item.provider_type === "openrouter").map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <Button type="button" onClick={syncPreview} disabled={isPending || isSyncing || !providerId}>
            <RefreshCw data-icon="inline-start" />
            {isSyncing ? "同步中" : "同步 OpenRouter 模型"}
          </Button>
          <div className="rounded-lg border p-3 text-sm">
            <div className="font-medium">调用摘要</div>
            <div className="mt-2 grid gap-2 text-muted-foreground">
              <div>近 24 小时请求：{usageSummary?.requests_24h ?? 0}</div>
              <div>近 24 小时成本：${(usageSummary?.estimated_cost_usd_24h ?? 0).toFixed(4)}</div>
              <div>
                已载入模型探针：可用 {probes.eligible}，不可用 {probes.ineligible}，
                需复核 {probes.stale}，未验证 {probes.unverified}
              </div>
            </div>
          </div>
          <div className="rounded-lg border p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-medium">OpenRouter 余额</div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void loadCredits()}
                disabled={isCreditsLoading || !providerId}
              >
                {isCreditsLoading ? "读取中" : "读取 OpenRouter 余额"}
              </Button>
            </div>
            <div className="mt-2 grid gap-2 text-muted-foreground">
              <div>总额度：${(credits?.total_credits ?? 0).toFixed(4)}</div>
              <div>累计用量：${(credits?.total_usage ?? 0).toFixed(4)}</div>
            </div>
          </div>
          <div className="rounded-lg border p-3 text-sm">
            <div className="font-medium">最近同步</div>
            {runError ? (
              <p className="mt-2 text-destructive">{runError}</p>
            ) : null}
            {isRunLoading ? (
              <p className="mt-2 text-muted-foreground">目录同步记录加载中</p>
            ) : runPage.list.length === 0 ? (
              <p className="mt-2 text-muted-foreground">还没有目录同步记录。</p>
            ) : (
              <div className="mt-2 flex flex-col gap-2">
                {runPage.list.map((run) => (
                  <button
                    key={run.id}
                    type="button"
                    className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-left"
                    onClick={() => void loadRunEntries(run.id)}
                  >
                    <span>
                      <span className="block">{run.created_at}</span>
                      <span className="block text-xs text-muted-foreground">
                        来源端点：{run.source_endpoint}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        新增 {summaryValue(run.summary_payload, "new")}，
                        已变化 {summaryValue(run.summary_payload, "changed")}，
                        下架 {summaryValue(run.summary_payload, "removed")}，
                        未变化 {summaryValue(run.summary_payload, "unchanged")}
                      </span>
                    </span>
                    <span className="flex flex-col items-end gap-1">
                      <Badge variant={run.id === activeRun?.id ? "default" : "outline"}>
                        {run.model_count} 条
                      </Badge>
                      <Badge variant="secondary">{run.run_status}</Badge>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </CardContent>
        <PageControls
          label="目录记录"
          pagination={runPage.pagination}
          visibleCount={runPage.list.length}
          pending={isRunLoading || isEntryLoading}
          onPageChange={(page) => void loadRuns(page)}
        />
      </Card>

      <Card className="flex min-h-0 flex-col overflow-hidden">
        <CardHeader className="shrink-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>目录预览</CardTitle>
              <CardDescription>
                勾选新增、能力或价格变化、下架条目后应用。下架和价格变化不会自动切换业务路由。
              </CardDescription>
              {entryError ? (
                <p className="mt-2 text-sm text-destructive">{entryError}</p>
              ) : null}
            </div>
            <Button
              type="button"
              onClick={applySelected}
              disabled={isRunLoading || isEntryLoading || selectedEntries.length === 0 || isPending || isApplying}
            >
              <Save data-icon="inline-start" />
              {isApplying ? "应用中" : "应用选中（最多 100）"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 p-0">
          <Table containerClassName="h-full" className="min-w-[980px]">
            <TableHeader className="sticky top-0 bg-card">
              <TableRow>
                <TableHead className="w-12">选择</TableHead>
                <TableHead>模型</TableHead>
                <TableHead>模态</TableHead>
                <TableHead>变化</TableHead>
                <TableHead>价格快照</TableHead>
                <TableHead>当前版本</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entryPage.list.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    {isEntryLoading ? "目录条目加载中" : "暂无目录条目"}
                  </TableCell>
                </TableRow>
              ) : entryPage.list.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>
                    <input
                      aria-label={`选择 ${entry.model_name}`}
                      type="checkbox"
                      checked={selectedEntries.includes(entry.id)}
                      onChange={(event) => toggleEntry(entry.id, event.target.checked)}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{entry.model_name}</div>
                    <div className="text-xs text-muted-foreground">{entry.external_model_id}</div>
                  </TableCell>
                  <TableCell>{entry.modality}</TableCell>
                  <TableCell>{changeTypeLabel(entry.change_type)}</TableCell>
                  <TableCell className="font-mono text-xs">{priceSummary(entry.raw_price_projection)}</TableCell>
                  <TableCell>{entry.current_model_version ?? "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
        <PageControls
          label="条目"
          pagination={entryPage.pagination}
          visibleCount={entryPage.list.length}
          pending={isEntryLoading}
          onPageChange={(page) => activeRun ? void loadRunEntries(activeRun.id, page) : undefined}
        />
      </Card>
    </div>
  );
}
