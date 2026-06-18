"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import {
  ArrowLeft,
  Activity,
  CheckCircle2,
  CircleAlert,
  GitBranch,
  Layers3,
  Loader2,
  Network,
  PanelRight,
  Save,
  ShieldCheck,
} from "lucide-react";
import { ConfirmActionDialog } from "@/components/admin/action-dialogs";
import { StatusAlert } from "@/components/admin/status-alert";
import { WorkflowCanvas } from "@/components/workflows/workflow-canvas";
import type { WorkflowValidationResult } from "@/components/workflows/workflow-designer-types";
import {
  createNodeFromPreset,
  detailToGraph,
  toEdgeInput,
  toNodeInput,
  validateGraph,
} from "@/components/workflows/workflow-designer-graph-utils";
import { createWorkflowConnectionEdge } from "@/components/workflows/workflow-connection-edge";
import {
  type WorkflowConnectionSource,
} from "@/components/workflows/workflow-branch-projection";
import {
  getWorkflowRuntimeIntegrationHint,
  getWorkflowTrack,
} from "@/components/workflows/workflow-business-track";
import { WorkflowNodeLibrary } from "@/components/workflows/workflow-node-library";
import { getWorkflowNodePreset } from "@/components/workflows/workflow-node-presets";
import { WorkflowPropertyPanel } from "@/components/workflows/workflow-property-panel";
import {
  publishWorkflowDefinition,
  saveWorkflowGraph,
} from "@/components/workflows/workflow-requests";
import { WorkflowVersionEffectNotice } from "@/components/workflows/workflow-version-effect-notice";
import { WORKFLOW_VERSION_EFFECT_COPY } from "@/components/workflows/workflow-version-semantics";
import { WorkflowValidationPanel } from "@/components/workflows/workflow-validation-panel";
import { useWorkflowValidationPlayback } from "@/components/workflows/workflow-validation-playback";
import type {
  WorkflowDefinitionDetail,
  WorkflowEdgeInput,
  WorkflowNode,
} from "@/components/workflows/workflow-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

type DesignerPanel = "library" | "canvas" | "properties";

const panelOptions: Array<{ value: DesignerPanel; label: string; icon: typeof Layers3 }> = [
  { value: "library", label: "节点库", icon: Layers3 },
  { value: "canvas", label: "画布", icon: Network },
  { value: "properties", label: "属性", icon: PanelRight },
];

