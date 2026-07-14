import type { Pagination, ProductionReleaseCandidate, ReleaseCreateTagResult, ReleaseDispatchResult, ReleaseEnvironment, ReleaseMigrationMode, ReleaseOperation, ReleaseOptionsData, ReleaseProductionMigrationDispatchResult, ReleaseProductionMigrationPrecheckResult, ReleaseRefOption, ReleaseRefType, ReleaseRuntimeServiceVersion, ReleaseRuntimeVersionData, ReleaseRun, ReleaseRunFailureSummary, ReleaseRunListData, ReleaseService, ReleaseStage, ReleaseSuccessfulRef, ReleaseSuccessfulRefListData } from "@/components/ops/ops-types";
import { requestBackendJson } from "@/lib/backend-client";

export type ReleaseDeploymentsPanelProps = {
  options: ReleaseOptionsData | null;
  runs: ReleaseRun[];
  runsPagination: Pagination;
  successfulRefs: ReleaseSuccessfulRef[];
  successfulRefsPagination: Pagination;
  runtimeVersions: ReleaseRuntimeVersionData | null;
  runtimeError?: string | null;
  error?: string | null;
};

export type ReleaseSearchEnvironment = ReleaseEnvironment | "all";

export const REF_TYPE_OPTIONS: Array<{
  value: ReleaseRefType;
  label: string;
  description: string;
}> = [
  { value: "branch", label: "分支", description: "适合 dev 快速验证" },
  { value: "tag", label: "Tag", description: "适合生产发布" },
];
export const RELEASE_RUN_POLL_MS = 15_000;
export const RELEASE_RUN_FORCE_POLL_MS = 10 * 60_000;

export async function dispatchRelease(payload: {
  environment: ReleaseEnvironment;
  service: ReleaseService;
  services?: ReleaseService[];
  ref_type: ReleaseRefType;
  ref: string;
  operation?: ReleaseOperation;
  reason: string;
  confirm_text?: string;
}) {
  return requestBackendJson<ReleaseDispatchResult>("/admin/ops/releases/dispatch", {
    method: "POST",
    body: JSON.stringify(payload),
    fallbackMessage: "发布任务提交失败",
  });
}

export async function dispatchProductionMigration(payload: {
  mode: ReleaseMigrationMode;
  ref_type: Exclude<ReleaseRefType, "commit">;
  ref: string;
  reason: string;
  confirm_text?: string;
}) {
  return requestBackendJson<ReleaseProductionMigrationDispatchResult>("/admin/ops/releases/production-migrations/dispatch", {
    method: "POST",
    body: JSON.stringify(payload),
    fallbackMessage: "生产数据库迁移任务提交失败",
  });
}

export async function dispatchProductionMigrationPrecheck(payload: {
  ref_type: Exclude<ReleaseRefType, "commit">;
  ref: string;
  reason: string;
}) {
  return requestBackendJson<ReleaseProductionMigrationDispatchResult>("/admin/ops/releases/production-migrations/precheck", {
    method: "POST",
    body: JSON.stringify(payload),
    fallbackMessage: "生产数据库迁移对比预检查提交失败",
  });
}

export async function fetchProductionMigrationPrecheck(runId: string) {
  return requestBackendJson<ReleaseProductionMigrationPrecheckResult>(
    `/admin/ops/releases/production-migrations/precheck/${encodeURIComponent(runId)}`,
    { cache: "no-store", fallbackMessage: "生产数据库迁移对比结果加载失败" },
  );
}

export async function fetchProductionReleaseCandidate(runId: string) {
  return requestBackendJson<ProductionReleaseCandidate>(
    `/admin/ops/releases/production-candidates/${encodeURIComponent(runId)}`,
    { cache: "no-store", fallbackMessage: "生产候选证据校验失败" },
  );
}

