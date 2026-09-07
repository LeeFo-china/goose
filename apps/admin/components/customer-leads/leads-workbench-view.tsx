"use client";
import { type FormEvent, useEffect, useState } from "react";
import { CUSTOMER_LEAD_ERROR_CONFIG } from "@gooes/domain";
import { Loader2, Search } from "lucide-react";
import { FormSelect } from "@/components/admin/form-select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Appointment, LeadAction, LeadFilters, LeadPage, FollowUpPage } from "./leads-workbench-logic";
import type { ActionErrors, ActionValues, Option } from "./leads-workbench-panels";
import { transitionLeadPageState } from "./leads-workbench-paging";
const STATUS_OPTIONS = [
  { value: "__all", label: "全部状态" }, { value: "new", label: "新线索" },
  { value: "contacted", label: "跟进中" }, { value: "converted", label: "已转客户" },
  { value: "invalid", label: "已关闭" },
];

export function validateLeadFilterDraft(filters: LeadFilters): string | null {
  if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) return "结束日期不能早于开始日期";
  return /^[\p{L}\p{N}\s#号栋室-]{0,80}$/u.test(filters.keyword.trim()) ? null : "关键词格式无效";
}

export function getLeadActionFailure(error: unknown): { message: string; requiresRefresh: boolean } {
  if (typeof error === "object" && error !== null && "status" in error && error.status === 409) {
    const code = "code" in error && typeof error.code === "string" ? error.code : "";
    const message = Object.hasOwn(CUSTOMER_LEAD_ERROR_CONFIG, code)
      ? CUSTOMER_LEAD_ERROR_CONFIG[code as keyof typeof CUSTOMER_LEAD_ERROR_CONFIG].message
      : code === "DOUYIN_LEAD_VERSION_CONFLICT" ? "线索已更新，请刷新后重试"
        : "线索状态已变化，请刷新后重新确认";
    return { message, requiresRefresh: true };
  }
  return { message: "线索操作结果未确认，请检查当前状态和权限后重试", requiresRefresh: false };
}

