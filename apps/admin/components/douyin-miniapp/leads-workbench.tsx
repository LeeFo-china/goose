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
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requestBackendJson } from "@/lib/backend-client";
import {
  buildAssigneeOptionsPath, normalizeAssigneeCandidatePage,
  normalizeAssigneeFilterOptionPage,
  type AssigneeCandidatePage, type AssigneeFilterOptionsState,
} from "./leads-assignee-options";
import {
  buildLeadApiQuery, buildLeadCommand, buildLeadHref,
  createLatestLeadListTarget, createLeadIdempotencyIntent,
  createLeadRequestAuthority, createSubmissionGate, getAllowedLeadActions,
  getLeadViewState, isLeadCommandResult, normalizeAppointmentPage, normalizeFollowUpPage,
  normalizeLeadDetail, normalizeLeadPage,
  normalizeLeadDateRange, parseLeadFilters,
  type Appointment, type AppointmentPage, type LeadAction,
  type LeadDetail, type LeadFilters, type LeadPage, type FollowUpPage,
} from "./leads-workbench-logic";
import {
  createLatestLeadPageTarget, resetLeadPageActivity, resolveAppointmentSelection,
  transitionLeadPageState,
} from "./leads-workbench-paging";
import type { ActionErrors, ActionValues, Option } from "./leads-workbench-panels";
import { LeadActionForm as ActionForm, LeadDetailPanel as DetailPanel } from
  "./leads-workbench-panels";

export type { LeadDetail, LeadPage } from "./leads-workbench-logic";
export { buildAssigneeOptionsPath, normalizeAssigneeFilterOptionPage } from
  "./leads-assignee-options";
export { LeadActionForm, LeadDetailPanel } from "./leads-workbench-panels";
const API_PATH = "/tenant/douyin-miniapp/leads";
const FOLLOW_UP_PAGE_SIZE = 20;
const APPOINTMENT_PAGE_SIZE = 20;
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

type AssigneeFilterOptionsEvent = { type: "failed" | "invalid" } | {
  type: "success"; page: AssigneeCandidatePage;
};
export function transitionAssigneeFilterOptions(current: AssigneeFilterOptionsState,
  event: AssigneeFilterOptionsEvent): AssigneeFilterOptionsState {
  return event.type === "success" ? { options: event.page.list,
    hasMore: event.page.pagination.totalPages > 1 } : current;
}

export function validateLeadFilterDraft(filters: LeadFilters): string | null {
  if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) return "结束日期不能早于开始日期";
  return /^[\p{L}\p{N}\s#号栋室-]{0,80}$/u.test(filters.keyword.trim()) ? null : "关键词格式无效";
}

