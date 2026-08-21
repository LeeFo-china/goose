"use client";

import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Inbox, Loader2, Search, UserRoundSearch } from "lucide-react";
import { toast } from "sonner";

import { FormSelect } from "@/components/admin/form-select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { requestBackendJson } from "@/lib/backend-client";
import {
  buildLeadApiQuery, buildLeadCommand, buildLeadHref,
  createLatestLeadListTarget, createLeadIdempotencyIntent,
  createLeadRequestAuthority, createSubmissionGate, getAllowedLeadActions,
  getLeadViewState, isLeadCommandResult, normalizeFollowUpPage,
  normalizeAssigneeCandidatePage, normalizeLeadDetail, normalizeLeadPage,
  normalizeLeadDateRange, parseLeadFilters,
  type Appointment, type LeadAction,
  type LeadDetail, type LeadFilters, type LeadPage,
} from "./leads-workbench-logic";

export type { LeadDetail, LeadPage } from "./leads-workbench-logic";
type Option = { value: string; label: string };
type ActionValues = {
  assigneeId?: string; appointmentId?: string; followUpType?: string;
  summary?: string; result?: string; nextFollowUpAt?: string;
  appointmentStatus?: string; confirmedVisitAt?: string; reason?: string;
};
type ActionErrors = Partial<Record<keyof ActionValues, string>>;
const API_PATH = "/tenant/douyin-miniapp/leads";
const FOLLOW_UP_PAGE_SIZE = 20;
const STATUS_OPTIONS = [
  { value: "__all", label: "全部状态" }, { value: "new", label: "新线索" },
  { value: "contacted", label: "跟进中" }, { value: "converted", label: "已转客户" },
  { value: "invalid", label: "已关闭" },
];

export function createActionSubmissionCoordinator() {
  let commandAccepted = false;
  return {
    nextStep: () => commandAccepted ? "refresh" as const : "mutate" as const,
    acceptCommand: () => { commandAccepted = true; },
    reset: () => { commandAccepted = false; },
  };
}

export function buildAssigneeOptionsPath(kind: "assign" | "filter", keyword: string) {
  const params = new URLSearchParams({ page: "1", pageSize: "100" });
  const normalizedKeyword = keyword.trim();
  if (normalizedKeyword) params.set("keyword", normalizedKeyword);
  const resource = kind === "assign" ? "assignee-candidates" : "assignee-filter-options";
  return `${API_PATH}/${resource}?${params}`;
}

export function validateLeadFilterDraft(filters: LeadFilters): string | null {
  if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) return "结束日期不能早于开始日期";
  return /^[\p{L}\p{N}\s#号栋室-]{0,80}$/u.test(filters.keyword.trim()) ? null : "关键词格式无效";
}

