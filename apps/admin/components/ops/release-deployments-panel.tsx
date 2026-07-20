"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import type { ReleaseEnvironment, ReleaseRefType, ReleaseSuccessfulRef } from "@/components/ops/ops-types";
import { OpsTabsList, OpsTabsTrigger } from "@/components/ops/ops-tabs";
import { useReleaseDeploymentStore } from "@/components/ops/release-deployments-store";
import { RuntimeVersionsPanel } from "@/components/ops/release-deployments-dialogs";
import { ProductionMigrationAssistCard } from "@/components/ops/production-migration-assist-card";
import { ProductionMigrationCard } from "@/components/ops/production-migration-card";
import { ReleaseDispatchCard } from "@/components/ops/release-deployments-dispatch-card";
import { ReleaseRunsCard, SuccessfulRefsCard } from "@/components/ops/release-deployments-sections";
import { ReleaseCandidateEvidence } from "@/components/ops/release-candidate-evidence";
import { createReleaseTag, createRollbackTag, dispatchRelease, RELEASE_RUN_FORCE_POLL_MS, type ReleaseDeploymentsPanelProps } from "@/components/ops/release-deployments-shared";
import { useReleaseDeploymentSnapshots } from "@/components/ops/release-deployments-snapshots";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent } from "@/components/ui/tabs";

type ReleaseMode = "service-release" | "web-release" | "database-migration";

const WEB_RELEASE_WORKFLOWS = {
  devGate: "verify-dev-web-deployment-gate.yml",
  devDeploy: "deploy-dev.yml",
  productionBuild: "build-docker-images.yml",
  productionGate: "verify-production-web-deployment-gate.yml",
  productionDeploy: "deploy-docker-services.yml",
} as const;

function getRepositoryUrl(repository: string | undefined) {
  const repositorySlug = repository?.trim() || "LeeFo-china/goose";
  return repositorySlug.startsWith("http")
    ? repositorySlug.replace(/\/$/, "")
    : `https://github.com/${repositorySlug}`;
}

function getWorkflowUrl(repository: string | undefined, workflowId: string) {
  return `${getRepositoryUrl(repository)}/actions/workflows/${workflowId}`;
}

function getRepositoryFileUrl(repository: string | undefined, filePath: string) {
  return `${getRepositoryUrl(repository)}/blob/main/${filePath}`;
}

function releaseModeTitle(mode: ReleaseMode) {
  if (mode === "database-migration") return "数据库迁移";
  if (mode === "web-release") return "官网发布";
  return "服务发布";
}

