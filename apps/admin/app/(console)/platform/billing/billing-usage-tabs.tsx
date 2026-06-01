import { PricingRuleCreateButton, PricingRuleStatusButton } from "@/components/billing/billing-actions";
import { FilterSelect } from "@/components/admin/filter-select";
import type { BillingLedgerListData, BillingPricingRuleListData } from "@/components/billing/billing-types";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TabsContent } from "@/components/ui/tabs";
import { directionLabel, FilterInput, FilterPanel, formatCredits, formatDateTime, PaginationLinks, scopeLabel, SectionHeader } from "@/app/(console)/platform/billing/billing-page-shared";

export { BillingAiTab, type BillingAiFilters } from "./billing-ai-tab";

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
