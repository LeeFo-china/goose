"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ReleaseEnvironment, ReleaseRefType, ReleaseRun, ReleaseService, ReleaseSuccessfulRef } from "@/components/ops/ops-types";
import { useReleaseDeploymentStore } from "@/components/ops/release-deployments-store";
import { RuntimeVersionsPanel } from "@/components/ops/release-deployments-dialogs";
import { ReleaseDispatchCard } from "@/components/ops/release-deployments-dispatch-card";
import { ReleaseRunsCard, SuccessfulRefsCard } from "@/components/ops/release-deployments-sections";
import { createReleaseTag, createRollbackTag, dispatchRelease, fetchReleaseRuntimeVersions, fetchReleaseRuns, fetchSuccessfulRefs, isReleaseRunActive, REF_TYPE_OPTIONS, RELEASE_RUN_FORCE_POLL_MS, RELEASE_RUN_POLL_MS, type ReleaseDeploymentsPanelProps, type ReleaseSearchEnvironment } from "@/components/ops/release-deployments-shared";

export function ReleaseDeploymentsPanel({
  options,
  runs,
  runsPagination,
  successfulRefs,
  successfulRefsPagination,
  runtimeVersions,
  runtimeError,
  error,
}: ReleaseDeploymentsPanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rollbackConfirmText, setRollbackConfirmText] = useState("");
  const [currentRuns, setCurrentRuns] = useState(runs);
  const [currentRunsPagination, setCurrentRunsPagination] = useState(runsPagination);
  const [currentSuccessfulRefs, setCurrentSuccessfulRefs] = useState(successfulRefs);
  const [currentSuccessfulRefsPagination, setCurrentSuccessfulRefsPagination] = useState(successfulRefsPagination);
  const [currentRuntimeVersions, setCurrentRuntimeVersions] = useState(runtimeVersions);
  const [runsRefreshing, setRunsRefreshing] = useState(false);
  const [successfulRefsRefreshing, setSuccessfulRefsRefreshing] = useState(false);
  const [runsPollError, setRunsPollError] = useState("");
  const [lastRunsRefreshedAt, setLastRunsRefreshedAt] = useState<string | null>(null);
  const [forcePollUntil, setForcePollUntil] = useState(0);
  const [runsPage, setRunsPage] = useState(runsPagination.page || 1);
  const [successfulRefsPage, setSuccessfulRefsPage] = useState(successfulRefsPagination.page || 1);
  const [successfulRefEnvironment, setSuccessfulRefEnvironment] = useState<ReleaseSearchEnvironment>("all");
  const [successfulRefKeyword, setSuccessfulRefKeyword] = useState("");
  const {
    environment,
    service,
    services,
    refType,
    ref,
    reason,
    confirmText,
    latestDispatch,
    productionVersionMode,
    tagName,
    tagSourceRefType,
    tagSourceRef,
    tagMessage,
    rollbackPendingId,
    setDraft,
    resetEnvironment,
    resetRefType,
  } = useReleaseDeploymentStore();
  const currentEnvironment = useMemo(
    () => options?.environments.find((item) => item.environment === environment) || null,
    [environment, options],
  );
  const hasActiveRuns = useMemo(() => currentRuns.some(isReleaseRunActive), [currentRuns]);
  const shouldPollRuns = hasActiveRuns || Date.now() < forcePollUntil;

  useEffect(() => {
    setCurrentRuns(runs);
  }, [runs]);

  useEffect(() => {
    setCurrentRunsPagination(runsPagination);
    setRunsPage(runsPagination.page || 1);
  }, [runsPagination]);

  useEffect(() => {
    setCurrentSuccessfulRefs(successfulRefs);
  }, [successfulRefs]);

  useEffect(() => {
    setCurrentSuccessfulRefsPagination(successfulRefsPagination);
    setSuccessfulRefsPage(successfulRefsPagination.page || 1);
  }, [successfulRefsPagination]);

  useEffect(() => {
    setCurrentRuntimeVersions(runtimeVersions);
  }, [runtimeVersions]);

  const refreshReleaseSnapshots = useCallback(async ({
    silent = false,
    nextRunsPage = runsPage,
    nextSuccessfulRefsPage = successfulRefsPage,
    nextSuccessfulRefEnvironment = successfulRefEnvironment,
    nextSuccessfulRefKeyword = successfulRefKeyword,
  }: {
    silent?: boolean;
    nextRunsPage?: number;
    nextSuccessfulRefsPage?: number;
    nextSuccessfulRefEnvironment?: ReleaseSearchEnvironment;
    nextSuccessfulRefKeyword?: string;
  } = {}) => {
    if (!silent) setRunsRefreshing(true);
    if (!silent) setSuccessfulRefsRefreshing(true);
    try {
      const [nextRuns, nextSuccessfulRefs, nextRuntimeVersions] = await Promise.all([
        fetchReleaseRuns({ page: nextRunsPage, pageSize: 5 }),
        fetchSuccessfulRefs({
          page: nextSuccessfulRefsPage,
          pageSize: 5,
          environment: nextSuccessfulRefEnvironment,
          keyword: nextSuccessfulRefKeyword,
        }),
        fetchReleaseRuntimeVersions(),
      ]);
      setCurrentRuns(nextRuns.list || []);
      setCurrentRunsPagination(nextRuns.pagination);
      setRunsPage(nextRuns.pagination.page || nextRunsPage);
      setCurrentSuccessfulRefs(nextSuccessfulRefs.list || []);
      setCurrentSuccessfulRefsPagination(nextSuccessfulRefs.pagination);
      setSuccessfulRefsPage(nextSuccessfulRefs.pagination.page || nextSuccessfulRefsPage);
      setCurrentRuntimeVersions(nextRuntimeVersions);
      setLastRunsRefreshedAt(new Date().toISOString());
      setRunsPollError("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "发布状态刷新失败";
      setRunsPollError(message);
      if (!silent) toast.error(message);
    } finally {
      if (!silent) setRunsRefreshing(false);
      if (!silent) setSuccessfulRefsRefreshing(false);
    }
  }, [runsPage, successfulRefEnvironment, successfulRefKeyword, successfulRefsPage]);

  useEffect(() => {
    if (!shouldPollRuns) return undefined;

    let cancelled = false;
    const tick = async () => {
      if (document.visibilityState !== "visible" || cancelled) return;
      setRunsRefreshing(true);
      try {
        const [nextRuns, nextSuccessfulRefs, nextRuntimeVersions] = await Promise.all([
          fetchReleaseRuns({ page: runsPage, pageSize: 5 }),
          fetchSuccessfulRefs({
            page: successfulRefsPage,
            pageSize: 5,
            environment: successfulRefEnvironment,
            keyword: successfulRefKeyword,
          }),
          fetchReleaseRuntimeVersions(),
        ]);
        if (cancelled) return;
        setCurrentRuns(nextRuns.list || []);
        setCurrentRunsPagination(nextRuns.pagination);
        setCurrentSuccessfulRefs(nextSuccessfulRefs.list || []);
        setCurrentSuccessfulRefsPagination(nextSuccessfulRefs.pagination);
        setCurrentRuntimeVersions(nextRuntimeVersions);
        setLastRunsRefreshedAt(new Date().toISOString());
        setRunsPollError("");
      } catch (err) {
        if (!cancelled) setRunsPollError(err instanceof Error ? err.message : "发布状态刷新失败");
      } finally {
        if (!cancelled) setRunsRefreshing(false);
      }
    };

    const timer = window.setInterval(tick, RELEASE_RUN_POLL_MS);
    void tick();

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [runsPage, shouldPollRuns, successfulRefEnvironment, successfulRefKeyword, successfulRefsPage]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setSuccessfulRefsPage(1);
      setSuccessfulRefsRefreshing(true);
      fetchSuccessfulRefs({
        page: 1,
        pageSize: 5,
        environment: successfulRefEnvironment,
        keyword: successfulRefKeyword,
      })
        .then((data) => {
          if (cancelled) return;
          setCurrentSuccessfulRefs(data.list || []);
          setCurrentSuccessfulRefsPagination(data.pagination);
          setSuccessfulRefsPage(data.pagination.page || 1);
        })
        .catch((err) => {
          if (!cancelled) setRunsPollError(err instanceof Error ? err.message : "发布辅助刷新失败");
        })
        .finally(() => {
          if (!cancelled) setSuccessfulRefsRefreshing(false);
        });
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [successfulRefEnvironment, successfulRefKeyword]);

  function onEnvironmentChange(value: ReleaseEnvironment) {
    const nextEnvironment = options?.environments.find((item) => item.environment === value) || null;
    const nextService = nextEnvironment?.services.find((item) => item.value !== "all")?.value
      || nextEnvironment?.services[0]?.value
      || "admin";
    resetEnvironment({
      environment: value,
      defaultRef: nextEnvironment?.default_ref || "feature/multi-tenant",
      service: nextService,
    });
  }

  function onRefTypeChange(value: ReleaseRefType) {
    resetRefType({
      refType: value,
      defaultRef: currentEnvironment?.default_ref || "feature/multi-tenant",
    });
  }

  function changeRunsPage(nextPage: number) {
    const normalized = Math.max(1, Math.min(nextPage, Math.max(currentRunsPagination.totalPages, 1)));
    setRunsPage(normalized);
    void refreshReleaseSnapshots({ nextRunsPage: normalized });
  }

  function changeSuccessfulRefsPage(nextPage: number) {
    const normalized = Math.max(1, Math.min(nextPage, Math.max(currentSuccessfulRefsPagination.totalPages, 1)));
    setSuccessfulRefsPage(normalized);
    void refreshReleaseSnapshots({ nextSuccessfulRefsPage: normalized });
  }

  function applySuccessfulRef(item: ReleaseSuccessfulRef) {
    setDraft({
      environment: "production",
      refType: "tag",
      productionVersionMode: "new_tag",
      tagSourceRefType: "commit",
      tagSourceRef: item.head_sha,
      tagMessage: tagMessage.trim() || `release from ${item.head_sha.slice(0, 7)}`,
    });
    toast.success("已填入生产发布来源，请在左侧补充 Tag 名称后提交");
  }

  async function runCreateRollbackTag(item: ReleaseSuccessfulRef) {
    setDraft({ rollbackPendingId: item.id });
    try {
      const data = await createRollbackTag({
        source_ref: item.head_sha,
        message: `rollback to ${item.head_sha.slice(0, 7)}`,
      });
      setDraft({
        environment: "production",
        refType: "tag",
        ref: data.tag,
        confirmText: "",
        reason: reason.trim() || `回滚发布 ${data.tag}`,
        tagName: "",
        tagSourceRefType: "commit",
        tagSourceRef: data.target_sha,
        tagMessage: "",
        productionVersionMode: "existing_tag",
      });
      toast.success(data.message || "回滚 Tag 已创建，请确认后发布生产");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "回滚 Tag 创建失败");
    } finally {
      setDraft({ rollbackPendingId: "" });
    }
  }

  async function runRollbackDispatch(item: ReleaseSuccessfulRef) {
    setDraft({ rollbackPendingId: item.id });
    const fallbackReason = `生产回滚到 ${item.head_sha.slice(0, 7)}：${item.title}`;
    try {
      const tagData = await createRollbackTag({
        source_ref: item.head_sha,
        message: `rollback to ${item.head_sha.slice(0, 7)}`,
      });
      const data = await dispatchRelease({
        environment: "production",
        service: "all",
        services: ["all"],
        ref_type: "tag",
        ref: tagData.tag,
        operation: "rollback",
        reason: reason.trim() || fallbackReason,
        confirm_text: "确认回滚生产",
      });
      setDraft({
        environment: "production",
        service: "all",
        services: ["all"],
        refType: "tag",
        ref: tagData.tag,
        confirmText: "",
        reason: reason.trim() || fallbackReason,
        tagName: "",
        tagSourceRefType: "commit",
        tagSourceRef: tagData.target_sha,
        tagMessage: "",
        latestDispatch: data,
        productionVersionMode: "existing_tag",
      });
      setRollbackConfirmText("");
      toast.success(data.message || `已提交生产回滚：${tagData.tag}`);
      router.refresh();
      setForcePollUntil(Date.now() + RELEASE_RUN_FORCE_POLL_MS);
      void refreshReleaseSnapshots({ silent: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "生产回滚提交失败");
    } finally {
      setDraft({ rollbackPendingId: "" });
    }
  }

  function runDispatch() {
    const selectedServices = services;
    startTransition(async () => {
      let createdTag = "";
      try {
        let releaseRef = ref;
        if (environment === "production" && productionVersionMode === "new_tag") {
          const tagData = await createReleaseTag({
            tag: tagName,
            source_ref: tagSourceRef,
            message: tagMessage,
          });
          releaseRef = tagData.tag;
          createdTag = tagData.tag;
          setDraft({
            ref: tagData.tag,
            productionVersionMode: "existing_tag",
            reason: reason.trim() || `发布 ${tagData.tag}`,
            tagName: "",
            tagSourceRefType: "branch",
            tagSourceRef: currentEnvironment?.default_ref || "feature/multi-tenant",
            tagMessage: "",
          });
          toast.success(tagData.message || "发布 Tag 已创建");
        }

        const data = await dispatchRelease({
          environment,
          service: selectedServices.includes("all") ? "all" : selectedServices[0] || service,
          services: selectedServices,
          ref_type: refType,
          ref: releaseRef,
          reason: reason || (environment === "production" && productionVersionMode === "new_tag" ? `发布 ${releaseRef}` : ""),
          confirm_text: environment === "production" ? confirmText : undefined,
        });
        setDraft({ latestDispatch: data });
        toast.success(data.message || "发布任务已提交");
        router.refresh();
        setForcePollUntil(Date.now() + RELEASE_RUN_FORCE_POLL_MS);
        void refreshReleaseSnapshots({ silent: true });
      } catch (err) {
        if (createdTag) {
          toast.error(`Tag ${createdTag} 已创建，但发布任务提交失败：${err instanceof Error ? err.message : "未知错误"}`);
          return;
        }
        toast.error(err instanceof Error ? err.message : "发布任务提交失败");
      }
    });
  }

  const serviceOptions = currentEnvironment?.services || [];
  const selectedServices = services;
  const production = environment === "production";
  const creatingProductionTag = production && productionVersionMode === "new_tag";
  const selectedServiceLabel = selectedServices.includes("all")
    ? "全部服务"
    : serviceOptions
      .filter((item) => selectedServices.includes(item.value))
      .map((item) => item.label)
      .join("、");
  const releaseRefReady = creatingProductionTag
    ? Boolean(tagName.trim() && tagSourceRef.trim() && tagMessage.trim())
    : Boolean(ref.trim());
  const confirmRefLabel = creatingProductionTag ? tagName || "新 Tag" : ref || "-";
  const disabled = pending || !options?.configured || !currentEnvironment || selectedServices.length === 0 || !releaseRefReady || (production && confirmText !== "确认发布生产");

  return (
    <div className="flex flex-col gap-3">
      <RuntimeVersionsPanel
        data={currentRuntimeVersions}
        error={runtimeError}
        refreshing={runsRefreshing}
        onRefresh={() => void refreshReleaseSnapshots()}
      />

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(520px,0.9fr)] 2xl:grid-cols-[minmax(0,1fr)_minmax(580px,0.9fr)]">
        <ReleaseDispatchCard state={{ error, options, latestDispatch, production, productionVersionMode, pending, disabled, creatingProductionTag, currentEnvironment, selectedServiceLabel, confirmRefLabel, environment, serviceOptions, selectedServices, ref, tagName, tagSourceRefType, tagSourceRef, tagMessage, refType, reason, confirmText }} actions={{ onEnvironmentChange, setDraft, onRefTypeChange, runDispatch }} />

      <SuccessfulRefsCard state={{ successfulRefEnvironment, currentSuccessfulRefsPagination, successfulRefsRefreshing, successfulRefKeyword, currentSuccessfulRefs, rollbackPendingId, rollbackConfirmText }} actions={{ setSuccessfulRefEnvironment, setSuccessfulRefKeyword, applySuccessfulRef, runCreateRollbackTag, setRollbackConfirmText, runRollbackDispatch, changeSuccessfulRefsPage }} />
      </div>

      <ReleaseRunsCard state={{ lastRunsRefreshedAt, runsPollError, hasActiveRuns, currentRunsPagination, runsRefreshing, currentRuns }} actions={{ refreshReleaseSnapshots, changeRunsPage }} />
    </div>
  );
}