function releaseModeDescription(mode: ReleaseMode) {
  if (mode === "database-migration") return "提交生产 migration GitHub Actions，默认先预检查 pending migrations。";
  if (mode === "web-release") return "官网 Web 使用独立 Gate，不进入服务发布多选；按环境先验证再 Web-only 部署。";
  return "选择发布来源、配置目标服务，并提交 GitHub Actions 发布任务。";
}

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
  const [releaseMode, setReleaseMode] = useState<ReleaseMode>("service-release");
  const [rollbackConfirmText, setRollbackConfirmText] = useState("");
  const [selectedCandidateRunId, setSelectedCandidateRunId] = useState("");
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
      toast.success(data.message || "回滚 Tag 已创建，请构建并验证生产候选后再部署。");
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
        confirm_text: "确认构建生产候选",
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
      toast.success(data.message || `已提交回滚候选构建：${tagData.tag}`);
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
  const disabled = pending || !options?.configured || !currentEnvironment || selectedServices.length === 0 || !releaseRefReady || (production && confirmText !== "确认构建生产候选");
  const readyProductionRuns = useMemo(
    () => currentRuns.filter((run) => run.environment === "production" && run.stage === "ready_to_deploy" && !run.legacy),
    [currentRuns],
  );
  const selectedReadyProductionRun = readyProductionRuns.find((run) => run.id === selectedCandidateRunId)
    || readyProductionRuns[0]
    || null;

  function refreshAfterCandidateSubmitted() {
    router.refresh();
    setForcePollUntil(Date.now() + RELEASE_RUN_FORCE_POLL_MS);
    void refreshReleaseSnapshots({ silent: true });
  }

  return (
    <div className="flex flex-col gap-3">
      <RuntimeVersionsPanel
        data={currentRuntimeVersions}
        error={runtimeError}
        refreshing={runsRefreshing}
        onRefresh={() => void refreshReleaseSnapshots()}
      />

      <Tabs value={releaseMode} onValueChange={(value) => setReleaseMode(value as ReleaseMode)}>
        <div className={releaseMode === "database-migration" ? "grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.62fr)]" : ""}>
          <Card>
            <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle>{releaseModeTitle(releaseMode)}</CardTitle>
                <CardDescription>{releaseModeDescription(releaseMode)}</CardDescription>
              </div>
              <OpsTabsList className="md:w-auto">
                <OpsTabsTrigger value="service-release">服务发布</OpsTabsTrigger>
                <OpsTabsTrigger value="web-release">官网发布</OpsTabsTrigger>
                <OpsTabsTrigger value="database-migration">数据库迁移</OpsTabsTrigger>
              </OpsTabsList>
            </CardHeader>
            <CardContent>
              <TabsContent value="service-release" className="mt-0">
                <ReleaseDispatchCard
                  state={{ error, options, latestDispatch, production, productionVersionMode, pending, disabled, creatingProductionTag, currentEnvironment, selectedServiceLabel, confirmRefLabel, environment, serviceOptions, selectedServices, ref, tagName, tagSourceRefType, tagSourceRef, tagMessage, refType, reason, confirmText }}
                  actions={{ onEnvironmentChange, setDraft, onRefTypeChange, runDispatch }}
                  sourcePicker={(
                    <SuccessfulRefsCard
                      embedded
                      state={{ successfulRefEnvironment, currentSuccessfulRefsPagination, successfulRefsRefreshing, successfulRefKeyword, currentSuccessfulRefs, rollbackPendingId, rollbackConfirmText }}
                      actions={{ setSuccessfulRefEnvironment, setSuccessfulRefKeyword, applySuccessfulRef, runCreateRollbackTag, setRollbackConfirmText, runRollbackDispatch, changeSuccessfulRefsPage }}
                    />
                  )}
                />
                {production ? (
                  <>
                    <Separator className="my-5" />
                    <ReleaseCandidateEvidence
                      run={selectedReadyProductionRun}
                      configured={Boolean(options?.configured)}
                      onSubmitted={refreshAfterCandidateSubmitted}
                    />
                  </>
                ) : null}
              </TabsContent>
              <TabsContent value="database-migration" className="mt-0">
                <ProductionMigrationCard
                  options={options}
                  onSubmitted={() => {
                    router.refresh();
                    setForcePollUntil(Date.now() + RELEASE_RUN_FORCE_POLL_MS);
                    void refreshReleaseSnapshots({ silent: true });
                  }}
                />
              </TabsContent>
              <TabsContent value="web-release" className="mt-0">
                <WebReleaseGuideCard repository={options?.repository} />
              </TabsContent>
            </CardContent>
          </Card>
          {releaseMode === "database-migration" ? <ProductionMigrationAssistCard options={options} /> : null}
        </div>
      </Tabs>

      <ReleaseRunsCard
        state={{ lastRunsRefreshedAt, runsPollError, hasActiveRuns, currentRunsPagination, runsRefreshing, currentRuns, selectedCandidateRunId }}
        actions={{ refreshReleaseSnapshots, changeRunsPage, selectCandidateRun: setSelectedCandidateRunId }}
      />
    </div>
  );
}