export async function deployProductionReleaseCandidate(runId: string, payload: {
  services: Exclude<ReleaseService, "all">[];
  confirm_text: "确认部署生产环境";
  reason?: string;
}) {
  return requestBackendJson<ReleaseDispatchResult>(
    `/admin/ops/releases/production-candidates/${encodeURIComponent(runId)}/deploy`,
    { method: "POST", body: JSON.stringify(payload), fallbackMessage: "生产候选部署提交失败" },
  );
}

export async function createReleaseTag(payload: {
  tag: string;
  source_ref: string;
  message: string;
}) {
  return requestBackendJson<ReleaseCreateTagResult>("/admin/ops/releases/tags", {
    method: "POST",
    body: JSON.stringify(payload),
    fallbackMessage: "发布 Tag 创建失败",
  });
}

export async function createRollbackTag(payload: {
  source_ref: string;
  message?: string;
}) {
  return requestBackendJson<ReleaseCreateTagResult>("/admin/ops/releases/rollback-tag", {
    method: "POST",
    body: JSON.stringify(payload),
    fallbackMessage: "回滚 Tag 创建失败",
  });
}

export async function fetchReleaseRefs(input: {
  type: ReleaseRefType;
  keyword: string;
  baseRef?: string;
}) {
  const query = new URLSearchParams({
    type: input.type,
  });
  if (input.keyword.trim()) query.set("keyword", input.keyword.trim());
  if (input.baseRef?.trim()) query.set("base_ref", input.baseRef.trim());

  const data = await requestBackendJson<{ list?: ReleaseRefOption[] }>(`/admin/ops/releases/refs?${query.toString()}`, {
    cache: "no-store",
    fallbackMessage: "版本列表加载失败",
  });
  return data.list || [];
}

export async function fetchReleaseRuns(input: { page: number; pageSize?: number }) {
  const query = new URLSearchParams({
    page: String(input.page),
    pageSize: String(input.pageSize || 5),
  });
  return requestBackendJson<ReleaseRunListData>(`/admin/ops/releases/runs?${query.toString()}`, {
    cache: "no-store",
    fallbackMessage: "最近发布记录刷新失败",
  });
}

export async function fetchSuccessfulRefs(input: {
  page: number;
  pageSize?: number;
  environment: ReleaseSearchEnvironment;
  keyword: string;
}) {
  const query = new URLSearchParams({
    page: String(input.page),
    pageSize: String(input.pageSize || 5),
  });
  if (input.environment !== "all") query.set("environment", input.environment);
  if (input.keyword.trim()) query.set("keyword", input.keyword.trim());

  return requestBackendJson<ReleaseSuccessfulRefListData>(`/admin/ops/releases/successful-refs?${query.toString()}`, {
    cache: "no-store",
    fallbackMessage: "发布辅助刷新失败",
  });
}

export async function fetchReleaseRuntimeVersions() {
  return requestBackendJson<ReleaseRuntimeVersionData>("/admin/ops/releases/runtime-versions", {
    cache: "no-store",
    fallbackMessage: "运行版本刷新失败",
  });
}

