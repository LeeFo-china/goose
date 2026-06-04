"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ReleaseEnvironment, ReleaseRefType, ReleaseSuccessfulRef } from "@/components/ops/ops-types";
import { useReleaseDeploymentStore } from "@/components/ops/release-deployments-store";
import { RuntimeVersionsPanel } from "@/components/ops/release-deployments-dialogs";
import { ReleaseDispatchCard } from "@/components/ops/release-deployments-dispatch-card";
import { ReleaseRunsCard, SuccessfulRefsCard } from "@/components/ops/release-deployments-sections";
import { createReleaseTag, createRollbackTag, dispatchRelease, RELEASE_RUN_FORCE_POLL_MS, type ReleaseDeploymentsPanelProps } from "@/components/ops/release-deployments-shared";
import { useReleaseDeploymentSnapshots } from "@/components/ops/release-deployments-snapshots";

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
  const snapshots = useReleaseDeploymentSnapshots({
    runs,
    runsPagination,
    successfulRefs,
    successfulRefsPagination,
    runtimeVersions,
  });
  const {
    currentRuns,
    currentRunsPagination,
    currentSuccessfulRefs,
    currentSuccessfulRefsPagination,
    currentRuntimeVersions,
    runsRefreshing,
    successfulRefsRefreshing,
    runsPollError,
    lastRunsRefreshedAt,
    hasActiveRuns,
    successfulRefEnvironment,
    successfulRefKeyword,
    setSuccessfulRefEnvironment,
    setSuccessfulRefKeyword,
    setForcePollUntil,
    refreshReleaseSnapshots,
    changeRunsPage,
    changeSuccessfulRefsPage,
  } = snapshots;
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

  function onEnvironmentChange(value: ReleaseEnvironment) {
    const nextEnvironment = options?.environments.find((item) => item.environment === value) || null;
    const nextService = nextEnvironment?.services.find((item) => item.value !== "all")?.value
      || nextEnvironment?.services[0]?.value
      || "admin";
    resetEnvironment({
      environment: value,
      defaultRef: nextEnvironment?.default_ref || "main",
      service: nextService,
    });
  }

  function onRefTypeChange(value: ReleaseRefType) {
    resetRefType({
      refType: value,
      defaultRef: currentEnvironment?.default_ref || "main",
    });
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
            tagSourceRef: currentEnvironment?.default_ref || "main",
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