export function LeadsWorkbench({ initialData, initialError, initialFilters,
  permissions }: {
  initialData: LeadPage; initialError: string | null; initialFilters: LeadFilters;
  permissions: readonly string[];
}) {
  const [data, setData] = useState(initialData);
  const [filters, setFilters] = useState(initialFilters);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState(initialError);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<LeadDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [followUpLoading, setFollowUpLoading] = useState(false);
  const [action, setAction] = useState<LeadAction | null>(null);
  const [actionValues, setActionValues] = useState<ActionValues>({});
  const [actionErrors, setActionErrors] = useState<ActionErrors>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [commandAccepted, setCommandAccepted] = useState(false);
  const [assigneeOptions, setAssigneeOptions] = useState<Option[]>([]);
  const [assigneeKeyword, setAssigneeKeyword] = useState("");
  const [assigneeLoading, setAssigneeLoading] = useState(false);
  const [assigneeError, setAssigneeError] = useState<string | null>(null);
  const [assigneeHasMore, setAssigneeHasMore] = useState(false);
  const [filterAssigneeOptions, setFilterAssigneeOptions] = useState<Option[]>([]);
  const [filterAssigneeKeyword, setFilterAssigneeKeyword] = useState("");
  const [filterAssigneeLoading, setFilterAssigneeLoading] = useState(false);
  const [filterAssigneeError, setFilterAssigneeError] = useState<string | null>(null);
  const [filterAssigneeHasMore, setFilterAssigneeHasMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const listAuthority = useRef(createLeadRequestAuthority()).current;
  const detailAuthority = useRef(createLeadRequestAuthority()).current;
  const mutationAuthority = useRef(createLeadRequestAuthority()).current;
  const assigneeAuthority = useRef(createLeadRequestAuthority()).current;
  const filterAssigneeAuthority = useRef(createLeadRequestAuthority()).current;
  const submissionGate = useRef(createSubmissionGate()).current;
  const actionSubmission = useRef(createActionSubmissionCoordinator()).current;
  const idempotencyIntent = useRef(createLeadIdempotencyIntent()).current;
  const actionLeadVersion = useRef<number | null>(null);
  const listTarget = useRef(createLatestLeadListTarget(initialFilters)).current;
  const allowedActions = getAllowedLeadActions(permissions);
  const canAssign = permissions.includes("douyin_lead.assign");
  const viewState = getLeadViewState({ loading, error: listError, count: data.list.length });

  const loadList = useCallback(async (next: LeadFilters): Promise<boolean> => {
    listTarget.update(next); setFilters(next);
    const request = listAuthority.begin();
    setLoading(true); setListError(null);
    try {
      const raw = await requestBackendJson<unknown>(`${API_PATH}?${buildLeadApiQuery(next)}`, {
        cache: "no-store", signal: request.controller.signal,
        fallbackMessage: "抖音线索列表加载失败",
      });
      if (!listAuthority.isCurrent(request)) return false;
      const parsed = normalizeLeadPage(raw, next);
      if (!parsed) { setData(emptyPage(next)); setListError("线索列表响应无效，请重试"); return false; }
      setData(parsed); return true;
    } catch {
      if (!listAuthority.isCurrent(request)) return false;
      setData(emptyPage(next)); setListError("抖音线索列表加载失败，请重试"); return false;
    } finally {
      if (listAuthority.isCurrent(request)) setLoading(false);
    }
  }, [listAuthority, listTarget]);

  const loadDetail = useCallback(async (leadId: string): Promise<boolean> => {
    const request = detailAuthority.begin();
    setDetailLoading(true); setDetailError(null);
    try {
      const raw = await requestBackendJson<unknown>(`${API_PATH}/${leadId}`, {
        cache: "no-store", signal: request.controller.signal,
        fallbackMessage: "线索详情加载失败",
      });
      if (!detailAuthority.isCurrent(request)) return false;
      const parsed = normalizeLeadDetail(raw);
      if (!parsed || parsed.id !== leadId) { setDetail(null); setDetailError("线索详情响应无效，请重试"); return false; }
      setDetail(parsed); return true;
    } catch {
      if (!detailAuthority.isCurrent(request)) return false;
      setDetail(null); setDetailError("线索详情加载失败，请重试"); return false;
    } finally {
      if (detailAuthority.isCurrent(request)) setDetailLoading(false);
    }
  }, [detailAuthority]);

  const loadAssigneeCandidates = useCallback(async (keyword: string) => {
    const request = assigneeAuthority.begin();
    setAssigneeLoading(true); setAssigneeError(null);
    try {
      const raw = await requestBackendJson<unknown>(
        buildAssigneeOptionsPath("assign", keyword),
        { cache: "no-store", signal: request.controller.signal,
          fallbackMessage: "负责人候选加载失败" },
      );
      if (!assigneeAuthority.isCurrent(request)) return;
      const parsed = normalizeAssigneeCandidatePage(raw);
      if (!parsed) { setAssigneeOptions([]); setAssigneeHasMore(false);
        setAssigneeError("负责人候选响应无效，请重试"); return; }
      setAssigneeOptions(parsed.list);
      setAssigneeHasMore(parsed.pagination.totalPages > 1);
    } catch {
      if (assigneeAuthority.isCurrent(request)) {
        setAssigneeOptions([]); setAssigneeHasMore(false);
        setAssigneeError("负责人候选加载失败，请重试");
      }
    } finally {
      if (assigneeAuthority.isCurrent(request)) setAssigneeLoading(false);
    }
  }, [assigneeAuthority]);

  const loadFilterAssigneeOptions = useCallback(async (keyword: string) => {
    const request = filterAssigneeAuthority.begin();
    setFilterAssigneeLoading(true); setFilterAssigneeError(null);
    try {
      const raw = await requestBackendJson<unknown>(
        buildAssigneeOptionsPath("filter", keyword),
        { cache: "no-store", signal: request.controller.signal,
          fallbackMessage: "负责人筛选项加载失败" },
      );
      if (!filterAssigneeAuthority.isCurrent(request)) return;
      const parsed = normalizeAssigneeCandidatePage(raw);
      if (!parsed) { setFilterAssigneeOptions([]); setFilterAssigneeHasMore(false);
        setFilterAssigneeError("负责人筛选项响应无效，请重试"); return; }
      setFilterAssigneeOptions(parsed.list);
      setFilterAssigneeHasMore(parsed.pagination.totalPages > 1);
    } catch {
      if (filterAssigneeAuthority.isCurrent(request)) {
        setFilterAssigneeOptions([]); setFilterAssigneeHasMore(false);
        setFilterAssigneeError("负责人筛选项加载失败，请重试");
      }
    } finally {
      if (filterAssigneeAuthority.isCurrent(request)) setFilterAssigneeLoading(false);
    }
  }, [filterAssigneeAuthority]);

  useEffect(() => {
    if (canAssign) void loadAssigneeCandidates("");
    return () => assigneeAuthority.invalidate();
  }, [assigneeAuthority, canAssign, loadAssigneeCandidates]);

  useEffect(() => {
    void loadFilterAssigneeOptions("");
    return () => filterAssigneeAuthority.invalidate();
  }, [filterAssigneeAuthority, loadFilterAssigneeOptions]);

  useEffect(() => {
    const handlePopState = () => {
      const next = parseBrowserFilters();
      void loadList(next);
    };
    window.addEventListener("popstate", handlePopState);
    return () => { window.removeEventListener("popstate", handlePopState);
      listAuthority.invalidate(); detailAuthority.invalidate(); mutationAuthority.invalidate(); };
  }, [detailAuthority, listAuthority, loadList, mutationAuthority]);

  function navigate(next: LeadFilters) {
    const safe = normalizeLeadDateRange(next);
    window.history.pushState(null, "", buildLeadHref(safe));
    void loadList(safe);
  }
  function openDetail(leadId: string) {
    idempotencyIntent.complete(); actionLeadVersion.current = null;
    actionSubmission.reset(); setCommandAccepted(false);
    setSelectedId(leadId); setDetail(null); setFollowUpLoading(false);
    setAction(null); void loadDetail(leadId);
  }
  function closeDetail() {
    if (busy) return;
    detailAuthority.invalidate(); setSelectedId(null); setDetail(null);
    setDetailError(null); setFollowUpLoading(false); setAction(null);
    idempotencyIntent.complete();
    actionLeadVersion.current = null; actionSubmission.reset();
    setCommandAccepted(false);
  }
  async function loadFollowUps(page: number) {
    if (!detail) return;
    const request = detailAuthority.begin(); setFollowUpLoading(true);
    try {
      const raw = await requestBackendJson<unknown>(
        `${API_PATH}/${detail.id}/follow-ups?page=${page}&pageSize=${FOLLOW_UP_PAGE_SIZE}`,
        { cache: "no-store", signal: request.controller.signal,
          fallbackMessage: "跟进记录加载失败" },
      );
      if (!detailAuthority.isCurrent(request)) return;
      const parsed = normalizeFollowUpPage(raw, { page, pageSize: FOLLOW_UP_PAGE_SIZE });
      if (!parsed) { setDetailError("跟进记录响应无效，请重试"); return; }
      setDetail((current) => current ? { ...current, follow_ups: parsed } : current);
    } catch {
      if (detailAuthority.isCurrent(request)) setDetailError("跟进记录加载失败，请重试");
    } finally { if (detailAuthority.isCurrent(request)) setFollowUpLoading(false); }
  }
  function beginAction(nextAction: LeadAction) {
    if (!detail) return;
    const firstAppointment = detail.appointments.list[0];
    const values = { assigneeId: "", appointmentId: firstAppointment?.id ?? "",
      followUpType: "phone", summary: "", result: "", nextFollowUpAt: "",
      appointmentStatus: "", confirmedVisitAt: "", reason: "" };
    actionLeadVersion.current = detail.version;
    actionSubmission.reset(); setCommandAccepted(false);
    idempotencyIntent.keyFor({ leadId: detail.id, leadVersion: detail.version,
      action: nextAction, values });
    setActionValues(values);
    setActionErrors({}); setActionError(null); setAction(nextAction);
    if (nextAction === "assign" && !assigneeLoading) {
      void loadAssigneeCandidates(assigneeKeyword);
    }
  }
  function searchAssignees() {
    setActionValues((current) => ({ ...current, assigneeId: "" }));
    setActionErrors({}); void loadAssigneeCandidates(assigneeKeyword);
  }
  async function submitAction() {
    const leadVersion = actionLeadVersion.current;
    if (!action || !detail || leadVersion === null || !submissionGate.enter()) return;
    if (actionSubmission.nextStep() === "refresh") {
      setBusy(true); setActionError(null);
      try { await refreshAcceptedAction(action, detail.id); }
      finally { submissionGate.leave(); setBusy(false); }
      return;
    }
    const errors = validateAction(action, actionValues);
    if (Object.keys(errors).length > 0) { setActionErrors(errors); submissionGate.leave(); return; }
    const request = mutationAuthority.begin(); setBusy(true); setActionError(null);
    const idempotencyKey = idempotencyIntent.keyFor({ leadId: detail.id,
      leadVersion, action, values: actionValues });
    const payload = buildLeadCommand(action, { leadVersion,
      idempotencyKey, ...actionValues });
    try {
      const raw = await requestBackendJson<unknown>(actionPath(detail.id, action), {
        method: "POST", body: JSON.stringify(payload), signal: request.controller.signal,
        fallbackMessage: "线索操作失败",
      });
      if (!mutationAuthority.isCurrent(request)) return;
      if (!isLeadCommandResult(raw, action, detail.id)) {
        setActionError("操作响应无效，请刷新后确认"); return;
      }
      actionSubmission.acceptCommand(); setCommandAccepted(true);
      await refreshAcceptedAction(action, detail.id);
    } catch {
      if (mutationAuthority.isCurrent(request)) {
        const message = "线索操作失败，请检查当前状态和权限后重试";
        setActionError(message); toast.error(message);
      }
    } finally {
      submissionGate.leave();
      if (mutationAuthority.isCurrent(request)) setBusy(false);
    }
  }

  async function refreshAcceptedAction(acceptedAction: LeadAction, leadId: string) {
    const [listFresh, detailFresh] = await Promise.all([
      loadList(listTarget.current()), loadDetail(leadId),
    ]);
    if (!listFresh || !detailFresh) {
      setActionError("操作已提交，但最新状态刷新失败，请重新同步"); return;
    }
    idempotencyIntent.complete(); actionLeadVersion.current = null;
    actionSubmission.reset(); setCommandAccepted(false);
    toast.success(actionSuccess(acceptedAction)); setAction(null);
  }

  return <div className="flex min-h-0 flex-1 flex-col gap-5">
    <header className="flex min-w-0 items-start gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground"><UserRoundSearch aria-hidden="true" /></span>
      <div className="min-w-0"><h1 className="text-xl font-semibold tracking-normal">抖音线索</h1><p className="mt-1 text-sm text-muted-foreground">处理量房预约、负责人、跟进和客户转化。当前筛选共 {data.pagination.total} 条记录。</p></div>
    </header>
    <Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-none">
      <CardHeader className="shrink-0 border-b bg-muted/20 p-3"><CardTitle className="sr-only">线索任务列表</CardTitle><CardDescription className="sr-only">按状态、负责人、日期和关键词筛选抖音量房线索</CardDescription><LeadFiltersToolbar filters={filters} assigneeOptions={filterAssigneeOptions} assigneeKeyword={filterAssigneeKeyword} assigneeLoading={filterAssigneeLoading} assigneeError={filterAssigneeError} assigneeHasMore={filterAssigneeHasMore} disabled={loading} onAssigneeKeywordChange={setFilterAssigneeKeyword} onAssigneeSearch={() => void loadFilterAssigneeOptions(filterAssigneeKeyword)} onNavigate={navigate} /></CardHeader>
      <CardContent className="relative flex min-h-0 flex-1 flex-col p-0" aria-busy={loading}>
        <div className="min-h-0 flex-1 overflow-auto">
          {viewState === "loading" ? <LeadListSkeleton /> : null}
          {viewState === "error" ? <InlineError title="线索列表加载失败" message={listError ?? "请重试"} onRetry={() => void loadList(listTarget.current())} /> : null}
          {viewState === "empty" ? <Empty><EmptyHeader><EmptyMedia variant="icon"><Inbox /></EmptyMedia><EmptyTitle>没有符合条件的线索</EmptyTitle><EmptyDescription>调整筛选条件后重试，新预约会显示在这里。</EmptyDescription></EmptyHeader></Empty> : null}
          {viewState === "ready" ? <LeadTable page={data} onOpen={openDetail} /> : null}
        </div>
        <CardFooter className="shrink-0 flex-col items-stretch justify-between gap-3 border-t p-3 md:flex-row md:items-center">
          <span className="text-sm tabular-nums text-muted-foreground">第 {data.pagination.page} / {Math.max(data.pagination.totalPages, 1)} 页，共 {data.pagination.total} 条</span>
          <div className="flex gap-2"><Button variant="outline" disabled={loading || data.pagination.page <= 1} onClick={() => navigate({ ...filters, page: data.pagination.page - 1 })}><ChevronLeft data-icon="inline-start" />上一页</Button><Button variant="outline" disabled={loading || data.pagination.page >= data.pagination.totalPages} onClick={() => navigate({ ...filters, page: data.pagination.page + 1 })}>下一页<ChevronRight data-icon="inline-end" /></Button></div>
        </CardFooter>
      </CardContent>
    </Card>
    <Sheet open={selectedId !== null} onOpenChange={(open) => { if (!open) closeDetail(); }}>
      <SheetContent className="w-full overflow-hidden p-0 sm:max-w-2xl">
        <SheetHeader className="shrink-0 border-b p-5 pr-12"><SheetTitle>{detail?.name || "线索详情"}</SheetTitle><SheetDescription>{detail ? `${detail.phone_masked || "手机号未提供"} · ${statusLabel(detail.status)}` : "正在读取量房预约和跟进信息"}</SheetDescription></SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {detailLoading ? <DetailSkeleton /> : null}
          {detailError ? <InlineError title="详情加载失败" message={detailError} onRetry={() => selectedId && void loadDetail(selectedId)} /> : null}
          {detail ? <LeadDetailPanel detail={detail} actions={detail.status === "new" || detail.status === "contacted" ? allowedActions : []} busy={busy} followUpLoading={followUpLoading} onAction={beginAction} onFollowUpPage={(page) => void loadFollowUps(page)} /> : null}
        </div>
      </SheetContent>
    </Sheet>
    <Dialog open={action !== null} onOpenChange={(open) => { if (!open && !busy) { setAction(null); idempotencyIntent.complete(); actionLeadVersion.current = null; actionSubmission.reset(); setCommandAccepted(false); } }}>
      <DialogContent><DialogHeader><DialogTitle>{action ? actionTitle(action) : "处理线索"}</DialogTitle><DialogDescription>{commandAccepted ? "操作已提交，仅重新同步列表和详情，不会重复提交操作。" : action === "convert" ? "服务端将预检并复用已有客户；仅新建客户时校验客户创建权限。" : "提交后会重新读取列表和详情，确认最新状态。"}</DialogDescription></DialogHeader>
        {actionError ? <Alert variant="destructive"><AlertTitle>操作未确认</AlertTitle><AlertDescription>{actionError}</AlertDescription></Alert> : null}
        {action ? <LeadActionForm action={action} appointments={(detail?.appointments.list ?? []).map((item) => ({ value: item.id, label: formatAppointment(item) }))} assigneeOptions={assigneeOptions} assigneeKeyword={assigneeKeyword} assigneeLoading={assigneeLoading} assigneeError={assigneeError} assigneeHasMore={assigneeHasMore} values={actionValues} errors={actionErrors} disabled={busy || commandAccepted} onAssigneeKeywordChange={setAssigneeKeyword} onAssigneeSearch={searchAssignees} onChange={(patch) => { setActionValues((current) => ({ ...current, ...patch })); setActionErrors({}); }} /> : null}
        <DialogFooter><Button variant="outline" disabled={busy} onClick={() => { setAction(null); idempotencyIntent.complete(); actionLeadVersion.current = null; actionSubmission.reset(); setCommandAccepted(false); }}>取消操作</Button><Button variant={action === "mark_invalid" ? "destructive" : "default"} disabled={busy} onClick={() => void submitAction()}>{busy ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}{commandAccepted ? "重新同步最新状态" : action ? actionSubmitLabel(action) : "提交操作"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}

function LeadFiltersToolbar({ filters, assigneeOptions, assigneeKeyword,
  assigneeLoading, assigneeError, assigneeHasMore, disabled,
  onAssigneeKeywordChange, onAssigneeSearch, onNavigate }: {
  filters: LeadFilters; assigneeOptions: readonly Option[]; assigneeKeyword: string;
  assigneeLoading: boolean; assigneeError: string | null; assigneeHasMore: boolean;
  disabled: boolean; onAssigneeKeywordChange: (value: string) => void;
  onAssigneeSearch: () => void; onNavigate: (filters: LeadFilters) => void;
}) {
  const [draft, setDraft] = useState(filters);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setDraft(filters), [filters]);
  function submit(event: FormEvent) { event.preventDefault();
    const validationError = validateLeadFilterDraft(draft);
    if (validationError) { setError(validationError); return; }
    setError(null); onNavigate({ ...draft, page: 1, keyword: draft.keyword.trim() }); }
  function searchAssigneeOptions() {
    setDraft((current) => ({ ...current, assigneeId: "" }));
    onAssigneeSearch();
  }
  return <form className="grid gap-2 md:grid-cols-2 xl:grid-cols-[140px_minmax(220px,1fr)_160px_145px_145px_minmax(180px,1fr)_72px]" onSubmit={submit}>
    <Field><FieldLabel className="sr-only" htmlFor="douyin-lead-status-filter">状态</FieldLabel><FormSelect id="douyin-lead-status-filter" value={draft.status || "__all"} disabled={disabled} options={STATUS_OPTIONS} onChange={(value) => setDraft({ ...draft, status: value === "__all" ? "" : value as LeadFilters["status"] })} /></Field>
    <Field><FieldLabel className="sr-only" htmlFor="douyin-lead-assignee-filter-search">搜索负责人筛选</FieldLabel><div className="flex gap-2"><Input id="douyin-lead-assignee-filter-search" value={assigneeKeyword} disabled={disabled || assigneeLoading} maxLength={100} placeholder="搜索负责人" onChange={(event) => onAssigneeKeywordChange(event.target.value)} /><Button type="button" variant="outline" disabled={disabled || assigneeLoading} onClick={searchAssigneeOptions}>{assigneeLoading ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Search data-icon="inline-start" />}搜索</Button></div></Field>
    <Field><FieldLabel className="sr-only" htmlFor="douyin-lead-assignee-filter">负责人</FieldLabel><FormSelect id="douyin-lead-assignee-filter" value={draft.assigneeId || "__all"} disabled={disabled || assigneeLoading || assigneeOptions.length === 0} options={[{ value: "__all", label: "全部负责人" }, ...assigneeOptions]} onChange={(value) => setDraft({ ...draft, assigneeId: value === "__all" ? "" : value })} /></Field>
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

function LeadTable({ page, onOpen }: { page: LeadPage; onOpen: (id: string) => void }) {
  return <Table containerClassName="min-w-[1040px]"><TableHeader className="sticky top-0 bg-card"><TableRow><TableHead>联系人</TableHead><TableHead>手机号</TableHead><TableHead>小区</TableHead><TableHead>预约时间</TableHead><TableHead>预算区间</TableHead><TableHead>状态</TableHead><TableHead>负责人</TableHead><TableHead>客户关联状态</TableHead><TableHead className="text-right">操作</TableHead></TableRow></TableHeader><TableBody>{page.list.map((lead) => <TableRow key={lead.id}><TableCell className="font-medium">{lead.name || "未填写"}</TableCell><TableCell className="tabular-nums">{lead.phone_masked || "未提供"}</TableCell><TableCell>{lead.community || "未填写"}</TableCell><TableCell className="tabular-nums">{lead.latest_appointment ? formatAppointment(lead.latest_appointment) : "未预约"}</TableCell><TableCell>{lead.latest_appointment?.budget_range ? `${formatMoney(lead.latest_appointment.budget_range.minimum_total)} 至 ${formatMoney(lead.latest_appointment.budget_range.maximum_total)}` : "未提供"}</TableCell><TableCell><StatusBadge status={lead.status} /></TableCell><TableCell>{lead.assignee?.name || "待分配"}</TableCell><TableCell><Badge variant={lead.customer ? "success" : "outline"}>{lead.customer ? "已关联客户" : "待转客户"}</Badge></TableCell><TableCell className="text-right"><Button variant="ghost" size="sm" onClick={() => onOpen(lead.id)}>查看线索</Button></TableCell></TableRow>)}</TableBody></Table>;
}

export function LeadDetailPanel({ detail, actions, busy, followUpLoading, onAction, onFollowUpPage }: { detail: LeadDetail; actions: readonly LeadAction[]; busy: boolean; followUpLoading: boolean; onAction: (action: LeadAction) => void; onFollowUpPage: (page: number) => void }) {
  const attributionEntries = Object.entries(detail.attribution);
  const appointment = detail.latest_appointment;
  return <div className="flex flex-col gap-6"><section className="flex flex-col gap-3"><h3 className="text-base font-semibold">客户概览</h3><dl className="grid gap-3 text-sm sm:grid-cols-2"><DetailItem label="联系人" value={detail.name || "未填写"} /><DetailItem label="手机号" value={detail.phone_masked || "未提供"} /><DetailItem label="小区" value={detail.community || "未填写"} /><DetailItem label="负责人" value={detail.assignee?.name || "待分配"} /><DetailItem label="客户状态" value={detail.customer ? "已关联客户" : "尚未关联客户"} /><DetailItem label="装修需求" value={detail.demand || "未填写"} /></dl></section>
    <section className="flex flex-col gap-3"><h3 className="text-base font-semibold">预约信息</h3>{appointment ? <dl className="grid gap-3 text-sm sm:grid-cols-2"><DetailItem label="预约编号" value={appointment.appointment_no} /><DetailItem label="预约时间" value={formatAppointment(appointment)} /><DetailItem label="预约小区" value={appointment.community} /><DetailItem label="预约状态" value={appointmentStatusLabel(appointment.status)} /></dl> : <CompactEmpty title="暂无量房预约" description="该线索尚未关联可展示的量房预约。" />}</section>
    <section className="flex flex-col gap-3"><h3 className="text-base font-semibold">来源归因</h3>{attributionEntries.length ? <dl className="grid gap-3 text-sm sm:grid-cols-2">{attributionEntries.map(([key, value]) => <DetailItem key={key} label={attributionLabel(key)} value={attributionValue(key, value)} />)}</dl> : <CompactEmpty title="暂无来源归因" description="本次提交未携带可展示的来源信息。" />}</section>
    <section className="flex flex-col gap-3"><h3 className="text-base font-semibold">确定性预算</h3>{detail.budget ? <dl className="grid gap-3 text-sm sm:grid-cols-2"><DetailItem label="预算编号" value={detail.budget.estimate_no} /><DetailItem label="预算区间" value={`${formatMoney(detail.budget.minimum_total)} 至 ${formatMoney(detail.budget.maximum_total)}`} /></dl> : <CompactEmpty title="暂无预算结果" description="该预约未关联有效的确定性预算快照。" />}</section>
    <section className="flex flex-col gap-3"><h3 className="text-base font-semibold">AI 建议</h3>{detail.ai ? <div className="flex flex-col gap-3 text-sm"><p>{detail.ai.summary}</p><AdviceList title="预算分配" items={detail.ai.allocation_advice} /><AdviceList title="风险提示" items={detail.ai.risk_factors} /><AdviceList title="量房问题" items={detail.ai.onsite_questions} /></div> : <CompactEmpty title="暂无 AI 建议" description="仅展示预算分析成功且结构完整的建议。" />}</section>
    <section className="flex flex-col gap-3"><h3 className="text-base font-semibold">跟进历史</h3>{detail.follow_ups.list.length ? <div className="flex flex-col gap-3">{detail.follow_ups.list.map((item, index) => <div key={`${item.created_at}-${index}`} className="rounded-md border p-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><span className="font-medium">{item.employee_name || "经办员工"} · {followUpTypeLabel(item.follow_up_type)}</span><time className="tabular-nums text-muted-foreground">{formatDateTime(item.created_at)}</time></div><p className="mt-2">{item.summary}</p><p className="mt-1 text-muted-foreground">{item.result}</p></div>)}</div> : <CompactEmpty title="暂无跟进记录" description="记录电话、微信或上门沟通后会显示在这里。" />}<div className="flex justify-end gap-2"><Button variant="outline" size="sm" disabled={followUpLoading || detail.follow_ups.pagination.page <= 1} onClick={() => onFollowUpPage(detail.follow_ups.pagination.page - 1)}>上一页跟进</Button><Button variant="outline" size="sm" disabled={followUpLoading || detail.follow_ups.pagination.page >= detail.follow_ups.pagination.totalPages} onClick={() => onFollowUpPage(detail.follow_ups.pagination.page + 1)}>下一页跟进</Button></div></section>
    {actions.length ? <section className="sticky bottom-0 flex flex-wrap gap-2 border-t bg-background py-4">{actions.map((item) => <Button key={item} variant={item === "mark_invalid" ? "destructive" : item === "convert" ? "default" : "outline"} disabled={busy} onClick={() => onAction(item)}>{actionButtonLabel(item)}</Button>)}</section> : null}
  </div>;
}

export function LeadActionForm({ action, appointments, assigneeOptions,
  assigneeKeyword = "", assigneeLoading = false, assigneeError = null,
  assigneeHasMore = false, values, errors, disabled,
  onAssigneeKeywordChange = () => undefined,
  onAssigneeSearch = () => undefined, onChange }: {
  action: LeadAction; appointments: readonly Option[]; assigneeOptions: readonly Option[];
  assigneeKeyword?: string; assigneeLoading?: boolean; assigneeError?: string | null;
  assigneeHasMore?: boolean; values: ActionValues; errors: ActionErrors;
  disabled: boolean; onAssigneeKeywordChange?: (value: string) => void;
  onAssigneeSearch?: () => void; onChange: (patch: Partial<ActionValues>) => void;
}) {
  if (action === "convert") return <Alert><AlertTitle>确认转为客户</AlertTitle><AlertDescription>已有客户由服务端直接复用；新客户仅在服务端预检通过后创建。</AlertDescription></Alert>;
  if (action === "assign") return <FieldGroup><Field><FieldLabel htmlFor="douyin-lead-assignee-search">搜索负责人</FieldLabel><div className="flex gap-2"><Input id="douyin-lead-assignee-search" value={assigneeKeyword} disabled={disabled || assigneeLoading} maxLength={100} placeholder="输入员工姓名" onChange={(event) => onAssigneeKeywordChange(event.target.value)} /><Button type="button" variant="outline" disabled={disabled || assigneeLoading} onClick={onAssigneeSearch}>{assigneeLoading ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Search data-icon="inline-start" />}搜索负责人</Button></div></Field>{assigneeError ? <Alert variant="destructive"><AlertTitle>负责人候选加载失败</AlertTitle><AlertDescription className="flex flex-wrap items-center justify-between gap-2"><span>{assigneeError}</span><Button type="button" size="sm" variant="outline" disabled={disabled || assigneeLoading} onClick={onAssigneeSearch}>重试负责人候选</Button></AlertDescription></Alert> : null}{assigneeLoading ? <Skeleton className="h-9 w-full" aria-label="正在加载负责人候选" /> : null}{!assigneeLoading && !assigneeError && assigneeOptions.length === 0 ? <CompactEmpty title="暂无可分配负责人" description="调整姓名关键词后重新搜索。" /> : null}{assigneeOptions.length ? <Field data-invalid={Boolean(errors.assigneeId) || undefined}><FieldLabel htmlFor="douyin-lead-assignee">负责人</FieldLabel><FormSelect id="douyin-lead-assignee" value={values.assigneeId || ""} disabled={disabled || assigneeLoading} invalid={Boolean(errors.assigneeId)} aria-describedby={errors.assigneeId ? "douyin-lead-assignee-error" : assigneeHasMore ? "douyin-lead-assignee-more" : undefined} options={assigneeOptions} onChange={(value) => onChange({ assigneeId: value })} /><FieldError id="douyin-lead-assignee-error">{errors.assigneeId}</FieldError>{assigneeHasMore ? <p id="douyin-lead-assignee-more" className="text-xs text-muted-foreground">候选超过 100 位，请输入姓名缩小范围。</p> : null}</Field> : null}</FieldGroup>;
  if (action === "mark_invalid") return <Field data-invalid={Boolean(errors.reason) || undefined}><FieldLabel htmlFor="douyin-lead-invalid-reason">无效原因</FieldLabel><Textarea id="douyin-lead-invalid-reason" value={values.reason || ""} disabled={disabled} maxLength={500} aria-invalid={Boolean(errors.reason)} aria-describedby={errors.reason ? "douyin-lead-invalid-reason-error" : undefined} onChange={(event) => onChange({ reason: event.target.value })} /><FieldError id="douyin-lead-invalid-reason-error">{errors.reason}</FieldError></Field>;
  return <FieldGroup><Field data-invalid={Boolean(errors.appointmentId) || undefined}><FieldLabel htmlFor="douyin-lead-follow-appointment">量房预约</FieldLabel><FormSelect id="douyin-lead-follow-appointment" value={values.appointmentId || ""} options={appointments} disabled={disabled || appointments.length === 0} invalid={Boolean(errors.appointmentId)} aria-describedby={errors.appointmentId ? "douyin-lead-follow-appointment-error" : undefined} onChange={(value) => onChange({ appointmentId: value })} /><FieldError id="douyin-lead-follow-appointment-error">{errors.appointmentId}</FieldError></Field><Field><FieldLabel htmlFor="douyin-lead-follow-type">跟进方式</FieldLabel><FormSelect id="douyin-lead-follow-type" value={values.followUpType || "phone"} disabled={disabled} options={[{ value: "phone", label: "电话" }, { value: "wechat", label: "微信" }, { value: "online_meeting", label: "线上会议" }, { value: "onsite", label: "现场沟通" }, { value: "other", label: "其他" }]} onChange={(value) => onChange({ followUpType: value })} /></Field><ActionTextarea id="douyin-lead-follow-summary" label="跟进摘要" value={values.summary || ""} error={errors.summary} maxLength={500} disabled={disabled} onChange={(summary) => onChange({ summary })} /><ActionTextarea id="douyin-lead-follow-result" label="沟通结果" value={values.result || ""} error={errors.result} maxLength={1000} disabled={disabled} onChange={(result) => onChange({ result })} /><Field><FieldLabel htmlFor="douyin-lead-next-follow-up">下次跟进时间（选填）</FieldLabel><Input id="douyin-lead-next-follow-up" type="datetime-local" value={values.nextFollowUpAt || ""} disabled={disabled} onChange={(event) => onChange({ nextFollowUpAt: event.target.value })} /></Field><Field><FieldLabel htmlFor="douyin-lead-appointment-status">预约状态（选填）</FieldLabel><FormSelect id="douyin-lead-appointment-status" value={values.appointmentStatus || "__keep"} disabled={disabled} options={[{ value: "__keep", label: "保持当前状态" }, { value: "confirmed", label: "确认量房" }, { value: "completed", label: "完成量房" }, { value: "canceled", label: "取消预约" }, { value: "invalid", label: "预约无效" }]} onChange={(value) => onChange({ appointmentStatus: value === "__keep" ? "" : value })} /></Field>{values.appointmentStatus === "confirmed" ? <Field data-invalid={Boolean(errors.confirmedVisitAt) || undefined}><FieldLabel htmlFor="douyin-lead-confirmed-visit">确认量房时间</FieldLabel><Input id="douyin-lead-confirmed-visit" type="datetime-local" value={values.confirmedVisitAt || ""} disabled={disabled} aria-invalid={Boolean(errors.confirmedVisitAt)} aria-describedby={errors.confirmedVisitAt ? "douyin-lead-confirmed-visit-error" : undefined} onChange={(event) => onChange({ confirmedVisitAt: event.target.value })} /><FieldError id="douyin-lead-confirmed-visit-error">{errors.confirmedVisitAt}</FieldError></Field> : null}</FieldGroup>;
}

function ActionTextarea({ id, label, value, error, maxLength, disabled, onChange }: { id: string; label: string; value: string; error?: string; maxLength: number; disabled: boolean; onChange: (value: string) => void }) { const errorId = `${id}-error`; return <Field data-invalid={Boolean(error) || undefined}><FieldLabel htmlFor={id}>{label}</FieldLabel><Textarea id={id} value={value} maxLength={maxLength} disabled={disabled} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} onChange={(event) => onChange(event.target.value)} /><FieldError id={errorId}>{error}</FieldError></Field>; }
function validateAction(action: LeadAction, values: ActionValues): ActionErrors { const errors: ActionErrors = {}; if (action === "assign" && !values.assigneeId) errors.assigneeId = "请选择负责人"; if (action === "follow_up") { if (!values.appointmentId) errors.appointmentId = "请选择量房预约"; if (!values.summary?.trim()) errors.summary = "请填写跟进摘要"; if (!values.result?.trim()) errors.result = "请填写沟通结果"; if (values.appointmentStatus === "confirmed" && !values.confirmedVisitAt) errors.confirmedVisitAt = "请填写确认量房时间"; } if (action === "mark_invalid" && !values.reason?.trim()) errors.reason = "请填写无效原因"; return errors; }
function emptyPage(filters: LeadFilters): LeadPage { return { list: [], pagination: { page: filters.page, pageSize: filters.pageSize, total: 0, totalPages: 0 } }; }
function parseBrowserFilters(): LeadFilters { return parseLeadFilters(new URLSearchParams(window.location.search)); }
function actionPath(id: string, action: LeadAction) { return `${API_PATH}/${id}/${action === "assign" ? "assign" : action === "follow_up" ? "follow-ups" : action === "convert" ? "convert-customer" : "mark-invalid"}`; }
function statusLabel(status: string) { return ({ new: "新线索", contacted: "跟进中", converted: "已转客户", invalid: "已关闭" } as Record<string, string>)[status] ?? "未知状态"; }
function appointmentStatusLabel(status: string) { return ({ pending_confirmation: "待确认", confirmed: "已确认", completed: "已完成", canceled: "已取消", invalid: "已作废" } as Record<string, string>)[status] ?? "未知状态"; }
function StatusBadge({ status }: { status: string }) { const variant = status === "converted" ? "success" : status === "invalid" ? "danger" : status === "contacted" ? "warning" : "secondary"; return <Badge variant={variant}>{statusLabel(status)}</Badge>; }
function formatAppointment(item: Appointment) { return `${item.preferred_visit_date} ${{ morning: "上午", afternoon: "下午", evening: "晚上" }[item.preferred_visit_period]}`; }
function formatDateTime(value: string) { return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Shanghai" }).format(new Date(value)); }
function formatMoney(value: number) { return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 0 }).format(value); }
function actionTitle(action: LeadAction) { return ({ assign: "分配负责人", follow_up: "记录线索跟进", convert: "确认转为客户", mark_invalid: "确认判为无效" })[action]; }
function actionButtonLabel(action: LeadAction) { return ({ assign: "分配负责人", follow_up: "记录跟进", convert: "转为客户", mark_invalid: "判为无效" })[action]; }
function actionSubmitLabel(action: LeadAction) { return ({ assign: "确认分配负责人", follow_up: "提交跟进记录", convert: "确认转为客户", mark_invalid: "确认判为无效" })[action]; }
function actionSuccess(action: LeadAction) { return ({ assign: "负责人已更新", follow_up: "跟进记录已提交", convert: "客户转化已完成", mark_invalid: "线索已判为无效" })[action]; }
function followUpTypeLabel(type: string) { return ({ phone: "电话", wechat: "微信", online_meeting: "线上会议", onsite: "现场沟通", other: "其他" } as Record<string, string>)[type] ?? "跟进"; }
function attributionLabel(key: string) { return ({ source_type: "来源类型", entry_path: "来源页面", scene: "抖音场景", campaign_code: "活动编号", content_id: "内容编号" } as Record<string, string>)[key] ?? "来源信息"; }
function attributionValue(key: string, value: string) { return key === "source_type" ? ({ short_video: "短视频", live: "直播", search: "搜索", profile: "主页", share: "分享", direct: "直接访问", other: "其他" } as Record<string, string>)[value] ?? "其他" : value; }
function DetailItem({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-words">{value}</dd></div>; }
function AdviceList({ title, items }: { title: string; items: readonly string[] }) { return items.length ? <div><p className="font-medium">{title}</p><ul className="mt-1 list-disc pl-5 text-muted-foreground">{items.map((item) => <li key={item}>{item}</li>)}</ul></div> : null; }
function CompactEmpty({ title, description }: { title: string; description: string }) { return <Empty className="min-h-32 p-4"><EmptyHeader><EmptyTitle className="text-base">{title}</EmptyTitle><EmptyDescription>{description}</EmptyDescription></EmptyHeader></Empty>; }
function InlineError({ title, message, onRetry }: { title: string; message: string; onRetry: () => void }) { return <div className="flex flex-col gap-3 p-5"><Alert variant="destructive"><AlertTitle>{title}</AlertTitle><AlertDescription>{message}</AlertDescription></Alert><Button variant="outline" onClick={onRetry}>重新加载线索</Button></div>; }
function LeadListSkeleton() { return <div className="flex flex-col gap-3 p-5" aria-label="正在加载线索"><Skeleton className="h-10 w-full" /><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div>; }
function DetailSkeleton() { return <div className="flex flex-col gap-4" aria-label="正在加载线索详情"><Skeleton className="h-20 w-full" /><Skeleton className="h-32 w-full" /><Skeleton className="h-32 w-full" /></div>; }
