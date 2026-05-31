import { PricingRuleCreateButton, PricingRuleStatusButton } from "@/components/billing/billing-actions";
import { BillingFilterCombobox } from "@/components/billing/billing-filter-combobox";
import { FilterSelect } from "@/components/admin/filter-select";
import type { BillingAiUsageFilterOptions, BillingAiUsageStats, BillingLedgerListData, BillingPricingRuleListData } from "@/components/billing/billing-types";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TabsContent } from "@/components/ui/tabs";
import { AiStatItem, directionLabel, FilterInput, FilterPanel, formatCredits, formatDateTime, PaginationLinks, readinessLabel, readinessReasonLabel, scopeLabel, SectionHeader } from "@/app/(console)/platform/billing/billing-page-shared";

type BillingAiFilters = {
  aiTenantKeyword?: string;
  aiSceneCode?: string;
  aiProviderCode?: string;
  aiModelCode?: string;
  aiStartDate?: string;
  aiEndDate?: string;
  aiMinSampleCount?: number;
};

export function BillingAiTab({ aiStats, aiFilterOptions, aiFilters }: { aiStats: BillingAiUsageStats; aiFilterOptions: BillingAiUsageFilterOptions; aiFilters: BillingAiFilters }) {
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

export function BillingPricingTab({ pricing, ruleFilters }: { pricing: BillingPricingRuleListData; ruleFilters: Record<string, string | undefined> }) {
  return (
            <TabsContent value="pricing" className="mt-0">
              <SectionHeader
                title="价格规则"
                description="平台默认价和租户定制价。第一版先由超管维护。"
                action={<PricingRuleCreateButton />}
              />
              <FilterPanel tab="pricing">
                <FilterInput
                  label="计费项"
                  name="ruleMetricCode"
                  defaultValue={ruleFilters.ruleMetricCode}
                  placeholder="metric_code"
                />
                <FilterSelect
                  label="范围"
                  name="ruleScope"
                  defaultValue={ruleFilters.ruleScope}
                  options={[
                    { label: "平台默认价", value: "platform_default" },
                    { label: "租户定制价", value: "tenant_override" },
                  ]}
                />
                <FilterSelect
                  label="状态"
                  name="ruleEnabled"
                  defaultValue={ruleFilters.ruleEnabled}
                  options={[
                    { label: "启用", value: "true" },
                    { label: "停用", value: "false" },
                  ]}
                />
              </FilterPanel>
              <div className="overflow-hidden rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>范围</TableHead>
                      <TableHead>计费项</TableHead>
                      <TableHead>场景/模型</TableHead>
                      <TableHead className="text-right">单价</TableHead>
                      <TableHead className="text-right">最低</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pricing.list.map((rule) => (
                      <TableRow key={rule.id}>
                        <TableCell>{scopeLabel(rule.scope)}</TableCell>
                        <TableCell>
                          <div className="font-medium">{rule.metric_code}</div>
                          <div className="text-xs text-muted-foreground">优先级 {rule.priority} · v{rule.version}</div>
                        </TableCell>
                        <TableCell>
                          <div>{rule.scene_code || "-"}</div>
                          <div className="text-xs text-muted-foreground">{[rule.provider, rule.model].filter(Boolean).join(" / ") || "-"}</div>
                        </TableCell>
                        <TableCell className="text-right">{formatCredits(rule.unit_credits)} / {rule.unit}</TableCell>
                        <TableCell className="text-right">{formatCredits(rule.min_charge_credits)}</TableCell>
                        <TableCell>
                          <Badge variant={rule.enabled ? "success" : "secondary"}>{rule.enabled ? "启用" : "停用"}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <PricingRuleStatusButton rule={rule} />
                        </TableCell>
                      </TableRow>
                    ))}
                    {!pricing.list.length ? (
                      <TableRow>
                        <TableCell colSpan={7} className="h-24 text-center text-sm text-muted-foreground">
                          暂无价格规则
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
                <div className="border-t p-4">
                  <PaginationLinks
                    pagination={pricing.pagination}
                    pageKey="rulePage"
                    tab="pricing"
                    filters={ruleFilters}
                  />
                </div>
              </div>
            </TabsContent>
  );
}

export function BillingLedgerTab({ ledger, ledgerFilters }: { ledger: BillingLedgerListData; ledgerFilters: Record<string, string | undefined> }) {
  return (
            <TabsContent value="ledger" className="mt-0">
              <SectionHeader
                title="计费流水"
                description="最近的充值、扣费、冻结和解冻记录。"
                badge={`${ledger.pagination.total} 条流水`}
              />
              <FilterPanel tab="ledger">
                <FilterInput
                  label="租户"
                  name="ledgerTenantKeyword"
                  defaultValue={ledgerFilters.ledgerTenantKeyword}
                  placeholder="租户名称或标识"
                />
                <FilterSelect
                  label="方向"
                  name="ledgerDirection"
                  defaultValue={ledgerFilters.ledgerDirection}
                  options={[
                    { label: "入账", value: "in" },
                    { label: "扣费", value: "out" },
                    { label: "冻结", value: "freeze" },
                    { label: "解冻", value: "unfreeze" },
                  ]}
                />
                <FilterInput
                  label="计费项"
                  name="ledgerMetricCode"
                  defaultValue={ledgerFilters.ledgerMetricCode}
                  placeholder="metric_code"
                />
                <FilterInput
                  label="来源"
                  name="ledgerSourceType"
                  defaultValue={ledgerFilters.ledgerSourceType}
                  placeholder="source_type"
                />
                <FilterInput
                  label="流水类型"
                  name="ledgerEventType"
                  defaultValue={ledgerFilters.ledgerEventType}
                  placeholder="event_type"
                />
                <FilterInput
                  label="关键词"
                  name="ledgerKeyword"
                  defaultValue={ledgerFilters.ledgerKeyword}
                  placeholder="订单号或备注"
                />
                <FilterInput label="开始时间" name="ledgerStartDate" type="date" defaultValue={ledgerFilters.ledgerStartDate} />
                <FilterInput label="结束时间" name="ledgerEndDate" type="date" defaultValue={ledgerFilters.ledgerEndDate} />
              </FilterPanel>
              <div className="overflow-hidden rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>时间</TableHead>
                      <TableHead>租户</TableHead>
                      <TableHead>类型</TableHead>
                      <TableHead>来源</TableHead>
                      <TableHead className="text-right">积分</TableHead>
                      <TableHead className="text-right">余额</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ledger.list.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{formatDateTime(item.created_at)}</TableCell>
                        <TableCell>{item.tenant?.name || item.tenant?.slug || item.tenant_id}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{directionLabel(item.direction)}</Badge>
                          <div className="mt-1 text-xs text-muted-foreground">{item.event_type}</div>
                        </TableCell>
                        <TableCell>{[item.source_type, item.source_id].filter(Boolean).join(" / ") || item.order_no || "-"}</TableCell>
                        <TableCell className="text-right">{formatCredits(item.change_credits)}</TableCell>
                        <TableCell className="text-right">{formatCredits(item.balance_after)}</TableCell>
                      </TableRow>
                    ))}
                    {!ledger.list.length ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-24 text-center text-sm text-muted-foreground">
                          暂无计费流水
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
                <div className="border-t p-4">
                  <PaginationLinks
                    pagination={ledger.pagination}
                    pageKey="ledgerPage"
                    tab="ledger"
                    filters={ledgerFilters}
                  />
                </div>
              </div>
            </TabsContent>
  );
}
