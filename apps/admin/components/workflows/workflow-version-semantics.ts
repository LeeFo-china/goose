import type { WorkflowRuntimeInstance } from "./workflow-types";

export const WORKFLOW_VERSION_EFFECT_COPY = {
  noticeTitle: "流程模板版本说明",
  noticeDescription:
    "你正在编辑流程模板。发布后只影响新创建或受控重建的实例，已运行实例仍按启动时的版本继续执行。",
  publishConfirm:
    "本次发布将生成新的流程版本，只影响新创建或受控重建的实例；当前运行中的实例仍使用原版本，不会自动变更。确认发布吗？",
  runtimeDescription:
    "实例按启动时绑定的发布版本执行；若实例版本不是当前版本，需要受控重建后才会使用最新模板。",
  versionPanelTitle: "发布版本",
  versionPanelDescription:
    "展开查看当前流程的发布版本，active 版本用于新实例，历史版本显示仍在运行中的实例数量。",
} as const;

export type WorkflowRuntimeVersionState = {
  label: string;
  variant: "outline" | "success" | "warning";
  stale: boolean;
};

export function getWorkflowRuntimeVersionState(input: {
  activeVersionId?: string | null;
  instanceVersionId: string | null;
  status: WorkflowRuntimeInstance["status"];
}): WorkflowRuntimeVersionState {
  if (!input.activeVersionId) {
    return {
      label: "未绑定当前版本",
      variant: "outline",
      stale: false,
    };
  }

  if (input.instanceVersionId === input.activeVersionId) {
    return {
      label: "当前版本",
      variant: "success",
      stale: false,
    };
  }

  if (input.status === "running") {
    return {
      label: "旧版本",
      variant: "warning",
      stale: true,
    };
  }

  return {
    label: "历史版本",
    variant: "outline",
    stale: false,
  };
}