export function LeadsWorkbench({ initialData, initialError, initialFilters,
  initialFilterAssigneeOptions, permissions }: {
  initialData: LeadPage; initialError: string | null; initialFilters: LeadFilters;
  initialFilterAssigneeOptions?: AssigneeFilterOptionsState;
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
  const [followUpError, setFollowUpError] = useState<string | null>(null);
  const [actionAppointments, setActionAppointments] = useState<AppointmentPage>({
    list: [], pagination: { page: 1, pageSize: APPOINTMENT_PAGE_SIZE,
      total: 0, totalPages: 0 },
  });
  const [appointmentLoading, setAppointmentLoading] = useState(false);
  const [appointmentError, setAppointmentError] = useState<string | null>(null);
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
  const [filterAssigneeState, setFilterAssigneeState] = useState<AssigneeFilterOptionsState>({
    options: initialFilterAssigneeOptions?.options ?? [],
    hasMore: initialFilterAssigneeOptions?.hasMore ?? false,
  });
  const [filterAssigneeKeyword, setFilterAssigneeKeyword] = useState("");
  const [filterAssigneeLoading, setFilterAssigneeLoading] = useState(false);
  const [filterAssigneeError, setFilterAssigneeError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const listAuthority = useRef(createLeadRequestAuthority()).current;
  const detailAuthority = useRef(createLeadRequestAuthority()).current;
  const followUpAuthority = useRef(createLeadRequestAuthority()).current;
  const appointmentAuthority = useRef(createLeadRequestAuthority()).current;
  const mutationAuthority = useRef(createLeadRequestAuthority()).current;
  const assigneeAuthority = useRef(createLeadRequestAuthority()).current;
  const filterAssigneeAuthority = useRef(createLeadRequestAuthority()).current;
  const submissionGate = useRef(createSubmissionGate()).current;
  const actionSubmission = useRef(createActionSubmissionCoordinator()).current;
  const idempotencyIntent = useRef(createLeadIdempotencyIntent()).current;
  const actionLeadVersion = useRef<number | null>(null);
  const listTarget = useRef(createLatestLeadListTarget(initialFilters)).current;
  const followUpTarget = useRef(createLatestLeadPageTarget({
    leadId: "", page: 1, pageSize: FOLLOW_UP_PAGE_SIZE,
  })).current;
  const appointmentTarget = useRef(createLatestLeadPageTarget({
    leadId: "", page: 1, pageSize: APPOINTMENT_PAGE_SIZE,
  })).current;
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
    followUpAuthority.invalidate(); const reset = resetLeadPageActivity(); setFollowUpLoading(reset.loading); setFollowUpError(reset.error); const request = detailAuthority.begin();
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
  }, [detailAuthority, followUpAuthority]);

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

  const loadFilterAssigneeOptions = useCallback(async (keyword: string,
    includeEmployeeId: string) => {
    const request = filterAssigneeAuthority.begin();
    setFilterAssigneeLoading(true); setFilterAssigneeError(null);
    try {
      const raw = await requestBackendJson<unknown>(
        buildAssigneeOptionsPath("filter", keyword, includeEmployeeId),
        { cache: "no-store", signal: request.controller.signal,
          fallbackMessage: "负责人筛选项加载失败" },
      );
      if (!filterAssigneeAuthority.isCurrent(request)) return;
      const parsed = normalizeAssigneeFilterOptionPage(raw, includeEmployeeId);
      if (!parsed) { setFilterAssigneeState((current) =>
        transitionAssigneeFilterOptions(current, { type: "invalid" }));
        setFilterAssigneeError("负责人筛选项响应无效，请重试"); return; }
      setFilterAssigneeState((current) => transitionAssigneeFilterOptions(current,
        { type: "success", page: parsed }));
    } catch {
      if (filterAssigneeAuthority.isCurrent(request)) {
        setFilterAssigneeState((current) =>
          transitionAssigneeFilterOptions(current, { type: "failed" }));
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
    void loadFilterAssigneeOptions("", filters.assigneeId);
    return () => filterAssigneeAuthority.invalidate();
  }, [filterAssigneeAuthority, filters.assigneeId, loadFilterAssigneeOptions]);

  useEffect(() => {
    const handlePopState = () => {
      const next = parseBrowserFilters();
      void loadList(next);
    };
    window.addEventListener("popstate", handlePopState);
    return () => { window.removeEventListener("popstate", handlePopState);
      listAuthority.invalidate(); detailAuthority.invalidate(); followUpAuthority.invalidate();
      appointmentAuthority.invalidate(); mutationAuthority.invalidate(); };
  }, [appointmentAuthority, detailAuthority, followUpAuthority, listAuthority,
    loadList, mutationAuthority]);

  function navigate(next: LeadFilters) {
    const safe = normalizeLeadDateRange(next);
    window.history.pushState(null, "", buildLeadHref(safe));
    void loadList(safe);
  }
  function openDetail(leadId: string) {
    idempotencyIntent.complete(); actionLeadVersion.current = null;
    actionSubmission.reset(); setCommandAccepted(false);
    followUpAuthority.invalidate(); appointmentAuthority.invalidate();
    setSelectedId(leadId); setDetail(null); setFollowUpLoading(false); setFollowUpError(null);
    setAppointmentLoading(false); setAppointmentError(null);
    setAction(null); void loadDetail(leadId);
  }
  function closeDetail() {
    if (busy) return;
    detailAuthority.invalidate(); followUpAuthority.invalidate(); appointmentAuthority.invalidate();
    setSelectedId(null); setDetail(null); setDetailError(null);
    setFollowUpLoading(false); setFollowUpError(null); setAction(null);
    setAppointmentLoading(false); setAppointmentError(null);
    idempotencyIntent.complete();
    actionLeadVersion.current = null; actionSubmission.reset();
    setCommandAccepted(false);
  }
  async function loadFollowUps(target: { leadId: string; page: number; pageSize: number }) {
    followUpTarget.update(target);
    const request = followUpAuthority.begin(); setFollowUpLoading(true); setFollowUpError(null);
    try {
      const raw = await requestBackendJson<unknown>(
        `${API_PATH}/${target.leadId}/follow-ups?page=${target.page}&pageSize=${target.pageSize}`,
        { cache: "no-store", signal: request.controller.signal,
          fallbackMessage: "跟进记录加载失败" },
      );
      if (!followUpAuthority.isCurrent(request)) return;
      const parsed = normalizeFollowUpPage(raw, target);
      if (!parsed) { setFollowUpError(`第 ${target.page} 页跟进记录响应无效，请重试`); return; }
      setDetail((current) => current?.id === target.leadId
        ? { ...current, follow_ups: transitionFollowUpPage(current.follow_ups, parsed) }
        : current);
      setFollowUpError(null);
    } catch {
      if (followUpAuthority.isCurrent(request)) {
        setFollowUpError(`第 ${target.page} 页跟进记录加载失败，请重试`);
      }
    } finally { if (followUpAuthority.isCurrent(request)) setFollowUpLoading(false); }
  }
  async function loadAppointments(target: { leadId: string; page: number; pageSize: number }) {
    appointmentTarget.update(target);
    const request = appointmentAuthority.begin();
    setAppointmentLoading(true); setAppointmentError(null);
    try {
      const raw = await requestBackendJson<unknown>(
        `${API_PATH}/${target.leadId}/appointments?page=${target.page}&pageSize=${target.pageSize}`,
        { cache: "no-store", signal: request.controller.signal,
          fallbackMessage: "量房预约加载失败" },
      );
      if (!appointmentAuthority.isCurrent(request)) return;
      const parsed = normalizeAppointmentPage(raw, target);
      if (!parsed) { setAppointmentError(`第 ${target.page} 页预约响应无效，请重试`); return; }
      setActionAppointments((current) => transitionLeadPageState({ data: current,
        error: appointmentError }, { type: "success", data: parsed }).data);
      setActionValues((current) => ({ ...current,
        appointmentId: resolveAppointmentSelection(current.appointmentId ?? "", parsed.list),
      }));
      setAppointmentError(null);
    } catch {
      if (appointmentAuthority.isCurrent(request)) {
        setAppointmentError(`第 ${target.page} 页预约加载失败，请重试`);
      }
    } finally {
      if (appointmentAuthority.isCurrent(request)) setAppointmentLoading(false);
    }
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
    if (nextAction === "follow_up") {
      const initialAppointments = { list: detail.appointments.list,
        pagination: detail.appointments.pagination };
      setActionAppointments(initialAppointments); setAppointmentLoading(false); setAppointmentError(null);
      appointmentTarget.update({ leadId: detail.id,
        page: initialAppointments.pagination.page, pageSize: initialAppointments.pagination.pageSize });
    }
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
      <CardHeader className="shrink-0 border-b bg-muted/20 p-3"><CardTitle className="sr-only">线索任务列表</CardTitle><CardDescription className="sr-only">按状态、负责人、日期和关键词筛选抖音量房线索</CardDescription><LeadFiltersToolbar filters={filters} assigneeOptions={filterAssigneeState.options} assigneeKeyword={filterAssigneeKeyword} assigneeLoading={filterAssigneeLoading} assigneeError={filterAssigneeError} assigneeHasMore={filterAssigneeState.hasMore} disabled={loading} onAssigneeKeywordChange={setFilterAssigneeKeyword} onAssigneeSearch={(includeEmployeeId) => void loadFilterAssigneeOptions(filterAssigneeKeyword, includeEmployeeId)} onNavigate={navigate} /></CardHeader>
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
          {detail ? <DetailPanel detail={detail} actions={detail.status === "new" || detail.status === "contacted" ? allowedActions : []} busy={busy} followUpLoading={followUpLoading} followUpError={followUpError} onAction={beginAction} onFollowUpPage={(page) => void loadFollowUps({ leadId: detail.id, page, pageSize: FOLLOW_UP_PAGE_SIZE })} onFollowUpRetry={() => void loadFollowUps(followUpTarget.current())} /> : null}
        </div>
      </SheetContent>
    </Sheet>
    <Dialog open={action !== null} onOpenChange={(open) => { if (!open && !busy) { appointmentAuthority.invalidate(); setAppointmentLoading(false); setAppointmentError(null); setAction(null); idempotencyIntent.complete(); actionLeadVersion.current = null; actionSubmission.reset(); setCommandAccepted(false); } }}>
      <DialogContent><DialogHeader><DialogTitle>{action ? actionTitle(action) : "处理线索"}</DialogTitle><DialogDescription>{commandAccepted ? "操作已提交，仅重新同步列表和详情，不会重复提交操作。" : action === "convert" ? "服务端将预检并复用已有客户；仅新建客户时校验客户创建权限。" : "提交后会重新读取列表和详情，确认最新状态。"}</DialogDescription></DialogHeader>
        {actionError ? <Alert variant="destructive"><AlertTitle>操作未确认</AlertTitle><AlertDescription>{actionError}</AlertDescription></Alert> : null}
        {action ? <ActionForm action={action} appointments={actionAppointments.list} appointmentPagination={actionAppointments.pagination} appointmentLoading={appointmentLoading} appointmentError={appointmentError} assigneeOptions={assigneeOptions} assigneeKeyword={assigneeKeyword} assigneeLoading={assigneeLoading} assigneeError={assigneeError} assigneeHasMore={assigneeHasMore} values={actionValues} errors={actionErrors} disabled={busy || commandAccepted} onAppointmentPage={(page) => detail && void loadAppointments({ leadId: detail.id, page, pageSize: APPOINTMENT_PAGE_SIZE })} onAppointmentRetry={() => void loadAppointments(appointmentTarget.current())} onAssigneeKeywordChange={setAssigneeKeyword} onAssigneeSearch={searchAssignees} onChange={(patch) => { setActionValues((current) => ({ ...current, ...patch })); setActionErrors({}); }} /> : null}
        <DialogFooter><Button variant="outline" disabled={busy} onClick={() => { appointmentAuthority.invalidate(); setAppointmentLoading(false); setAppointmentError(null); setAction(null); idempotencyIntent.complete(); actionLeadVersion.current = null; actionSubmission.reset(); setCommandAccepted(false); }}>取消操作</Button><Button variant={action === "mark_invalid" ? "destructive" : "default"} disabled={busy || (action === "follow_up" && appointmentLoading)} onClick={() => void submitAction()}>{busy ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}{commandAccepted ? "重新同步最新状态" : action ? actionSubmitLabel(action) : "提交操作"}</Button></DialogFooter>
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

function validateAction(action: LeadAction, values: ActionValues): ActionErrors { const errors: ActionErrors = {}; if (action === "assign" && !values.assigneeId) errors.assigneeId = "请选择负责人"; if (action === "follow_up") { if (!values.appointmentId) errors.appointmentId = "请选择量房预约"; if (!values.summary?.trim()) errors.summary = "请填写跟进摘要"; if (!values.result?.trim()) errors.result = "请填写沟通结果"; if (values.appointmentStatus === "confirmed" && !values.confirmedVisitAt) errors.confirmedVisitAt = "请填写确认量房时间"; } if (action === "mark_invalid" && !values.reason?.trim()) errors.reason = "请填写无效原因"; return errors; }
function transitionFollowUpPage(current: FollowUpPage, next: FollowUpPage): FollowUpPage { return transitionLeadPageState({ data: current, error: null }, { type: "success", data: next }).data; }
function emptyPage(filters: LeadFilters): LeadPage { return { list: [], pagination: { page: filters.page, pageSize: filters.pageSize, total: 0, totalPages: 0 } }; }
function parseBrowserFilters(): LeadFilters { return parseLeadFilters(new URLSearchParams(window.location.search)); }
function actionPath(id: string, action: LeadAction) { return `${API_PATH}/${id}/${action === "assign" ? "assign" : action === "follow_up" ? "follow-ups" : action === "convert" ? "convert-customer" : "mark-invalid"}`; }
function statusLabel(status: string) { return ({ new: "新线索", contacted: "跟进中", converted: "已转客户", invalid: "已关闭" } as Record<string, string>)[status] ?? "未知状态"; }
function StatusBadge({ status }: { status: string }) { const variant = status === "converted" ? "success" : status === "invalid" ? "danger" : status === "contacted" ? "warning" : "secondary"; return <Badge variant={variant}>{statusLabel(status)}</Badge>; }
function formatAppointment(item: Appointment) { return `${item.preferred_visit_date} ${{ morning: "上午", afternoon: "下午", evening: "晚上" }[item.preferred_visit_period]}`; }
function formatMoney(value: number) { return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 0 }).format(value); }
function actionTitle(action: LeadAction) { return ({ assign: "分配负责人", follow_up: "记录线索跟进", convert: "确认转为客户", mark_invalid: "确认判为无效" })[action]; }
function actionSubmitLabel(action: LeadAction) { return ({ assign: "确认分配负责人", follow_up: "提交跟进记录", convert: "确认转为客户", mark_invalid: "确认判为无效" })[action]; }
function actionSuccess(action: LeadAction) { return ({ assign: "负责人已更新", follow_up: "跟进记录已提交", convert: "客户转化已完成", mark_invalid: "线索已判为无效" })[action]; }
function InlineError({ title, message, onRetry }: { title: string; message: string; onRetry: () => void }) { return <div className="flex flex-col gap-3 p-5"><Alert variant="destructive"><AlertTitle>{title}</AlertTitle><AlertDescription>{message}</AlertDescription></Alert><Button variant="outline" onClick={onRetry}>重新加载线索</Button></div>; }
function LeadListSkeleton() { return <div className="flex flex-col gap-3 p-5" aria-label="正在加载线索"><Skeleton className="h-10 w-full" /><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div>; }
function DetailSkeleton() { return <div className="flex flex-col gap-4" aria-label="正在加载线索详情"><Skeleton className="h-20 w-full" /><Skeleton className="h-32 w-full" /><Skeleton className="h-32 w-full" /></div>; }