export function LeadFiltersToolbar({ filters, assigneeOptions, assigneeKeyword, sourceFilters = false,
  assigneeLoading, assigneeError, assigneeHasMore, disabled,
  onAssigneeKeywordChange, onAssigneeSearch, onNavigate }: {
  sourceFilters?: boolean; filters: LeadFilters; assigneeOptions: readonly Option[]; assigneeKeyword: string;
  assigneeLoading: boolean; assigneeError: string | null; assigneeHasMore: boolean;
  disabled: boolean; onAssigneeKeywordChange: (value: string) => void;
  onAssigneeSearch: (includeEmployeeId: string) => void;
  onNavigate: (filters: LeadFilters) => void;
}) {
  const [draft, setDraft] = useState(filters);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setDraft(filters), [filters]);
  function submit(event: FormEvent) { event.preventDefault();
    const validationError = validateLeadFilterDraft(draft);
    if (validationError) { setError(validationError); return; }
    setError(null); onNavigate({ ...draft, page: 1, keyword: draft.keyword.trim() }); }
  function searchAssigneeOptions() {
    onAssigneeSearch(draft.assigneeId);
  }
  return <form className="grid gap-2 md:grid-cols-2 xl:grid-cols-4" onSubmit={submit}>
    {sourceFilters ? <><Field><FieldLabel className="sr-only" htmlFor="customer-lead-source">来源</FieldLabel><FormSelect id="customer-lead-source" value={draft.source || "__all"} disabled={disabled} options={[{ value: "__all", label: "全部来源" }, { value: "douyin_miniapp", label: "抖音小程序" }, { value: "h5", label: "H5活动" }]} onChange={(value) => setDraft({ ...draft, source: value === "douyin_miniapp" || value === "h5" ? value : "" })} /></Field><Field><FieldLabel className="sr-only" htmlFor="customer-lead-assignment">分配状态</FieldLabel><FormSelect id="customer-lead-assignment" value={draft.assignment || "all"} disabled={disabled} options={[{ value: "all", label: "全部分配状态" }, { value: "assigned", label: "已分配" }, { value: "unassigned", label: "未分配" }]} onChange={(value) => setDraft({ ...draft, assignment: value as LeadFilters["assignment"], ...(value === "unassigned" ? { assigneeId: "" } : {}) })} /></Field></> : null}
    <Field><FieldLabel className="sr-only" htmlFor="douyin-lead-status-filter">状态</FieldLabel><FormSelect id="douyin-lead-status-filter" value={draft.status || "__all"} disabled={disabled} options={STATUS_OPTIONS} onChange={(value) => setDraft({ ...draft, status: value === "__all" ? "" : value as LeadFilters["status"] })} /></Field>
    <Field><FieldLabel className="sr-only" htmlFor="douyin-lead-assignee-filter-search">搜索负责人筛选</FieldLabel><div className="flex gap-2"><Input id="douyin-lead-assignee-filter-search" value={assigneeKeyword} disabled={disabled || assigneeLoading} maxLength={100} placeholder="搜索负责人" onChange={(event) => onAssigneeKeywordChange(event.target.value)} /><Button type="button" variant="outline" disabled={disabled || assigneeLoading} onClick={searchAssigneeOptions}>{assigneeLoading ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Search data-icon="inline-start" />}搜索</Button></div></Field>
    <Field><FieldLabel className="sr-only" htmlFor="douyin-lead-assignee-filter">负责人</FieldLabel><FormSelect id="douyin-lead-assignee-filter" value={draft.assigneeId || "__all"} disabled={disabled || assigneeLoading || assigneeOptions.length === 0 || draft.assignment === "unassigned"} options={[{ value: "__all", label: "全部负责人" }, ...assigneeOptions]} onChange={(value) => setDraft({ ...draft, assigneeId: value === "__all" ? "" : value })} /></Field>
    <Field><FieldLabel className="sr-only" htmlFor="douyin-lead-date-from">开始日期</FieldLabel><Input id="douyin-lead-date-from" type="date" value={draft.dateFrom} disabled={disabled} onChange={(event) => setDraft({ ...draft, dateFrom: event.target.value })} /></Field>
    <Field><FieldLabel className="sr-only" htmlFor="douyin-lead-date-to">结束日期</FieldLabel><Input id="douyin-lead-date-to" type="date" value={draft.dateTo} disabled={disabled} aria-invalid={Boolean(error)} aria-describedby={error ? "douyin-lead-filter-error" : undefined} onChange={(event) => setDraft({ ...draft, dateTo: event.target.value })} /></Field>
    <Field data-invalid={Boolean(error) || undefined}><FieldLabel className="sr-only" htmlFor="douyin-lead-keyword-filter">关键词</FieldLabel><Input id="douyin-lead-keyword-filter" value={draft.keyword} disabled={disabled} placeholder="姓名、手机号或小区" aria-invalid={Boolean(error)} aria-describedby={error ? "douyin-lead-filter-error" : undefined} onChange={(event) => setDraft({ ...draft, keyword: event.target.value })} /><FieldError id="douyin-lead-filter-error">{error}</FieldError></Field>
    <Button type="submit" variant="outline" disabled={disabled}><Search data-icon="inline-start" />筛选</Button>
    {assigneeError ? <Alert variant="destructive" className="md:col-span-2 xl:col-span-full"><AlertTitle>负责人筛选项加载失败</AlertTitle><AlertDescription className="flex flex-wrap items-center justify-between gap-2"><span>{assigneeError}</span><Button type="button" size="sm" variant="outline" disabled={disabled || assigneeLoading} onClick={searchAssigneeOptions}>重试负责人筛选项</Button></AlertDescription></Alert> : null}
    {assigneeLoading ? <Skeleton className="h-9 md:col-span-2 xl:col-span-full" aria-label="正在加载负责人筛选项" /> : null}
    {!assigneeLoading && !assigneeError && assigneeOptions.length === 0 ? <Empty className="min-h-16 p-2 md:col-span-2 xl:col-span-full"><EmptyHeader><EmptyTitle className="text-sm">暂无负责人筛选项</EmptyTitle><EmptyDescription>调整员工姓名后重新搜索。</EmptyDescription></EmptyHeader></Empty> : null}
    {assigneeHasMore ? <p className="text-xs text-muted-foreground md:col-span-2 xl:col-span-full">负责人超过 100 位，请输入姓名缩小筛选范围。</p> : null}
  </form>;
}

