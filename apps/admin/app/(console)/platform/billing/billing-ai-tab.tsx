import { BillingFilterCombobox } from "@/components/billing/billing-filter-combobox";
import type { BillingAiUsageFilterOptions, BillingAiUsageStats } from "@/components/billing/billing-types";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TabsContent } from "@/components/ui/tabs";
import {
  AiStatItem,
  FilterInput,
  FilterPanel,
  formatCredits,
  readinessLabel,
  readinessReasonLabel,
  SectionHeader,
} from "@/app/(console)/platform/billing/billing-page-shared";

export type BillingAiFilters = {
  aiTenantKeyword?: string;
  aiSceneCode?: string;
  aiProviderCode?: string;
  aiModelCode?: string;
  aiStartDate?: string;
  aiEndDate?: string;
  aiMinSampleCount?: number;
};

export function BillingAiTab({
  aiStats,
  aiFilterOptions,
  aiFilters,
}: {
  aiStats: BillingAiUsageStats;
  aiFilterOptions: BillingAiUsageFilterOptions;
  aiFilters: BillingAiFilters;
}) {
  return (
    <TabsContent value="ai" className="mt-0">
      <SectionHeader
        title="AI 试算观察"
        description="按场景和模型观察 token 分布，达标后再进入 AI 真扣费。"
        badge={`${aiStats.totals.ready_groups} 个场景可进入真扣费评估`}
        badgeVariant={aiStats.totals.ready_groups > 0 ? "success" : "warning"}
      />
      <FilterPanel tab="ai">
        <BillingFilterCombobox
          label="租户"
          name="aiTenantKeyword"
          defaultValue={aiFilters.aiTenantKeyword}
          placeholder="搜索或选择租户"
          searchPlaceholder="搜索租户名称或标识"
          options={aiFilterOptions.tenants.map((tenant) => ({
            value: tenant.name,
            label: tenant.slug || tenant.id,
            keywords: [tenant.slug || "", tenant.id],
          }))}
        />
        <BillingFilterCombobox
          label="场景"
          name="aiSceneCode"
          defaultValue={aiFilters.aiSceneCode}
          placeholder="搜索或选择场景"
          searchPlaceholder="搜索场景"
          options={(aiFilterOptions.scene_options.length
            ? aiFilterOptions.scene_options
            : aiFilterOptions.scene_codes.map((code) => ({ code, name: null }))
          ).map((scene) => ({
            value: scene.code,
            label: scene.name || undefined,
            keywords: [scene.name || ""],
          }))}
        />
        <BillingFilterCombobox
          label="供应商"
          name="aiProviderCode"
          defaultValue={aiFilters.aiProviderCode}
          placeholder="搜索或选择供应商"
          searchPlaceholder="搜索供应商"
          options={(aiFilterOptions.provider_options.length
            ? aiFilterOptions.provider_options
            : aiFilterOptions.provider_codes.map((code) => ({ code, name: null }))
          ).map((provider) => ({
            value: provider.code,
            label: provider.name || undefined,
            keywords: [provider.name || ""],
          }))}
        />
        <BillingFilterCombobox
          label="模型"
          name="aiModelCode"
          defaultValue={aiFilters.aiModelCode}
          placeholder="搜索或选择模型"
          searchPlaceholder="搜索模型"
          options={aiFilterOptions.models.map((model) => ({
            value: model.code,
            label: [model.provider_code, model.name].filter(Boolean).join(" / ") || undefined,
            keywords: [model.provider_code || "", model.name || ""],
          }))}
        />
        <FilterInput label="开始时间" name="aiStartDate" type="date" defaultValue={aiFilters.aiStartDate} />
        <FilterInput label="结束时间" name="aiEndDate" type="date" defaultValue={aiFilters.aiEndDate} />
        <FilterInput
          label="样本门槛"
          name="aiMinSampleCount"
          type="number"
          defaultValue={aiFilters.aiMinSampleCount ? String(aiFilters.aiMinSampleCount) : ""}
          placeholder="100"
        />
      </FilterPanel>
      <div className="grid gap-3 md:grid-cols-4">
        <AiStatItem label="可评估场景" value={formatCredits(aiStats.totals.ready_groups)} />
        <AiStatItem label="需继续观察" value={formatCredits(aiStats.totals.watch_groups)} />
        <AiStatItem label="缺价格规则" value={formatCredits(aiStats.totals.pricing_rule_missing_groups)} />
        <AiStatItem label="缺 token 场景" value={formatCredits(aiStats.totals.usage_missing_groups)} />
      </div>
      <div className="mt-4 overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>场景/模型</TableHead>
              <TableHead className="text-right">样本</TableHead>
              <TableHead className="text-right">Token P95</TableHead>
              <TableHead className="text-right">积分 P95</TableHead>
              <TableHead className="text-right">建议门槛</TableHead>
              <TableHead>状态</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {aiStats.list.map((item) => (
              <TableRow key={`${item.scene_code}-${item.provider_code || "-"}-${item.model_code || "-"}`}>
                <TableCell>
                  <div className="font-medium">{item.scene_code}</div>
                  <div className="text-xs text-muted-foreground">
                    {[item.provider_code, item.model_code || item.model_name].filter(Boolean).join(" / ") || "-"}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div>{formatCredits(item.billable_sample_count)}</div>
                  <div className="text-xs text-muted-foreground">
                    总计 {formatCredits(item.total_logs)}
                    {item.sample_gap > 0 ? ` · 差 ${formatCredits(item.sample_gap)}` : ""}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div>{formatCredits(item.token_percentiles.p95)}</div>
                  <div className="text-xs text-muted-foreground">
                    P50 {formatCredits(item.token_percentiles.p50)} · P99 {formatCredits(item.token_percentiles.p99)}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div>{formatCredits(item.credit_percentiles.p95)}</div>
                  <div className="text-xs text-muted-foreground">
                    P50 {formatCredits(item.credit_percentiles.p50)} · P99 {formatCredits(item.credit_percentiles.p99)}
                  </div>
                </TableCell>
                <TableCell className="text-right">{formatCredits(item.suggested_min_charge_credits)}</TableCell>
                <TableCell>
                  <Badge variant={item.ready_for_phase6 ? "success" : "outline"}>
                    {readinessLabel(item.ready_for_phase6)}
                  </Badge>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {item.ready_for_phase6 ? (
                      <Badge variant="secondary">价格规则已命中</Badge>
                    ) : item.blocking_reasons.map((reason) => (
                      <Badge key={reason} variant={reason === "pricing_rule_missing" ? "danger" : "secondary"}>
                        {readinessReasonLabel(reason)}
                      </Badge>
                    ))}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {item.missing_usage_count > 0 ? `缺 token ${formatCredits(item.missing_usage_count)} 条` : null}
                    {item.missing_usage_count > 0 && item.missing_pricing_rule_count > 0 ? " · " : null}
                    {item.missing_pricing_rule_count > 0 ? `缺规则 ${formatCredits(item.missing_pricing_rule_count)} 项` : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!aiStats.list.length ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-sm text-muted-foreground">
                  暂无 AI 试算观察样本
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
      <div className="mt-3 flex flex-col gap-2 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between">
        <span>建议门槛 = 积分 P95 × {aiStats.controls.safety_factor}</span>
        <span>Phase 6 前每个主要场景建议至少 {formatCredits(aiStats.controls.min_sample_count)} 条成功样本</span>
      </div>
    </TabsContent>
  );
}