function WebReleaseGuideCard({ repository }: { repository?: string }) {
  const devGateUrl = getWorkflowUrl(repository, WEB_RELEASE_WORKFLOWS.devGate);
  const devDeployUrl = getWorkflowUrl(repository, WEB_RELEASE_WORKFLOWS.devDeploy);
  const productionBuildUrl = getWorkflowUrl(repository, WEB_RELEASE_WORKFLOWS.productionBuild);
  const productionGateUrl = getWorkflowUrl(repository, WEB_RELEASE_WORKFLOWS.productionGate);
  const productionDeployUrl = getWorkflowUrl(repository, WEB_RELEASE_WORKFLOWS.productionDeploy);
  const productionRunbookUrl = getRepositoryFileUrl(
    repository,
    "docs/operations/official-website-production-cutover-runbook.md",
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border bg-muted/20 p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold">官网发布独立入口</h3>
              <Badge variant="outline">Web-only Gate</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              官网 Web 使用独立 Gate。先确认 API revision、migration 与 smoke 结果，再执行 Web-only 部署；
              不进入服务发布多选，避免和 API/Admin/Worker 发布链路混跑。
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <WebReleaseEnvironmentPanel
          title="开发环境"
          description="用于 www-dev.goodcms.cn。先跑开发 Web Gate，再在 Dev 部署 workflow 中选择 service=web。"
          steps={[
            "确认 API 已发布到目标 commit，并完成必要 migration。",
            `运行 ${WEB_RELEASE_WORKFLOWS.devGate}，记录成功的 gate_run_id。`,
            `运行 ${WEB_RELEASE_WORKFLOWS.devDeploy}，选择 service=web 并填入 gate_run_id。`,
          ]}
          actions={[
            { label: "开发 Web Gate", href: devGateUrl },
            { label: "开发 Web 部署", href: devDeployUrl },
          ]}
        />
        <WebReleaseEnvironmentPanel
          title="生产环境"
          description="用于生产官网。先构建生产 Web SHA 镜像，完成证据绑定部署后再人工切流。"
          steps={[
            "确认同一 commit 的 API 已部署且健康，并已应用必要 migration。",
            `运行 ${WEB_RELEASE_WORKFLOWS.productionBuild}，使用同一发布 Tag 构建 production / web，记录 build_run_id 与 commit SHA。`,
            `运行 ${WEB_RELEASE_WORKFLOWS.productionGate}，核对 API revision、migration 与 smoke，记录 gate_run_id。`,
            `运行 ${WEB_RELEASE_WORKFLOWS.productionDeploy}，使用同一发布 Tag，选择 service=web，填入 built_image_sha、build_run_id、gate_run_id、web_smoke_content_path 与确认文本。`,
            "container loopback smoke 通过后，按生产切流 Runbook 人工切流；workflow 不会 reload Nginx。",
          ]}
          actions={[
            { label: "生产 Web 构建", href: productionBuildUrl },
            { label: "生产 Web Gate", href: productionGateUrl },
            { label: "生产 Web 部署", href: productionDeployUrl },
            { label: "生产切流 Runbook", href: productionRunbookUrl },
          ]}
        />
      </div>
    </div>
  );
}

function WebReleaseEnvironmentPanel({
  title,
  description,
  steps,
  actions,
}: {
  title: string;
  description: string;
  steps: string[];
  actions: Array<{ label: string; href: string }>;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border p-4">
      <div>
        <h4 className="text-sm font-semibold">{title}</h4>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <ol className="flex flex-col gap-2 text-sm text-muted-foreground">
        {steps.map((step, index) => (
          <li key={step} className="flex gap-2">
            <span aria-hidden="true" className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-foreground">
              {index + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <div className="mt-auto flex flex-wrap gap-2">
        {actions.map((action) => (
          <Button key={action.href} asChild variant="outline" size="sm">
            <Link href={action.href} target="_blank" rel="noreferrer">
              <ExternalLink data-icon="inline-start" />
              {action.label}
            </Link>
          </Button>
        ))}
      </div>
    </div>
  );
}
