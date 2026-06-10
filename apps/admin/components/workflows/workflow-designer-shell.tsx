"use client";

import Link from "next/link";
import { type PointerEvent, useMemo, useState, useTransition } from "react";
import {
  ArrowLeft,
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
import { WorkflowNodeLibrary } from "@/components/workflows/workflow-node-library";
import { getWorkflowNodePreset } from "@/components/workflows/workflow-node-presets";
import { WorkflowPropertyPanel } from "@/components/workflows/workflow-property-panel";
import {
  publishWorkflowDefinition,
  saveWorkflowGraph,
} from "@/components/workflows/workflow-requests";
import { WorkflowRuntimePanel } from "@/components/workflows/workflow-runtime-panel";
import { WorkflowValidationPanel } from "@/components/workflows/workflow-validation-panel";
import type {
  WorkflowDefinitionDetail,
  WorkflowEdge,
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
  const [connectingNodeId, setConnectingNodeId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [validation, setValidation] = useState<WorkflowValidationResult | null>(null);
  const [mobilePanel, setMobilePanel] = useState<DesignerPanel>("canvas");
  const [pending, startTransition] = useTransition();
  const selectedNode = useMemo(
    () => graph?.nodes.find((node) => node.id === selectedNodeId) || null,
    [graph?.nodes, selectedNodeId],
  );

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
    if (connectingNodeId === nodeId) setConnectingNodeId(null);
    setDirty(true);
  }

  function connectToNode(targetNodeId: string) {
    if (!graph || !connectingNodeId || connectingNodeId === targetNodeId) return;
    const duplicate = graph.edges.some((edge) => (
      edge.source_node_id === connectingNodeId &&
      edge.target_node_id === targetNodeId
    ));
    if (duplicate) {
      toast.error("这两个节点之间已经存在连线");
      setConnectingNodeId(null);
      return;
    }

    const now = new Date().toISOString();
    const nextEdge: WorkflowEdge = {
      id: `local-edge-${Date.now()}`,
      tenant_id: graph.definition.tenant_id,
      definition_id: graph.definition.id,
      source_node_id: connectingNodeId,
      target_node_id: targetNodeId,
      label: null,
      condition: { operator: "always" },
      priority: graph.edges.length + 1,
      created_at: now,
      updated_at: now,
    };
    setGraph({ ...graph, edges: [...graph.edges, nextEdge] });
    setConnectingNodeId(null);
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
    setValidation(validateGraph(graph));
  }

  function selectNode(nodeId: string) {
    setSelectedNodeId(nodeId);
  }

  function showNodeLibrary() {
    setSelectedNodeId(null);
    if (mobilePanel === "properties") setMobilePanel("library");
  }

  function handleCanvasPointerDownCapture(event: PointerEvent<HTMLDivElement>) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (!target.closest("[data-workflow-canvas='true']")) return;
    if (target.closest("button, [data-edge-action], [data-node-port]")) return;
    showNodeLibrary();
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
        setConnectingNodeId(null);
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

    startTransition(async () => {
      try {
        const result = await publishWorkflowDefinition(workflowId);
        setGraph({
          definition: result.definition,
          nodes: result.graph.nodes,
          edges: result.graph.edges,
        });
        setDirty(false);
        toast.success("流程已发布");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "发布流程失败");
      }
    });
  }

  if (!graph) {
    return (
      <Card>
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
  const customerMainWorkflow = graph.definition.workflow_key === "customer_main";
  const readiness = publishValidation.valid
    ? { label: "可发布", icon: CheckCircle2, badge: "success" as const }
    : { label: `${publishValidation.issues.length} 项待处理`, icon: CircleAlert, badge: "warning" as const };
  const ReadinessIcon = readiness.icon;

  return (
    <div className="flex flex-col gap-5">
      <div className="overflow-hidden rounded-md border bg-background shadow-sm">
        <div className="border-b bg-[linear-gradient(180deg,hsl(var(--card)),hsl(var(--muted)/0.38))] p-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2 text-muted-foreground">
                <Link href="/workflows">
                  <ArrowLeft data-icon="inline-start" />
                  返回流程列表
                </Link>
              </Button>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-normal">
                  {graph.definition.name}
                </h1>
                <Badge variant={dirty ? "warning" : "secondary"}>
                  {dirty ? "草稿未保存" : "草稿已同步"}
                </Badge>
                <Badge variant={readiness.badge}>
                  <ReadinessIcon className="mr-1 size-3" />
                  {readiness.label}
                </Badge>
              </div>
              <p className="mt-1 max-w-[760px] break-all text-sm text-muted-foreground">
                {graph.definition.workflow_key}
                {customerMainWorkflow
                  ? " · 已接入客户状态流转，关键节点会驱动客户详情页推进。"
                  : " · 编排租户自己的业务、施工、工序和审批流程。"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 xl:justify-end">
              <Button type="button" variant="outline" disabled={pending} onClick={handleValidate}>
                <ShieldCheck data-icon="inline-start" />
                本地校验
              </Button>
              <Button type="button" variant="outline" disabled={pending} onClick={handleSave}>
                <Save data-icon="inline-start" />
                保存草稿
              </Button>
              <Button type="button" disabled={publishDisabled} title={publishTitle} onClick={handlePublish}>
                {pending ? (
                  <Loader2 className="animate-spin" data-icon="inline-start" />
                ) : (
                  <GitBranch data-icon="inline-start" />
                )}
                发布
              </Button>
            </div>
          </div>
        </div>

        {customerMainWorkflow ? (
          <div className="border-b bg-accent/18 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="secondary">客户主流程</Badge>
              <span className="font-medium">关键节点已接入客户状态</span>
              <span className="text-muted-foreground">
                following、arrived、designing、signed 会驱动客户详情页流程推进。
              </span>
            </div>
          </div>
        ) : null}

        <div className="flex min-h-[560px] flex-col overflow-hidden lg:h-[calc(100vh-220px)] lg:min-h-[660px]">
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
              <WorkflowNodeLibrary disabled={pending} onAddNode={addNode} />
            </div>
            <div
              className={mobilePanel === "canvas" ? "h-full min-h-0" : "hidden h-full min-h-0 lg:block"}
              onPointerDownCapture={handleCanvasPointerDownCapture}
            >
              <WorkflowCanvas
                connectingNodeId={connectingNodeId}
                disabled={pending}
                nodes={graph.nodes}
                edges={graph.edges}
                selectedNodeId={selectedNodeId}
                onBeginConnect={setConnectingNodeId}
                onCancelConnect={() => setConnectingNodeId(null)}
                onDeleteEdge={deleteEdge}
                onDropNodePreset={addNode}
                onFinishConnect={connectToNode}
                onMoveNode={moveNode}
                onSelectNode={selectNode}
              />
            </div>
            <div className={mobilePanel === "properties" ? "h-full min-h-0 overflow-hidden" : "hidden h-full min-h-0 overflow-hidden lg:block"}>
              {selectedNode ? (
                <WorkflowPropertyPanel
                  disabled={pending}
                  node={selectedNode}
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
                />
              ) : (
                <WorkflowNodeLibrary
                  disabled={pending}
                  placement="right"
                  onAddNode={addNode}
                />
              )}
            </div>
          </div>
          <WorkflowValidationPanel validation={validation} />
        </div>
      </div>
      <WorkflowRuntimePanel workflowId={workflowId} />
    </div>
  );
}