export function LeadTable({ page, onOpen, showSource = false }: { page: LeadPage; showSource?: boolean; onOpen: (id: string) => void }) {
  return <Table containerClassName="min-w-[1040px]"><TableHeader className="sticky top-0 bg-card"><TableRow><TableHead>联系人</TableHead>{showSource ? <TableHead>来源</TableHead> : null}<TableHead>手机号</TableHead><TableHead>小区</TableHead><TableHead>预约时间</TableHead><TableHead>预算区间</TableHead><TableHead>状态</TableHead><TableHead>负责人</TableHead><TableHead>客户关联状态</TableHead><TableHead className="text-right">操作</TableHead></TableRow></TableHeader><TableBody>{page.list.map((lead) => <TableRow key={lead.id}><TableCell className="font-medium">{lead.name || "未填写"}</TableCell>{showSource ? <TableCell>{lead.source_label}</TableCell> : null}<TableCell className="tabular-nums">{lead.phone_masked || "未提供"}</TableCell><TableCell>{lead.community || "未填写"}</TableCell><TableCell className="tabular-nums">{lead.latest_appointment ? formatAppointment(lead.latest_appointment) : lead.source === "h5" ? "不适用" : showSource ? "详情查看" : "未预约"}</TableCell><TableCell>{lead.latest_appointment?.budget_range ? `${formatMoney(lead.latest_appointment.budget_range.minimum_total)} 至 ${formatMoney(lead.latest_appointment.budget_range.maximum_total)}` : lead.source === "h5" ? "不适用" : showSource ? "详情查看" : "未提供"}</TableCell><TableCell><StatusBadge status={lead.status} /></TableCell><TableCell>{lead.assignee?.name || "待分配"}</TableCell><TableCell><Badge variant={(lead.customer || lead.customer_id || lead.status === "converted") ? "success" : "outline"}>{(lead.customer || lead.customer_id || lead.status === "converted") ? "已关联客户" : "待转客户"}</Badge></TableCell><TableCell className="text-right"><Button variant="ghost" size="sm" onClick={() => onOpen(lead.id)}>查看线索</Button></TableCell></TableRow>)}</TableBody></Table>;
}

export function validateAction(action: LeadAction, values: ActionValues, appointmentRequired = true): ActionErrors { const errors: ActionErrors = {}; if (action === "assign" && !values.assigneeId) errors.assigneeId = "请选择负责人"; if (action === "follow_up") { if (appointmentRequired && !values.appointmentId) errors.appointmentId = "请选择量房预约"; if (!values.summary?.trim()) errors.summary = "请填写跟进摘要"; if (!values.result?.trim()) errors.result = "请填写沟通结果"; if (values.appointmentId && values.appointmentStatus === "confirmed" && !values.confirmedVisitAt) errors.confirmedVisitAt = "请填写确认量房时间"; } if (action === "mark_invalid" && !values.reason?.trim()) errors.reason = "请填写无效原因"; return errors; }
export function transitionFollowUpPage(current: FollowUpPage, next: FollowUpPage): FollowUpPage { return transitionLeadPageState({ data: current, error: null }, { type: "success", data: next }).data; }
export function emptyPage(filters: LeadFilters): LeadPage { return { list: [], pagination: { page: filters.page, pageSize: filters.pageSize, total: 0, totalPages: 0 } }; }
export function actionPath(id: string, action: LeadAction, apiPath: string) { return `${apiPath}/${id}/${action === "assign" ? "assign" : action === "follow_up" ? "follow-ups" : action === "convert" ? "convert-customer" : "mark-invalid"}`; }
export function statusLabel(status: string) { return ({ new: "新线索", contacted: "跟进中", converted: "已转客户", invalid: "已关闭" } as Record<string, string>)[status] ?? "未知状态"; }
export function StatusBadge({ status }: { status: string }) { const variant = status === "converted" ? "success" : status === "invalid" ? "danger" : status === "contacted" ? "warning" : "secondary"; return <Badge variant={variant}>{statusLabel(status)}</Badge>; }
export function formatAppointment(item: Appointment) { return `${item.preferred_visit_date} ${{ morning: "上午", afternoon: "下午", evening: "晚上" }[item.preferred_visit_period]}`; }
export function formatMoney(value: number) { return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 0 }).format(value); }
export function actionTitle(action: LeadAction) { return ({ assign: "分配负责人", follow_up: "记录线索跟进", convert: "确认转为客户", mark_invalid: "确认判为无效" })[action]; }
export function actionSubmitLabel(action: LeadAction) { return ({ assign: "确认分配负责人", follow_up: "提交跟进记录", convert: "确认转为客户", mark_invalid: "确认判为无效" })[action]; }
export function actionSuccess(action: LeadAction) { return ({ assign: "负责人已更新", follow_up: "跟进记录已提交", convert: "客户转化已完成", mark_invalid: "线索已判为无效" })[action]; }
export function InlineError({ title, message, onRetry }: { title: string; message: string; onRetry: () => void }) { return <div className="flex flex-col gap-3 p-5"><Alert variant="destructive"><AlertTitle>{title}</AlertTitle><AlertDescription>{message}</AlertDescription></Alert><Button variant="outline" onClick={onRetry}>重新加载线索</Button></div>; }
export function LeadListSkeleton() { return <div className="flex flex-col gap-3 p-5" aria-label="正在加载线索"><Skeleton className="h-10 w-full" /><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div>; }
export function DetailSkeleton() { return <div className="flex flex-col gap-4" aria-label="正在加载线索详情"><Skeleton className="h-20 w-full" /><Skeleton className="h-32 w-full" /><Skeleton className="h-32 w-full" /></div>; }
