"use client";

import { Loader2 } from "lucide-react";

import { FormSelect } from "@/components/admin/form-select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { formatLeadAppointmentOption } from "./leads-workbench-paging";
import type { Appointment, LeadAction, LeadDetail, Pagination } from
  "./leads-workbench-logic";

export type Option = { value: string; label: string };
export type ActionValues = {
  assigneeId?: string; appointmentId?: string; followUpType?: string;
  summary?: string; result?: string; nextFollowUpAt?: string;
  appointmentStatus?: string; confirmedVisitAt?: string; reason?: string;
};
export type ActionErrors = Partial<Record<keyof ActionValues, string>>;

export function LeadDetailPanel({ detail, actions, busy, followUpLoading,
  followUpError = null, onAction, onFollowUpPage, onFollowUpRetry = () => undefined }: {
  detail: LeadDetail; actions: readonly LeadAction[]; busy: boolean;
  followUpLoading: boolean; followUpError?: string | null;
  onAction: (action: LeadAction) => void; onFollowUpPage: (page: number) => void;
  onFollowUpRetry?: () => void;
}) {
  const attributionEntries = Object.entries(detail.attribution);
  const appointment = detail.latest_appointment;
  return <div className="flex flex-col gap-6">
    <section className="flex flex-col gap-3"><h3 className="text-base font-semibold">客户概览</h3><dl className="grid gap-3 text-sm sm:grid-cols-2"><DetailItem label="联系人" value={detail.name || "未填写"} /><DetailItem label="手机号" value={detail.phone_masked || "未提供"} /><DetailItem label="小区" value={detail.community || "未填写"} /><DetailItem label="负责人" value={detail.assignee?.name || "待分配"} /><DetailItem label="客户状态" value={detail.customer ? "已关联客户" : "尚未关联客户"} /><DetailItem label="装修需求" value={detail.demand || "未填写"} /></dl></section>
    <section className="flex flex-col gap-3"><h3 className="text-base font-semibold">预约信息</h3>{appointment ? <dl className="grid gap-3 text-sm sm:grid-cols-2"><DetailItem label="预约编号" value={appointment.appointment_no} /><DetailItem label="预约时间" value={formatAppointment(appointment)} /><DetailItem label="预约小区" value={appointment.community} /><DetailItem label="预约状态" value={appointmentStatusLabel(appointment.status)} /></dl> : <CompactEmpty title="暂无量房预约" description="该线索尚未关联可展示的量房预约。" />}</section>
    <section className="flex flex-col gap-3"><h3 className="text-base font-semibold">来源归因</h3>{attributionEntries.length ? <dl className="grid gap-3 text-sm sm:grid-cols-2">{attributionEntries.map(([key, value]) => <DetailItem key={key} label={attributionLabel(key)} value={attributionValue(key, value)} />)}</dl> : <CompactEmpty title="暂无来源归因" description="本次提交未携带可展示的来源信息。" />}</section>
    <section className="flex flex-col gap-3"><h3 className="text-base font-semibold">确定性预算</h3>{detail.budget ? <dl className="grid gap-3 text-sm sm:grid-cols-2"><DetailItem label="预算编号" value={detail.budget.estimate_no} /><DetailItem label="预算区间" value={`${formatMoney(detail.budget.minimum_total)} 至 ${formatMoney(detail.budget.maximum_total)}`} /></dl> : <CompactEmpty title="暂无预算结果" description="该预约未关联有效的确定性预算快照。" />}</section>
    <section className="flex flex-col gap-3"><h3 className="text-base font-semibold">AI 建议</h3>{detail.ai ? <div className="flex flex-col gap-3 text-sm"><p>{detail.ai.summary}</p><AdviceList title="预算分配" items={detail.ai.allocation_advice} /><AdviceList title="风险提示" items={detail.ai.risk_factors} /><AdviceList title="量房问题" items={detail.ai.onsite_questions} /></div> : <CompactEmpty title="暂无 AI 建议" description="仅展示预算分析成功且结构完整的建议。" />}</section>
    <section className="flex flex-col gap-3"><h3 className="text-base font-semibold">跟进历史</h3>{followUpError ? <Alert variant="destructive"><AlertTitle>跟进记录加载失败</AlertTitle><AlertDescription className="flex flex-wrap items-center justify-between gap-2"><span>{followUpError}</span><Button type="button" size="sm" variant="outline" disabled={followUpLoading} onClick={onFollowUpRetry}>重试跟进记录</Button></AlertDescription></Alert> : null}{followUpLoading ? <Skeleton className="h-16 w-full" aria-label="正在加载跟进记录" /> : null}{detail.follow_ups.list.length ? <div className="flex flex-col gap-3">{detail.follow_ups.list.map((item, index) => <div key={`${item.created_at}-${index}`} className="rounded-md border p-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><span className="font-medium">{item.employee_name || "经办员工"} · {followUpTypeLabel(item.follow_up_type)}</span><time className="tabular-nums text-muted-foreground">{formatDateTime(item.created_at)}</time></div><p className="mt-2">{item.summary}</p><p className="mt-1 text-muted-foreground">{item.result}</p></div>)}</div> : <CompactEmpty title="暂无跟进记录" description="记录电话、微信或上门沟通后会显示在这里。" />}<PageButtons label="跟进记录分页" pagination={detail.follow_ups.pagination} loading={followUpLoading} previous="上一页跟进" next="下一页跟进" onPage={onFollowUpPage} /></section>
    {actions.length ? <section className="sticky bottom-0 flex flex-wrap gap-2 border-t bg-background py-4">{actions.map((item) => <Button key={item} variant={item === "mark_invalid" ? "destructive" : item === "convert" ? "default" : "outline"} disabled={busy} onClick={() => onAction(item)}>{actionButtonLabel(item)}</Button>)}</section> : null}
  </div>;
}

export function LeadActionForm({ action, appointments, appointmentPagination,
  appointmentLoading = false, appointmentError = null, assigneeOptions,
  assigneeKeyword = "", assigneeLoading = false, assigneeError = null,
  assigneeHasMore = false, values, errors, disabled,
  onAppointmentPage = () => undefined, onAppointmentRetry = () => undefined,
  onAssigneeKeywordChange = () => undefined, onAssigneeSearch = () => undefined, onChange }: {
  action: LeadAction; appointments: readonly Appointment[];
  appointmentPagination?: Pagination; appointmentLoading?: boolean;
  appointmentError?: string | null; assigneeOptions: readonly Option[];
  assigneeKeyword?: string; assigneeLoading?: boolean; assigneeError?: string | null;
  assigneeHasMore?: boolean; values: ActionValues; errors: ActionErrors; disabled: boolean;
  onAppointmentPage?: (page: number) => void; onAppointmentRetry?: () => void;
  onAssigneeKeywordChange?: (value: string) => void; onAssigneeSearch?: () => void;
  onChange: (patch: Partial<ActionValues>) => void;
}) {
  if (action === "convert") return <Alert><AlertTitle>确认转为客户</AlertTitle><AlertDescription>已有客户由服务端直接复用；新客户仅在服务端预检通过后创建。</AlertDescription></Alert>;
  if (action === "assign") return <FieldGroup><Field><FieldLabel htmlFor="douyin-lead-assignee-search">搜索负责人</FieldLabel><div className="flex gap-2"><Input id="douyin-lead-assignee-search" value={assigneeKeyword} disabled={disabled || assigneeLoading} maxLength={100} placeholder="输入员工姓名" onChange={(event) => onAssigneeKeywordChange(event.target.value)} /><Button type="button" variant="outline" disabled={disabled || assigneeLoading} onClick={onAssigneeSearch}>{assigneeLoading ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}搜索负责人</Button></div></Field>{assigneeError ? <Alert variant="destructive"><AlertTitle>负责人候选加载失败</AlertTitle><AlertDescription className="flex flex-wrap items-center justify-between gap-2"><span>{assigneeError}</span><Button type="button" size="sm" variant="outline" disabled={disabled || assigneeLoading} onClick={onAssigneeSearch}>重试负责人候选</Button></AlertDescription></Alert> : null}{assigneeLoading ? <Skeleton className="h-9 w-full" aria-label="正在加载负责人候选" /> : null}{!assigneeLoading && !assigneeError && assigneeOptions.length === 0 ? <CompactEmpty title="暂无可分配负责人" description="调整姓名关键词后重新搜索。" /> : null}{assigneeOptions.length ? <Field data-invalid={Boolean(errors.assigneeId) || undefined}><FieldLabel htmlFor="douyin-lead-assignee">负责人</FieldLabel><FormSelect id="douyin-lead-assignee" value={values.assigneeId || ""} disabled={disabled || assigneeLoading} invalid={Boolean(errors.assigneeId)} aria-describedby={errors.assigneeId ? "douyin-lead-assignee-error" : assigneeHasMore ? "douyin-lead-assignee-more" : undefined} options={assigneeOptions} onChange={(value) => onChange({ assigneeId: value })} /><FieldError id="douyin-lead-assignee-error">{errors.assigneeId}</FieldError>{assigneeHasMore ? <p id="douyin-lead-assignee-more" className="text-xs text-muted-foreground">候选超过 100 位，请输入姓名缩小范围。</p> : null}</Field> : null}</FieldGroup>;
  if (action === "mark_invalid") return <Field data-invalid={Boolean(errors.reason) || undefined}><FieldLabel htmlFor="douyin-lead-invalid-reason">无效原因</FieldLabel><Textarea id="douyin-lead-invalid-reason" value={values.reason || ""} disabled={disabled} maxLength={500} aria-invalid={Boolean(errors.reason)} aria-describedby={errors.reason ? "douyin-lead-invalid-reason-error" : undefined} onChange={(event) => onChange({ reason: event.target.value })} /><FieldError id="douyin-lead-invalid-reason-error">{errors.reason}</FieldError></Field>;
  const options = appointments.map((item) => ({ value: item.id,
    label: formatLeadAppointmentOption(item) }));
  return <FieldGroup>{appointmentError ? <Alert variant="destructive"><AlertTitle>量房预约加载失败</AlertTitle><AlertDescription className="flex flex-wrap items-center justify-between gap-2"><span>{appointmentError}</span><Button type="button" size="sm" variant="outline" disabled={disabled || appointmentLoading} onClick={onAppointmentRetry}>重试量房预约</Button></AlertDescription></Alert> : null}{appointmentLoading ? <Skeleton className="h-9 w-full" aria-label="正在加载量房预约" /> : null}{!appointmentLoading && !appointmentError && appointments.length === 0 ? <CompactEmpty title="暂无量房预约" description="该线索没有可用于跟进的量房预约。" /> : null}<Field data-invalid={Boolean(errors.appointmentId) || undefined}><FieldLabel htmlFor="douyin-lead-follow-appointment">量房预约</FieldLabel><FormSelect id="douyin-lead-follow-appointment" value={values.appointmentId || ""} options={options} disabled={disabled || appointmentLoading || appointments.length === 0} invalid={Boolean(errors.appointmentId)} aria-describedby={errors.appointmentId ? "douyin-lead-follow-appointment-error" : undefined} onChange={(value) => onChange({ appointmentId: value })} /><FieldError id="douyin-lead-follow-appointment-error">{errors.appointmentId}</FieldError></Field>{appointmentPagination ? <PageButtons label="量房预约分页" pagination={appointmentPagination} loading={appointmentLoading || disabled} previous="上一页预约" next="下一页预约" onPage={onAppointmentPage} /> : null}<Field><FieldLabel htmlFor="douyin-lead-follow-type">跟进方式</FieldLabel><FormSelect id="douyin-lead-follow-type" value={values.followUpType || "phone"} disabled={disabled} options={[{ value: "phone", label: "电话" }, { value: "wechat", label: "微信" }, { value: "online_meeting", label: "线上会议" }, { value: "onsite", label: "现场沟通" }, { value: "other", label: "其他" }]} onChange={(value) => onChange({ followUpType: value })} /></Field><ActionTextarea id="douyin-lead-follow-summary" label="跟进摘要" value={values.summary || ""} error={errors.summary} maxLength={500} disabled={disabled} onChange={(summary) => onChange({ summary })} /><ActionTextarea id="douyin-lead-follow-result" label="沟通结果" value={values.result || ""} error={errors.result} maxLength={1000} disabled={disabled} onChange={(result) => onChange({ result })} /><Field><FieldLabel htmlFor="douyin-lead-next-follow-up">下次跟进时间（选填）</FieldLabel><Input id="douyin-lead-next-follow-up" type="datetime-local" value={values.nextFollowUpAt || ""} disabled={disabled} onChange={(event) => onChange({ nextFollowUpAt: event.target.value })} /></Field><Field><FieldLabel htmlFor="douyin-lead-appointment-status">预约状态（选填）</FieldLabel><FormSelect id="douyin-lead-appointment-status" value={values.appointmentStatus || "__keep"} disabled={disabled} options={[{ value: "__keep", label: "保持当前状态" }, { value: "confirmed", label: "确认量房" }, { value: "completed", label: "完成量房" }, { value: "canceled", label: "取消预约" }, { value: "invalid", label: "预约无效" }]} onChange={(value) => onChange({ appointmentStatus: value === "__keep" ? "" : value })} /></Field>{values.appointmentStatus === "confirmed" ? <Field data-invalid={Boolean(errors.confirmedVisitAt) || undefined}><FieldLabel htmlFor="douyin-lead-confirmed-visit">确认量房时间</FieldLabel><Input id="douyin-lead-confirmed-visit" type="datetime-local" value={values.confirmedVisitAt || ""} disabled={disabled} aria-invalid={Boolean(errors.confirmedVisitAt)} aria-describedby={errors.confirmedVisitAt ? "douyin-lead-confirmed-visit-error" : undefined} onChange={(event) => onChange({ confirmedVisitAt: event.target.value })} /><FieldError id="douyin-lead-confirmed-visit-error">{errors.confirmedVisitAt}</FieldError></Field> : null}</FieldGroup>;
}

function PageButtons({ label, pagination, loading, previous, next, onPage }: {
  label: string; pagination: Pagination; loading: boolean; previous: string; next: string;
  onPage: (page: number) => void;
}) {
  return <nav className="flex items-center justify-between gap-2" aria-label={label}><span className="text-xs tabular-nums text-muted-foreground">第 {pagination.page} / {Math.max(pagination.totalPages, 1)} 页</span><div className="flex gap-2"><Button type="button" variant="outline" size="sm" disabled={loading || pagination.page <= 1} onClick={() => onPage(pagination.page - 1)}>{previous}</Button><Button type="button" variant="outline" size="sm" disabled={loading || pagination.page >= pagination.totalPages} onClick={() => onPage(pagination.page + 1)}>{next}</Button></div></nav>;
}
function ActionTextarea({ id, label, value, error, maxLength, disabled, onChange }: { id: string; label: string; value: string; error?: string; maxLength: number; disabled: boolean; onChange: (value: string) => void }) { const errorId = `${id}-error`; return <Field data-invalid={Boolean(error) || undefined}><FieldLabel htmlFor={id}>{label}</FieldLabel><Textarea id={id} value={value} maxLength={maxLength} disabled={disabled} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} onChange={(event) => onChange(event.target.value)} /><FieldError id={errorId}>{error}</FieldError></Field>; }
function formatAppointment(item: Appointment) { return `${item.preferred_visit_date} ${{ morning: "上午", afternoon: "下午", evening: "晚上" }[item.preferred_visit_period]}`; }
function appointmentStatusLabel(status: string) { return ({ pending_confirmation: "待确认", confirmed: "已确认", completed: "已完成", canceled: "已取消", invalid: "已作废" } as Record<string, string>)[status] ?? "未知状态"; }
function formatDateTime(value: string) { return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Shanghai" }).format(new Date(value)); }
function formatMoney(value: number) { return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 0 }).format(value); }
function actionButtonLabel(action: LeadAction) { return ({ assign: "分配负责人", follow_up: "记录跟进", convert: "转为客户", mark_invalid: "判为无效" })[action]; }
function followUpTypeLabel(type: string) { return ({ phone: "电话", wechat: "微信", online_meeting: "线上会议", onsite: "现场沟通", other: "其他" } as Record<string, string>)[type] ?? "跟进"; }
function attributionLabel(key: string) { return ({ source_type: "来源类型", entry_path: "来源页面", scene: "抖音场景", campaign_code: "活动编号", content_id: "内容编号" } as Record<string, string>)[key] ?? "来源信息"; }
function attributionValue(key: string, value: string) { return key === "source_type" ? ({ short_video: "短视频", live: "直播", search: "搜索", profile: "主页", share: "分享", direct: "直接访问", other: "其他" } as Record<string, string>)[value] ?? "其他" : value; }
function DetailItem({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-words">{value}</dd></div>; }
function AdviceList({ title, items }: { title: string; items: readonly string[] }) { return items.length ? <div><p className="font-medium">{title}</p><ul className="mt-1 list-disc pl-5 text-muted-foreground">{items.map((item) => <li key={item}>{item}</li>)}</ul></div> : null; }
function CompactEmpty({ title, description }: { title: string; description: string }) { return <Empty className="min-h-32 p-4"><EmptyHeader><EmptyTitle className="text-base">{title}</EmptyTitle><EmptyDescription>{description}</EmptyDescription></EmptyHeader></Empty>; }
