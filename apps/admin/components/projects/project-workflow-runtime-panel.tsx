"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Activity, Loader2, RefreshCw } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  completeWorkflowRuntimeNode,
  fetchWorkflowDefinitions,
  fetchWorkflowRuntimeInstances,
  startWorkflowRuntimeInstance,
} from "@/components/workflows/workflow-requests";
import {
  getWorkflowPaymentGate,
  ProjectWorkflowPaymentGate,
} from "@/components/projects/project-workflow-payment-gate";
import type {
  WorkflowDefinition,
  WorkflowRuntimeInstance,
} from "@/components/workflows/workflow-types";
import type { ProjectRecord } from "@/components/projects/project-mutation-types";
import { formatDateTime } from "@/components/projects/project-mutation-utils";

const statusLabels: Record<WorkflowRuntimeInstance["status"], string> = {
  running: "运行中",
  completed: "已完成",
  canceled: "已取消",
  failed: "异常",
};

const statusVariants: Record<
  WorkflowRuntimeInstance["status"],
  "default" | "secondary" | "outline" | "danger"
> = {
  running: "default",
  completed: "secondary",
  canceled: "outline",
  failed: "danger",
};

function pickProjectWorkflow(workflows: WorkflowDefinition[]) {
  return workflows.find((workflow) => workflow.category === "construction") ||
    workflows.find((workflow) => workflow.category === "main") ||
    null;
}

function currentNodeTitle(instance: WorkflowRuntimeInstance | null) {
  const snapshot = instance?.current_node_snapshot;
  const title = snapshot && typeof snapshot.title === "string"
    ? snapshot.title.trim()
    : "";
  return title || instance?.current_node_key || "-";
}

export function ProjectWorkflowRuntimePanel({
  active = true,
  project,
}: {
  active?: boolean;
  project: ProjectRecord;
}) {
  const [workflow, setWorkflow] = useState<WorkflowDefinition | null>(null);
  const [instance, setInstance] = useState<WorkflowRuntimeInstance | null>(null);
  const [totalInstances, setTotalInstances] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const canComplete = Boolean(
    workflow?.id &&
      instance?.id &&
      instance.status === "running" &&
      instance.current_node_key,
  );
  const paymentGate = useMemo(() => getWorkflowPaymentGate(instance), [instance]);

  const actionLabel = useMemo(() => {
    if (!instance) return "启动项目流程";
    if (instance.status === "running" && instance.current_node_key === "start") {
      return "进入下一节点";
    }
    if (instance.status === "running") return "完成当前节点";
    return "重新加载";
  }, [instance]);

  function loadRuntime() {
    startTransition(async () => {
      try {
        setError("");
        const constructionWorkflows = await fetchWorkflowDefinitions({
          page: 1,
          pageSize: 20,
          status: "active",
          category: "construction",
        });
        const mainWorkflows = constructionWorkflows.list.length > 0
          ? null
          : await fetchWorkflowDefinitions({
            page: 1,
            pageSize: 20,
            status: "active",
            category: "main",
          });
        const selectedWorkflow = pickProjectWorkflow([
          ...constructionWorkflows.list,
          ...(mainWorkflows?.list || []),
        ]);
        setWorkflow(selectedWorkflow);
        if (!selectedWorkflow) {
          setInstance(null);
          setTotalInstances(0);
          setLoaded(true);
          return;
        }

        const runtime = await fetchWorkflowRuntimeInstances(selectedWorkflow.id, {
          page: 1,
          pageSize: 1,
          subject_type: "project",
          subject_id: project.id,
        });
        setInstance(runtime.list[0] || null);
        setTotalInstances(runtime.pagination.total);
        setLoaded(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "项目流程加载失败");
        setLoaded(true);
      }
    });
  }

  function startRuntime() {
    if (!workflow) return;
    startTransition(async () => {
      try {
        setError("");
        await startWorkflowRuntimeInstance(workflow.id, {
          subject_type: "project",
          subject_id: project.id,
          context: {
            project_id: project.id,
            project_name: project.name,
            project_status: project.status,
            customer_id: project.customer_id ?? null,
          },
        });
        loadRuntime();
      } catch (err) {
        setError(err instanceof Error ? err.message : "启动项目流程失败");
      }
    });
  }

  function completeCurrentNode() {
    if (!workflow || !instance?.id || !instance.current_node_key) return;
    startTransition(async () => {
      try {
        setError("");
        await completeWorkflowRuntimeNode(workflow.id, instance.id, {
          node_key: instance.current_node_key || "",
          action: "complete",
          output: {
            project_id: project.id,
            project_status: project.status,
          },
        });
        loadRuntime();
      } catch (err) {
        setError(err instanceof Error ? err.message : "推进项目流程失败");
      }
    });
  }

  useEffect(() => {
    if (!active) return;
    loadRuntime();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, project.id]);

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex size-9 items-center justify-center rounded-md border bg-background">
              <Activity className="size-4" />
            </span>
            <div>
              <CardTitle>项目流程</CardTitle>
              <CardDescription className="mt-2">
                按已发布的项目主流程启动和推进当前项目。
              </CardDescription>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={loadRuntime}
            disabled={pending}
            aria-label="刷新项目流程"
          >
            <RefreshCw className={pending ? "animate-spin" : ""} />
          </Button>
        </div>
        {error ? <StatusAlert>{error}</StatusAlert> : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!loaded && pending ? (
          <div className="rounded-md border bg-background p-3 text-sm text-muted-foreground">
            <Loader2 className="mr-2 inline size-4 animate-spin" />
            项目流程加载中
          </div>
        ) : !workflow ? (
          <div className="rounded-md border bg-background p-3 text-sm text-muted-foreground">
            暂无已发布的项目流程。请先在流程编排中发布施工或主流程。
          </div>
        ) : (
          <>
            <div className="grid gap-3 rounded-md border bg-background p-3 text-sm md:grid-cols-3">
              <div>
                <div className="text-xs text-muted-foreground">流程</div>
                <div className="mt-1 font-medium">{workflow.name}</div>
                <div className="mt-1 break-all text-xs text-muted-foreground">
                  {workflow.workflow_key}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">状态</div>
                <div className="mt-1">
                  {instance ? (
                    <Badge variant={statusVariants[instance.status]}>
                      {statusLabels[instance.status]}
                    </Badge>
                  ) : (
                    <Badge variant="outline">未启动</Badge>
                  )}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  共 {totalInstances} 条实例
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">当前节点</div>
                <div className="mt-1 font-medium">{currentNodeTitle(instance)}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {instance ? formatDateTime(instance.updated_at) : "等待启动"}
                </div>
              </div>
            </div>
            {paymentGate ? (
              <ProjectWorkflowPaymentGate
                disabled={pending}
                gate={paymentGate}
                project={project}
                onChanged={loadRuntime}
              />
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              {!instance ? (
                <Button type="button" size="sm" disabled={pending} onClick={startRuntime}>
                  {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
                  {actionLabel}
                </Button>
              ) : instance.status === "running" ? (
                <Button
                  type="button"
                  size="sm"
                  disabled={pending || !canComplete}
                  onClick={completeCurrentNode}
                >
                  {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
                  {actionLabel}
                </Button>
              ) : (
                <Button type="button" size="sm" variant="outline" disabled={pending} onClick={loadRuntime}>
                  {actionLabel}
                </Button>
              )}
              {instance?.id ? (
                <span className="text-xs text-muted-foreground">
                  实例 {instance.id.slice(0, 8)}
                </span>
              ) : null}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