export async function fetchReleaseRunFailureSummary(runId: string) {
  return requestBackendJson<ReleaseRunFailureSummary>(`/admin/ops/releases/runs/${encodeURIComponent(runId)}/failure-summary`, {
    cache: "no-store",
    fallbackMessage: "失败摘要加载失败",
  });
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function statusLabel(run: ReleaseRun) {
  if (!run.legacy && run.stage !== "legacy") return run.stage_label || stageLabel(run.stage);
  if (run.status === "completed") {
    if (run.conclusion === "success") return "成功";
    if (run.conclusion === "failure") return "失败";
    if (run.conclusion === "cancelled") return "已取消";
    return run.conclusion || "已完成";
  }
  if (run.status === "in_progress") return "执行中";
  if (run.status === "queued") return "排队中";
  return run.status || "-";
}

export function statusVariant(run: ReleaseRun) {
  if (!run.legacy && run.stage !== "legacy") {
    if (run.stage === "deployed" || run.stage === "ready_to_deploy") return "success" as const;
    if (run.stage === "build_failed" || run.stage === "deploy_failed") return "danger" as const;
    if (
      run.stage === "build_queued"
      || run.stage === "building"
      || run.stage === "deploy_queued"
      || run.stage === "deploying"
    ) return "warning" as const;
  }
  if (run.status === "completed" && run.conclusion === "success") return "success" as const;
  if (run.status === "completed" && run.conclusion) return "danger" as const;
  if (run.status === "in_progress" || run.status === "queued") return "warning" as const;
  return "outline" as const;
}

export function isReleaseRunActive(run: ReleaseRun) {
  if (!run.legacy && run.stage !== "legacy") {
    return run.stage === "build_queued"
      || run.stage === "building"
      || run.stage === "deploy_queued"
      || run.stage === "deploying";
  }
  if (run.status === "queued" || run.status === "in_progress") return true;
  return run.status !== "completed" && !run.conclusion;
}

function stageLabel(stage: ReleaseStage) {
  const labels: Record<ReleaseStage, string> = {
    build_queued: "构建排队中",
    building: "构建中",
    build_failed: "构建失败",
    ready_to_deploy: "可部署",
    deploy_queued: "部署排队中",
    deploying: "部署中",
    deploy_failed: "部署失败",
    deployed: "已部署",
    legacy: "历史记录",
  };
  return labels[stage];
}

export function shouldShowFailureSummary(run: ReleaseRun) {
  return run.status === "completed" && Boolean(run.conclusion) && run.conclusion !== "success";
}

export function getRunActorLabel(run: ReleaseRun) {
  const employee = run.audit?.actor_employee;
  if (employee?.name && employee.phone) return `${employee.name} · ${employee.phone}`;
  if (employee?.name) return employee.name;
  if (employee?.phone) return employee.phone;
  if (run.audit?.actor_user_id) return run.audit.actor_user_id;
  return "未记录";
}

export function getRunRefLabel(run: ReleaseRun) {
  if (run.audit?.ref) {
    return `${run.audit.ref_type_label || "版本"} · ${run.audit.ref}`;
  }
  return `${run.head_branch || "-"} · ${run.head_sha?.slice(0, 7) || "-"}`;
}

export function getSuccessfulRefDescription(item: ReleaseSuccessfulRef) {
  return [
    item.workflow_label,
    item.head_branch ? `来源 ${item.head_branch}` : "",
    `发布时间 ${formatDateTime(item.created_at)}`,
  ].filter(Boolean).join(" · ");
}

export function environmentLabel(environment: ReleaseEnvironment) {
  return environment === "production" ? "生产环境" : "开发环境";
}

export function runtimeHealthVariant(item: ReleaseRuntimeServiceVersion) {
  if (item.health === "healthy") return "success" as const;
  if (item.health === "starting" || item.state === "running") return "warning" as const;
  if (item.health === "unhealthy" || item.health === "exited" || item.state !== "running") return "danger" as const;
  return "outline" as const;
}

export function diffVariant(item: ReleaseRuntimeServiceVersion) {
  if (item.diff_status === "same_as_dev") return "success" as const;
  if (item.diff_status === "behind_dev") return "warning" as const;
  if (item.diff_status === "ahead_of_dev") return "danger" as const;
  return "secondary" as const;
}

export function runtimeVersionLabel(item: ReleaseRuntimeServiceVersion) {
  if (item.revision_short) return item.revision_short;
  if (item.image_tag) return item.image_tag;
  return "等待新版镜像";
}

export function shortenImageId(value: string | null | undefined) {
  if (!value) return "-";
  return value.replace(/^sha256:/, "").slice(0, 12);
}

export function conclusionLabel(value: string | null | undefined) {
  if (value === "failure") return "失败";
  if (value === "timed_out") return "超时";
  if (value === "cancelled") return "已取消";
  if (value === "action_required") return "需要处理";
  return value || "-";
}