export function WorkflowDesignerShell({
  workflowId,
  initialDetail,
  initialError,
}: {
  workflowId: string;
  initialDetail: WorkflowDefinitionDetail | null;
  initialError: string | null;
}) {
  const [graph, setGraph] = useState(
    initialDetail ? detailToGraph(initialDetail) : null,
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [connectingSource, setConnectingSource] = useState<WorkflowConnectionSource | null>(null);
  const [dirty, setDirty] = useState(false);
  const [validation, setValidation] = useState<WorkflowValidationResult | null>(null);
  const [mobilePanel, setMobilePanel] = useState<DesignerPanel>("canvas");
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const { playback, playValidationPlayback } = useWorkflowValidationPlayback(graph);
  const selectedNode = useMemo(
    () => graph?.nodes.find((node) => node.id === selectedNodeId) || null,
    [graph?.nodes, selectedNodeId],
  );
  const connectingNodeId = connectingSource?.nodeId || null;

  function updateNode(nextNode: WorkflowNode) {
    if (!graph) return;
    setGraph({
      ...graph,
      nodes: graph.nodes.map((node) => (
        node.id === nextNode.id ? nextNode : node
      )),
    });
    setDirty(true);
  }

  function addNode(presetKey: string, position?: WorkflowNode["position"]) {
    if (!graph) return;
    const preset = getWorkflowNodePreset(presetKey);
    if (!preset) {
      toast.error("节点不存在");
      return;
    }
    if (
      preset.nodeType !== "procedure" &&
      graph.nodes.some((node) => node.node_key === preset.key)
    ) {
      toast.error(`流程中已经有“${preset.label}”节点`);
      return;
    }
    const nextNode = createNodeFromPreset({
      presetKey: preset.key,
      index: graph.nodes.length + 1,
      definitionId: graph.definition.id,
      tenantId: graph.definition.tenant_id,
      position,
    });
    setGraph({ ...graph, nodes: [...graph.nodes, nextNode] });
    setSelectedNodeId(nextNode.id);
    setMobilePanel("properties");
    setDirty(true);
  }

  function moveNode(nodeId: string, position: WorkflowNode["position"]) {
    if (!graph) return;
    setGraph({
      ...graph,
      nodes: graph.nodes.map((node) => (
        node.id === nodeId ? { ...node, position } : node
      )),
    });
    setDirty(true);
  }

  function arrangeNodes(nodes: WorkflowNode[]) {
    if (!graph) return;
    setGraph({
      ...graph,
      nodes,
    });
    setDirty(true);
    toast.success("画布已整理");
  }

  function deleteNode(nodeId: string) {
    if (!graph) return;
    const nextNodes = graph.nodes.filter((node) => node.id !== nodeId);
    setGraph({
      ...graph,
      nodes: nextNodes,
      edges: graph.edges.filter((edge) => (
        edge.source_node_id !== nodeId && edge.target_node_id !== nodeId
      )),
    });
    setSelectedNodeId(null);
    if (connectingNodeId === nodeId) setConnectingSource(null);
    setDirty(true);
  }

  function connectToNode(source: WorkflowConnectionSource, targetNodeId: string) {
    if (!graph || source.nodeId === targetNodeId) return;
    const result = createWorkflowConnectionEdge({
      graph,
      source,
      targetNodeId,
    });
    if (!result.ok) {
      toast.error(result.message);
      setConnectingSource(null);
      return;
    }

    setGraph({ ...graph, edges: [...graph.edges, result.edge] });
    setConnectingSource(null);
    setDirty(true);
  }

  function deleteEdge(edgeId: string) {
    if (!graph) return;
    setGraph({
      ...graph,
      edges: graph.edges.filter((edge) => edge.id !== edgeId),
    });
    setDirty(true);
  }

  function handleValidate() {
    if (!graph) return;
    const nextValidation = validateGraph(graph);
    setValidation(nextValidation);
    playValidationPlayback(nextValidation);
  }

  function selectNode(nodeId: string) {
    setSelectedNodeId(nodeId);
  }

  function showNodeLibrary() {
    setSelectedNodeId(null);
    if (mobilePanel === "properties") setMobilePanel("library");
  }

  function handleSave() {
    if (!graph) return;
    startTransition(async () => {
      const selectedNodeKey = selectedNode?.node_key || null;
      const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
      const edgeInputs = graph.edges
        .map((edge) => toEdgeInput(edge, nodeById))
        .filter((edge): edge is WorkflowEdgeInput => Boolean(edge));

      try {
        const saved = await saveWorkflowGraph(workflowId, {
          nodes: graph.nodes.map(toNodeInput),
          edges: edgeInputs,
        });
        setGraph({ ...graph, nodes: saved.nodes, edges: saved.edges });
        const nextSelectedNode = saved.nodes.find((node) => (
          node.node_key === selectedNodeKey
        ));
        setSelectedNodeId(selectedNodeKey ? nextSelectedNode?.id || null : null);
        setConnectingSource(null);
        setDirty(false);
        toast.success("流程草稿已保存");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "保存流程草稿失败");
      }
    });
  }

  function handlePublish() {
    if (!graph) return;
    const nextValidation = validateGraph(graph);
    setValidation(nextValidation);
    if (!nextValidation.valid) {
      toast.error("本地校验未通过，暂不能发布");
      return;
    }
    if (dirty) {
      toast.error("请先保存草稿，再发布流程");
      return;
    }

    setPublishConfirmOpen(true);
  }

  function confirmPublish() {
    if (!graph) return;
    startTransition(async () => {
      try {
        const result = await publishWorkflowDefinition(workflowId);
        setGraph({
          definition: result.definition,
          nodes: result.graph.nodes,
          edges: result.graph.edges,
        });
        setDirty(false);
        setPublishConfirmOpen(false);
        toast.success("流程已发布");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "发布流程失败");
      }
    });
  }

  if (!graph) {
    return (
      <Card className="h-full overflow-hidden shadow-none">
        <CardContent className="p-8">
          <StatusAlert>{initialError || "流程不存在"}</StatusAlert>
        </CardContent>
      </Card>
    );
  }

  const publishValidation = validateGraph(graph);
  const publishDisabled = pending || dirty || !publishValidation.valid;
  const publishTitle = dirty
    ? "请先保存草稿"
    : publishValidation.valid
      ? "发布当前已保存流程"
      : "本地校验通过后才能发布";
  const workflowTrack = getWorkflowTrack(graph.definition);
  const integrationHint = getWorkflowRuntimeIntegrationHint(graph.definition);
  const readiness = publishValidation.valid
    ? { label: "可发布", icon: CheckCircle2, badge: "success" as const }
    : { label: `${publishValidation.issues.length} 项待处理`, icon: CircleAlert, badge: "warning" as const };
  const ReadinessIcon = readiness.icon;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border bg-background shadow-sm">
        <header className="shrink-0 border-b bg-card">
          <div className="flex flex-col gap-2 px-3 py-2.5 md:px-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0 space-y-1.5">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <Button asChild variant="ghost" size="sm" className="-ml-2 h-7 shrink-0 px-2 text-muted-foreground">
                  <Link href="/workflows">
                    <ArrowLeft data-icon="inline-start" />
                    <span className="hidden sm:inline">流程列表</span>
                    <span className="sm:hidden">返回</span>
                  </Link>
                </Button>
                <h1 className="min-w-0 truncate text-base font-semibold tracking-normal md:text-lg">
                  {graph.definition.name}
                </h1>
                <Badge variant={dirty ? "warning" : "outline"} className="shrink-0">
                  {dirty ? "草稿未保存" : "已同步"}
                </Badge>
                <Badge variant={readiness.badge} className="shrink-0">
                  <ReadinessIcon className="mr-1 size-3" />
                  {readiness.label}
                </Badge>
              </div>

              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="min-w-0 max-w-[52vw] truncate tabular-nums sm:max-w-none">
                  {graph.definition.workflow_key}
                </span>
                <span className="tabular-nums">节点 {graph.nodes.length}</span>
                <span className="tabular-nums">连线 {graph.edges.length}</span>
                <span className="hidden min-w-0 md:inline">
                  {integrationHint?.headerSummary || "租户业务、施工、工序和审批流程编排"}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 xl:justify-end">
              <Button asChild variant="outline" size="sm" className="h-8 bg-card px-2 sm:px-3">
                <Link href={`/workflows/${workflowId}/runtime`} aria-label="运行实例">
                  <Activity data-icon="inline-start" />
                  <span className="hidden sm:inline">运行实例</span>
                </Link>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 bg-card px-2 sm:px-3"
                aria-label="本地校验"
                disabled={pending}
                onClick={handleValidate}
              >
                <ShieldCheck data-icon="inline-start" />
                <span className="hidden sm:inline">本地校验</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 bg-card px-2 sm:px-3"
                aria-label="保存草稿"
                disabled={pending}
                onClick={handleSave}
              >
                <Save data-icon="inline-start" />
                <span className="hidden sm:inline">保存草稿</span>
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-8 px-2 sm:px-3"
                aria-label="发布"
                disabled={publishDisabled}
                title={publishTitle}
                onClick={handlePublish}
              >
                {pending ? (
                  <Loader2 className="animate-spin" data-icon="inline-start" />
                ) : (
                  <GitBranch data-icon="inline-start" />
                )}
                <span className="hidden sm:inline">发布</span>
              </Button>
            </div>
          </div>
        </header>

        <WorkflowVersionEffectNotice integrationHint={integrationHint} />

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="grid grid-cols-3 gap-2 border-b bg-background p-2 lg:hidden">
            {panelOptions.map((option) => {
              const Icon = option.icon;
              const active = mobilePanel === option.value;
              return (
                <Button
                  key={option.value}
                  type="button"
                  variant={active ? "default" : "outline"}
                  className="h-11"
                  onClick={() => setMobilePanel(option.value)}
                >
                  <Icon data-icon="inline-start" />
                  {option.label}
                </Button>
              );
            })}
          </div>
          <div className="min-h-0 flex-1 bg-muted/20 lg:grid lg:grid-cols-[minmax(0,1fr)_336px]">
            <div className={mobilePanel === "library" ? "h-full min-h-0 overflow-hidden lg:hidden" : "hidden h-full min-h-0"}>
              <WorkflowNodeLibrary
                disabled={pending}
                workflowTrack={workflowTrack}
                onAddNode={addNode}
              />
            </div>
            <div
              className={mobilePanel === "canvas" ? "h-full min-h-0" : "hidden h-full min-h-0 lg:block"}
            >
              <WorkflowCanvas
                connectingNodeId={connectingNodeId}
                disabled={pending}
                nodes={graph.nodes}
                edges={graph.edges}
                selectedNodeId={selectedNodeId}
                onBeginConnect={setConnectingSource}
                onCancelConnect={() => setConnectingSource(null)}
                onDeleteEdge={deleteEdge}
                onDropNodePreset={addNode}
                onFinishConnect={connectToNode}
                onArrangeNodes={arrangeNodes}
                onMoveNode={moveNode}
                onOpenNodeLibrary={showNodeLibrary}
                onSelectNode={selectNode}
                validationPlayback={playback}
                viewStorageKey={`workflow-canvas:${workflowId}:zoom`}
              />
            </div>
            <div className={mobilePanel === "properties" ? "h-full min-h-0 overflow-hidden" : "hidden h-full min-h-0 overflow-hidden lg:block"}>
              {selectedNode ? (
                <WorkflowPropertyPanel
                  disabled={pending}
                  edges={graph.edges}
                  node={selectedNode}
                  nodes={graph.nodes}
                  usedNodeKeys={graph.nodes
                    .filter((node) => node.id !== selectedNode.id)
                    .map((node) => node.node_key)}
                  usedProcedureStageKeys={graph.nodes
                    .flatMap((node) => {
                      if (
                        node.id === selectedNode.id ||
                        node.node_type !== "procedure" ||
                        !("stage_key" in node.config) ||
                        typeof node.config.stage_key !== "string"
                      ) {
                        return [];
                      }
                      return [node.config.stage_key];
                    })}
                  onDeleteNode={deleteNode}
                  onChangeNode={updateNode}
                  workflowTrack={workflowTrack}
                />
              ) : (
                <WorkflowNodeLibrary
                  disabled={pending}
                  placement="right"
                  workflowTrack={workflowTrack}
                  onAddNode={addNode}
                />
              )}
            </div>
          </div>
          <WorkflowValidationPanel validation={validation} />
        </div>
      </div>
      <ConfirmActionDialog
        open={publishConfirmOpen}
        onOpenChange={setPublishConfirmOpen}
        title="发布新流程版本"
        description={WORKFLOW_VERSION_EFFECT_COPY.publishConfirm}
        confirmLabel="确认发布"
        pending={pending}
        onConfirm={confirmPublish}
      />
    </div>
  );
}
