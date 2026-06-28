import { ShadowBillingRunButton, ManualRechargeButton } from "@/components/billing/billing-actions";
import { FilterSelect } from "@/components/admin/filter-select";
import { StatusAlert } from "@/components/admin/status-alert";
import type { BillingEventListData, BillingTenantListData } from "@/components/billing/billing-types";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TabsContent } from "@/components/ui/tabs";
import { eventStatusLabel, FilterInput, FilterPanel, formatCredits, formatDateTime, SectionHeader } from "@/app/(console)/platform/billing/billing-page-shared";

export function BillingTenantsTab({ tenants, tenantFilters }: { tenants: BillingTenantListData; tenantFilters: Record<string, string | undefined> }) {
  return (
            <TabsContent value="tenants" className="mt-0">
              <FilterPanel tab="tenants">
                <FilterInput
                  label="租户"
                  name="tenantKeyword"
                  defaultValue={tenantFilters.tenantKeyword}
                  placeholder="租户名称或标识"
                  labelVisibility="srOnly"
                />
                <FilterSelect
                  label="账户状态"
                  name="tenantStatus"
                  defaultValue={tenantFilters.tenantStatus}
                  options={[
                    { label: "正常", value: "active" },
                    { label: "暂停", value: "suspended" },
                    { label: "关闭", value: "closed" },
                  ]}
                />
                <FilterSelect
                  label="余额状态"
                  name="tenantLowBalance"
                  defaultValue={tenantFilters.tenantLowBalance}
                  options={[{ label: "只看低余额", value: "true" }]}
                />
              </FilterPanel>
              <div className="overflow-hidden rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>租户</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead className="text-right">可用</TableHead>
                      <TableHead className="text-right">冻结</TableHead>
                      <TableHead className="text-right">累计充值</TableHead>
                      <TableHead className="text-right">累计消耗</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tenants.list.map((tenant) => (
                      <TableRow key={tenant.id}>
                        <TableCell>
                          <div className="font-medium">{tenant.name || tenant.slug || "未命名租户"}</div>
                          <div className="text-xs text-muted-foreground">{tenant.slug || tenant.id}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={tenant.low_balance ? "warning" : "outline"}>
                            {tenant.low_balance ? "低余额" : tenant.billing_account.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{formatCredits(tenant.billing_account.available_credits)}</TableCell>
                        <TableCell className="text-right">{formatCredits(tenant.billing_account.frozen_credits)}</TableCell>
                        <TableCell className="text-right">{formatCredits(tenant.billing_account.total_recharged_credits)}</TableCell>
                        <TableCell className="text-right">{formatCredits(tenant.billing_account.total_consumed_credits)}</TableCell>
                        <TableCell className="text-right">
                          <ManualRechargeButton tenant={tenant} />
                        </TableCell>
                      </TableRow>
                    ))}
                    {!tenants.list.length ? (
                      <TableRow>
                        <TableCell colSpan={7} className="h-24 text-center text-sm text-muted-foreground">
                          暂无租户账户
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
  );
}

export function BillingEventsTab({ events, eventFilters }: { events: BillingEventListData; eventFilters: Record<string, string | undefined> }) {
  return (
            <TabsContent value="events" className="mt-0">
              <SectionHeader
                title="影子计费"
                description="从 AI、短信、短视频日志生成预计账单，不扣真实积分。"
                action={<ShadowBillingRunButton />}
              />
              <FilterPanel tab="events">
                <FilterInput
                  label="租户"
                  name="eventTenantKeyword"
                  defaultValue={eventFilters.eventTenantKeyword}
                  placeholder="租户名称或标识"
                />
                <FilterInput
                  label="计费项"
                  name="eventMetricCode"
                  defaultValue={eventFilters.eventMetricCode}
                  placeholder="metric_code"
                />
                <FilterInput
                  label="场景"
                  name="eventSceneCode"
                  defaultValue={eventFilters.eventSceneCode}
                  placeholder="scene_code"
                />
                <FilterInput
                  label="来源"
                  name="eventSourceType"
                  defaultValue={eventFilters.eventSourceType}
                  placeholder="source_type"
                />
                <FilterSelect
                  label="状态"
                  name="eventStatus"
                  defaultValue={eventFilters.eventStatus}
                  options={[
                    { label: "待处理", value: "pending" },
                    { label: "已试算", value: "estimated" },
                    { label: "已扣费", value: "charged" },
                    { label: "已免除", value: "waived" },
                    { label: "已退回", value: "refunded" },
                    { label: "异常", value: "failed" },
                  ]}
                />
                <FilterInput label="开始时间" name="eventStartDate" type="date" defaultValue={eventFilters.eventStartDate} />
                <FilterInput label="结束时间" name="eventEndDate" type="date" defaultValue={eventFilters.eventEndDate} />
              </FilterPanel>
              <div className="overflow-hidden rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>时间</TableHead>
                      <TableHead>租户</TableHead>
                      <TableHead>计费项</TableHead>
                      <TableHead>来源</TableHead>
                      <TableHead className="text-right">用量</TableHead>
                      <TableHead className="text-right">预计积分</TableHead>
                      <TableHead>状态</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {events.list.map((event) => (
                      <TableRow key={event.id}>
                        <TableCell>{formatDateTime(event.created_at)}</TableCell>
                        <TableCell>{event.tenant?.name || event.tenant?.slug || event.tenant_id}</TableCell>
                        <TableCell>
                          <div className="font-medium">{event.metric_code}</div>
                          <div className="text-xs text-muted-foreground">{event.scene_code || "-"}</div>
                        </TableCell>
                        <TableCell>
                          <div>{event.source_type}</div>
                          <div className="text-xs text-muted-foreground">{event.source_sub_id || event.source_id}</div>
                        </TableCell>
                        <TableCell className="text-right">
                          {Number(event.billable_units || 0).toLocaleString("zh-CN")} {event.unit_name}
                        </TableCell>
                        <TableCell className="text-right">{formatCredits(event.credits)}</TableCell>
                        <TableCell>
                          <Badge variant={event.status === "failed" ? "danger" : "outline"}>
                            {eventStatusLabel(event.status)}
                          </Badge>
                          {event.failure_message ? (
                            <div className="mt-1 text-xs text-muted-foreground">{event.failure_message}</div>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                    {!events.list.length ? (
                      <TableRow>
                        <TableCell colSpan={7} className="h-24 text-center text-sm text-muted-foreground">
                          暂无影子计费事件
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
  );
}
