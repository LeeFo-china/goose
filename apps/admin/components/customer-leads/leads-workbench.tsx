"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Inbox, Loader2, UserRoundSearch } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { requestBackendJson } from "@/lib/backend-client";
import {
  buildAssigneeOptionsPath, normalizeAssigneeCandidatePage,
  normalizeAssigneeFilterOptionPage,
  type AssigneeCandidatePage, type AssigneeFilterOptionsState,
} from "./leads-assignee-options";
import {
  buildLeadApiQuery, buildLeadHref,
  createLatestLeadListTarget, createLeadIdempotencyIntent,
  createLeadRequestAuthority, createSubmissionGate, getLeadViewState,
  normalizeLeadDateRange, parseLeadFilters,
  type AppointmentPage, type LeadAction,
  type LeadDetail, type LeadFilters, type LeadPage,
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
import { getLeadWorkbenchProfile, type LeadWorkbenchProfileId } from "./leads-workbench-profile";
import { LeadFiltersToolbar, LeadTable, validateAction, transitionFollowUpPage, emptyPage,
  actionPath, statusLabel, actionTitle, actionSubmitLabel, actionSuccess, InlineError,
  LeadListSkeleton, DetailSkeleton, getLeadActionFailure } from "./leads-workbench-view";
const FOLLOW_UP_PAGE_SIZE = 20;
const APPOINTMENT_PAGE_SIZE = 20;


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

export { validateLeadFilterDraft } from "./leads-workbench-view";

export function LeadsWorkbench({ initialData, initialError, initialFilters,
  initialFilterAssigneeOptions, permissions, profileId = "douyin" }: {
  initialData: LeadPage; initialError: string | null; initialFilters: LeadFilters;
  initialFilterAssigneeOptions?: AssigneeFilterOptionsState;
  permissions: readonly string[]; profileId?: LeadWorkbenchProfileId;
}) {
  const profile = getLeadWorkbenchProfile(profileId);
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
  const [actionRequiresRefresh, setActionRequiresRefresh] = useState(false);
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
  const idempotencyIntent = useRef(createLeadIdempotencyIntent(undefined, profile.buildCommand)).current;
  const actionLeadVersion = useRef<number | null>(null);
  const actionLeadId = useRef<string | null>(null);
  const listTarget = useRef(createLatestLeadListTarget(initialFilters)).current;
  const followUpTarget = useRef(createLatestLeadPageTarget({
    leadId: "", page: 1, pageSize: FOLLOW_UP_PAGE_SIZE,
  })).current;
  const appointmentTarget = useRef(createLatestLeadPageTarget({
    leadId: "", page: 1, pageSize: APPOINTMENT_PAGE_SIZE,
  })).current;
  const allowedActions = (["assign", "follow_up", "convert", "mark_invalid"] as const)
    .filter((item) => permissions.includes(profile.permissions[item]));
  const canAssign = permissions.includes(profile.permissions.assign);
  const viewState = getLeadViewState({ loading, error: listError, count: data.list.length });

  const loadList = useCallback(async (next: LeadFilters): Promise<boolean> => {
    listTarget.update(next); setFilters(next);
    const request = listAuthority.begin();
    setLoading(true); setListError(null);
    try {
      const raw = await requestBackendJson<unknown>(`${profile.apiPath}?${buildLeadApiQuery(next, profile.id)}`, {
        cache: "no-store", signal: request.controller.signal,
        fallbackMessage: `${profile.title}列表加载失败`,
      });
      if (!listAuthority.isCurrent(request)) return false;
      const parsed = profile.normalizePage(raw, next);
      if (!parsed) { setData(emptyPage(next)); setListError("线索列表响应无效，请重试"); return false; }
      setData(parsed); return true;
    } catch {
      if (!listAuthority.isCurrent(request)) return false;
      setData(emptyPage(next)); setListError(`${profile.title}列表加载失败，请重试`); return false;
    } finally {
      if (listAuthority.isCurrent(request)) setLoading(false);
    }
  }, [listAuthority, listTarget, profile]);

  const loadDetail = useCallback(async (leadId: string, allowHidden = false): Promise<boolean | "hidden"> => {
    followUpAuthority.invalidate(); const reset = resetLeadPageActivity(); setFollowUpLoading(reset.loading); setFollowUpError(reset.error); const request = detailAuthority.begin();
    setDetailLoading(true); setDetailError(null);
    try {
      const raw = await requestBackendJson<unknown>(`${profile.apiPath}/${leadId}`, {
        cache: "no-store", signal: request.controller.signal,
        fallbackMessage: "线索详情加载失败",
      });
      if (!detailAuthority.isCurrent(request)) return false;
      const parsed = profile.normalizeDetail(raw);
      if (!parsed || parsed.id !== leadId) { setDetail(null); setDetailError("线索详情响应无效，请重试"); return false; }
      setDetail(parsed); return true;
    } catch (error) {
      if (!detailAuthority.isCurrent(request)) return false;
      if (allowHidden && typeof error === "object" && error !== null
        && "status" in error && error.status === 404) {
        setSelectedId(null); setDetail(null); return "hidden";
      }
      setDetail(null); setDetailError("线索详情加载失败，请重试"); return false;
    } finally {
      if (detailAuthority.isCurrent(request)) setDetailLoading(false);
    }
  }, [detailAuthority, followUpAuthority, profile]);

  const loadAssigneeCandidates = useCallback(async (keyword: string) => {
    const request = assigneeAuthority.begin();
    setAssigneeLoading(true); setAssigneeError(null);
    try {
      const raw = await requestBackendJson<unknown>(
        buildAssigneeOptionsPath("assign", keyword, "", profile.apiPath),
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
  }, [assigneeAuthority, profile]);

  const loadFilterAssigneeOptions = useCallback(async (keyword: string,
    includeEmployeeId: string) => {
    const request = filterAssigneeAuthority.begin();
    setFilterAssigneeLoading(true); setFilterAssigneeError(null);
    try {
      const raw = await requestBackendJson<unknown>(
        buildAssigneeOptionsPath("filter", keyword, includeEmployeeId, profile.apiPath),
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
  }, [filterAssigneeAuthority, profile]);

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
      const next = parseLeadFilters(new URLSearchParams(window.location.search), profile.id);
      void loadList(next);
    };
    window.addEventListener("popstate", handlePopState);
    return () => { window.removeEventListener("popstate", handlePopState);
      listAuthority.invalidate(); detailAuthority.invalidate(); followUpAuthority.invalidate();
      appointmentAuthority.invalidate(); mutationAuthority.invalidate(); };
  }, [appointmentAuthority, detailAuthority, followUpAuthority, listAuthority,
    loadList, mutationAuthority, profile]);

  function navigate(next: LeadFilters) {
    const safe = normalizeLeadDateRange(next);
    window.history.pushState(null, "", buildLeadHref(safe, profile.id));
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
        `${profile.apiPath}/${target.leadId}/follow-ups?page=${target.page}&pageSize=${target.pageSize}`,
        { cache: "no-store", signal: request.controller.signal,
          fallbackMessage: "跟进记录加载失败" },
      );
      if (!followUpAuthority.isCurrent(request)) return;
      const parsed = profile.normalizeFollowUps(raw, target);
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
        `${profile.apiPath}/${target.leadId}/appointments?page=${target.page}&pageSize=${target.pageSize}`,
        { cache: "no-store", signal: request.controller.signal,
          fallbackMessage: "量房预约加载失败" },
      );
      if (!appointmentAuthority.isCurrent(request)) return;
      const parsed = profile.normalizeAppointments(raw, target);
      if (!parsed) { setAppointmentError(`第 ${target.page} 页预约响应无效，请重试`); return; }
      setActionAppointments((current) => transitionLeadPageState({ data: current,
        error: appointmentError }, { type: "success", data: parsed }).data);
      setActionValues((current) => ({ ...current,
        appointmentId: resolveAppointmentSelection(current.appointmentId ?? "", parsed.list, profile.appointmentRequired),
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
    if (detail.actions?.[nextAction].enabled === false) return;
    const firstAppointment = detail.appointments.list[0];
    const values = { assigneeId: "", appointmentId: profile.appointmentRequired ? firstAppointment?.id ?? "" : "",
      followUpType: "phone", summary: "", result: "", nextFollowUpAt: "",
      appointmentStatus: "", confirmedVisitAt: "", reason: "" };
    actionLeadVersion.current = detail.version;
    actionLeadId.current = detail.id;
    actionSubmission.reset(); setCommandAccepted(false);
    setActionRequiresRefresh(false);
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
    const leadId = actionLeadId.current;
    if (!action || !leadId || leadVersion === null || !submissionGate.enter()) return;
    if (actionRequiresRefresh) {
      setBusy(true); setActionError(null);
      try {
        const [listFresh, detailFresh] = await Promise.all([
          loadList(listTarget.current()), loadDetail(leadId),
        ]);
        if (!listFresh || !detailFresh) {
          setActionError("最新状态刷新失败，请重试读取后重新确认"); return;
        }
        setAction(null); setActionRequiresRefresh(false); idempotencyIntent.complete();
        actionLeadVersion.current = null;
        toast.info("最新状态已读取，请重新选择操作并确认");
      } finally { submissionGate.leave(); setBusy(false); }
      return;
    }
    if (actionSubmission.nextStep() === "refresh") {
      setBusy(true); setActionError(null);
      try { await refreshAcceptedAction(action, leadId); }
      finally { submissionGate.leave(); setBusy(false); }
      return;
    }
    const errors = validateAction(action, actionValues, profile.appointmentRequired);
    if (Object.keys(errors).length > 0) { setActionErrors(errors); submissionGate.leave(); return; }
    const request = mutationAuthority.begin(); setBusy(true); setActionError(null);
    const idempotencyKey = idempotencyIntent.keyFor({ leadId,
      leadVersion, action, values: actionValues });
    const payload = profile.buildCommand(action, { leadVersion,
      idempotencyKey, ...actionValues });
    try {
      const raw = await requestBackendJson<unknown>(actionPath(leadId, action, profile.apiPath), {
        method: "POST", body: JSON.stringify(payload), signal: request.controller.signal,
        fallbackMessage: "线索操作失败",
      });
      if (!mutationAuthority.isCurrent(request)) return;
      if (!profile.isCommandResult(raw, action, leadId)) {
        setActionError("操作响应无效，请刷新后确认"); return;
      }
      actionSubmission.acceptCommand(); setCommandAccepted(true);
      await refreshAcceptedAction(action, leadId);
    } catch (error) {
      if (mutationAuthority.isCurrent(request)) {
        const failure = getLeadActionFailure(error);
        setActionRequiresRefresh(failure.requiresRefresh);
        setActionError(failure.message); toast.error(failure.message);
      }
    } finally {
      submissionGate.leave();
      if (mutationAuthority.isCurrent(request)) setBusy(false);
    }
  }

  async function refreshAcceptedAction(acceptedAction: LeadAction, leadId: string) {
    const [listFresh, detailFresh] = await Promise.all([
      loadList(listTarget.current()), loadDetail(leadId, acceptedAction === "assign"),
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
      <div className="min-w-0"><h1 className="text-xl font-semibold tracking-normal">{profile.title}</h1><p className="mt-1 text-sm text-muted-foreground">{profile.description}当前筛选共 {data.pagination.total} 条记录。</p></div>
    </header>
    <Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-none">
      <CardHeader className="shrink-0 border-b bg-muted/20 p-3"><CardTitle className="sr-only">线索任务列表</CardTitle><CardDescription className="sr-only">按状态、负责人、日期和关键词筛选{profile.title}</CardDescription><LeadFiltersToolbar sourceFilters={profile.sourceFilters} filters={filters} assigneeOptions={filterAssigneeState.options} assigneeKeyword={filterAssigneeKeyword} assigneeLoading={filterAssigneeLoading} assigneeError={filterAssigneeError} assigneeHasMore={filterAssigneeState.hasMore} disabled={loading} onAssigneeKeywordChange={setFilterAssigneeKeyword} onAssigneeSearch={(includeEmployeeId) => void loadFilterAssigneeOptions(filterAssigneeKeyword, includeEmployeeId)} onNavigate={navigate} /></CardHeader>
      <CardContent className="relative flex min-h-0 flex-1 flex-col p-0" aria-busy={loading}>
        <div className="min-h-0 flex-1 overflow-auto">
          {viewState === "loading" ? <LeadListSkeleton /> : null}
          {viewState === "error" ? <InlineError title="线索列表加载失败" message={listError ?? "请重试"} onRetry={() => void loadList(listTarget.current())} /> : null}
          {viewState === "empty" ? <Empty><EmptyHeader><EmptyMedia variant="icon"><Inbox /></EmptyMedia><EmptyTitle>没有符合条件的线索</EmptyTitle><EmptyDescription>调整筛选条件后重试，新线索会显示在这里。</EmptyDescription></EmptyHeader></Empty> : null}
          {viewState === "ready" ? <LeadTable showSource={profile.sourceFilters} page={data} onOpen={openDetail} /> : null}
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
          {detail ? <DetailPanel detail={detail} actions={detail.actions || detail.status === "new" || detail.status === "contacted" ? allowedActions : []} busy={busy} followUpLoading={followUpLoading} followUpError={followUpError} onAction={beginAction} onFollowUpPage={(page) => void loadFollowUps({ leadId: detail.id, page, pageSize: FOLLOW_UP_PAGE_SIZE })} onFollowUpRetry={() => void loadFollowUps(followUpTarget.current())} /> : null}
        </div>
      </SheetContent>
    </Sheet>
    <Dialog open={action !== null} onOpenChange={(open) => { if (!open && !busy) { appointmentAuthority.invalidate(); setAppointmentLoading(false); setAppointmentError(null); setAction(null); idempotencyIntent.complete(); actionLeadVersion.current = null; actionSubmission.reset(); setCommandAccepted(false); } }}>
      <DialogContent className="flex max-h-[86dvh] flex-col overflow-hidden"><DialogHeader className="shrink-0"><DialogTitle>{action ? actionTitle(action) : "处理线索"}</DialogTitle><DialogDescription>{commandAccepted ? "操作已提交，仅重新同步列表和详情，不会重复提交操作。" : action === "convert" ? "服务端将预检并复用已有客户；仅新建客户时校验客户创建权限。" : "提交后会重新读取列表和详情，确认最新状态。"}</DialogDescription></DialogHeader>
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto pr-1">
        {actionError ? <Alert variant="destructive"><AlertTitle>操作未确认</AlertTitle><AlertDescription>{actionError}</AlertDescription></Alert> : null}
        {action ? <ActionForm appointmentRequired={profile.appointmentRequired} action={action} appointments={actionAppointments.list} appointmentPagination={actionAppointments.pagination} appointmentLoading={appointmentLoading} appointmentError={appointmentError} assigneeOptions={assigneeOptions} assigneeKeyword={assigneeKeyword} assigneeLoading={assigneeLoading} assigneeError={assigneeError} assigneeHasMore={assigneeHasMore} values={actionValues} errors={actionErrors} disabled={busy || commandAccepted || actionRequiresRefresh} onAppointmentPage={(page) => detail && void loadAppointments({ leadId: detail.id, page, pageSize: APPOINTMENT_PAGE_SIZE })} onAppointmentRetry={() => void loadAppointments(appointmentTarget.current())} onAssigneeKeywordChange={setAssigneeKeyword} onAssigneeSearch={searchAssignees} onChange={(patch) => { setActionValues((current) => ({ ...current, ...patch })); setActionErrors({}); }} /> : null}
        </div>
        <DialogFooter className="shrink-0"><Button variant="outline" disabled={busy} onClick={() => { appointmentAuthority.invalidate(); setAppointmentLoading(false); setAppointmentError(null); setAction(null); idempotencyIntent.complete(); actionLeadVersion.current = null; actionSubmission.reset(); setCommandAccepted(false); }}>取消操作</Button><Button variant={action === "mark_invalid" ? "destructive" : "default"} disabled={busy || (action === "follow_up" && appointmentLoading)} onClick={() => void submitAction()}>{busy ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}{commandAccepted ? "重新同步最新状态" : actionRequiresRefresh ? "刷新后重新确认" : action ? actionSubmitLabel(action) : "提交操作"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
