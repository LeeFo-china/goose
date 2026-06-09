"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import type { WorkflowNodeType } from "@gooes/domain";
import { ArrowLeft, GitBranch, Loader2, Save, ShieldCheck } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { WorkflowCanvas } from "@/components/workflows/workflow-canvas";
import type {
  WorkflowDesignerGraph,
  WorkflowValidationResult,
} from "@/components/workflows/workflow-designer-types";
import { WorkflowNodeLibrary } from "@/components/workflows/workflow-node-library";
import { WorkflowPropertyPanel } from "@/components/workflows/workflow-property-panel";
import {
  publishWorkflowDefinition,
  saveWorkflowGraph,
} from "@/components/workflows/workflow-requests";
import { WorkflowValidationPanel } from "@/components/workflows/workflow-validation-panel";
import type {
  WorkflowDefinitionDetail,
  WorkflowEdge,
  WorkflowEdgeInput,
  WorkflowNode,
  WorkflowNodeConfig,
  WorkflowNodeInput,
} from "@/components/workflows/workflow-types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

function detailToGraph(detail: WorkflowDefinitionDetail): WorkflowDesignerGraph {
  return {
    definition: detail.definition,
    nodes: detail.draftGraph?.nodes || [],
    edges: detail.draftGraph?.edges || [],
  };
}

function defaultConfig(nodeType: WorkflowNodeType): WorkflowNodeConfig {
  if (nodeType === "procedure") {
    return {
      stage_key: "default_stage",
      require_log: false,
      min_image_count: 0,
      trigger_acceptance: false,
      customer_visible: false,
    };
  }
  if (nodeType === "notification") {
    return {
      channels: ["todo"],
      recipient_rule: "owner",
      template: "请处理流程节点",
    };
  }
  return {};
}

function createNode(
  nodeType: WorkflowNodeType,
  index: number,
  definitionId: string,
  tenantId: string,
): WorkflowNode {
  const nodeKey = `${nodeType}_${index}`;
  const now = new Date().toISOString();

  return {
    id: `local-${Date.now()}-${index}`,
    tenant_id: tenantId,
    definition_id: definitionId,
    node_key: nodeKey,
    node_type: nodeType,
    business_kind: null,
    title: "新节点",
    description: null,
    position: { x: 120 + index * 220, y: 240 },
    config: defaultConfig(nodeType),
    sort_order: index * 10,
    created_at: now,
    updated_at: now,
  };
}

function toNodeInput(node: WorkflowNode): WorkflowNodeInput {
  return {
    id: node.id.startsWith("local-") ? undefined : node.id,
    node_key: node.node_key,
    node_type: node.node_type,
    business_kind: node.business_kind,
    title: node.title,
    description: node.description,
    position: node.position,
    config: node.config,
    sort_order: node.sort_order,
  };
}

function toEdgeInput(
  edge: WorkflowEdge,
  nodeById: Map<string, WorkflowNode>,
): WorkflowEdgeInput | null {
  const source = nodeById.get(edge.source_node_id);
  const target = nodeById.get(edge.target_node_id);
  if (!source || !target) return null;

  const input: WorkflowEdgeInput = {
    source_node_key: source.node_key,
    target_node_key: target.node_key,
    label: edge.label,
    condition: edge.condition,
    priority: edge.priority,
  };

  return edge.id.startsWith("local-") ? input : { ...input, id: edge.id };
}

function validateGraph(graph: WorkflowDesignerGraph): WorkflowValidationResult {
  const issues: WorkflowValidationResult["issues"] = [];
  const nodeKeys = new Set<string>();
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const outgoingNodeIds = new Set(graph.edges.map((edge) => edge.source_node_id));

  graph.nodes.forEach((node) => {
    if (!node.node_key.trim()) {
      issues.push({ code: "node_key_required", message: "节点编码不能为空" });
    }
    if (nodeKeys.has(node.node_key)) {
      issues.push({
        code: "node_key_duplicate",
        message: "节点编码重复",
        nodeKey: node.node_key,
      });
    }
    nodeKeys.add(node.node_key);
    if (!node.title.trim()) {
      issues.push({
        code: "node_title_required",
        message: "节点标题不能为空",
        nodeKey: node.node_key,
      });
    }
  });

  if (!graph.nodes.some((node) => node.node_type === "start")) {
    issues.push({ code: "start_required", message: "发布前需要一个开始节点" });
  }
  if (!graph.nodes.some((node) => node.node_type === "end")) {
    issues.push({ code: "end_required", message: "发布前需要一个结束节点" });
  }
  graph.edges.forEach((edge) => {
    if (!nodeIds.has(edge.source_node_id)) {
      issues.push({ code: "edge_source_missing", message: "连线来源节点不存在" });
    }
    if (!nodeIds.has(edge.target_node_id)) {
      issues.push({ code: "edge_target_missing", message: "连线目标节点不存在" });
    }
    if (edge.source_node_id === edge.target_node_id) {
      issues.push({ code: "edge_self_loop", message: "连线不能指向自身" });
    }
  });
  graph.nodes.forEach((node) => {
    if (node.node_type !== "end" && !outgoingNodeIds.has(node.id)) {
      issues.push({
        code: "node_outgoing_required",
        message: "非结束节点需要至少一条出边",
        nodeKey: node.node_key,
      });
    }
  });

  return { valid: issues.length === 0, issues };
}

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
  const [selectedNodeKey, setSelectedNodeKey] = useState(
    graph?.nodes[0]?.node_key || null,
  );
  const [dirty, setDirty] = useState(false);
  const [validation, setValidation] = useState<WorkflowValidationResult | null>(null);
  const [pending, startTransition] = useTransition();
  const selectedNode = useMemo(
    () => graph?.nodes.find((node) => node.node_key === selectedNodeKey) || null,
    [graph?.nodes, selectedNodeKey],
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

  function addNode(nodeType: WorkflowNodeType) {
    if (!graph) return;
    const nextNode = createNode(
      nodeType,
      graph.nodes.length + 1,
      graph.definition.id,
      graph.definition.tenant_id,
    );
    setGraph({ ...graph, nodes: [...graph.nodes, nextNode] });
    setSelectedNodeKey(nextNode.node_key);
    setDirty(true);
  }

  function handleValidate() {
    if (!graph) return;
    setValidation(validateGraph(graph));
  }

  function handleSave() {
    if (!graph) return;
    startTransition(async () => {
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
        setSelectedNodeKey(saved.nodes[0]?.node_key || null);
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

  return (
    <div className="flex h-[calc(100vh-104px)] min-h-[760px] flex-col overflow-hidden rounded-md border bg-background">
      <div className="flex flex-col gap-3 border-b p-3 md:flex-row md:items-center md:justify-between">
        <div>
          <Button asChild variant="ghost" className="mb-1 px-0">
            <Link href="/workflows">
              <ArrowLeft data-icon="inline-start" />
              返回流程列表
            </Link>
          </Button>
          <h1 className="text-xl font-semibold tracking-normal">
            {graph.definition.name}
          </h1>
          <p className="mt-1 break-all text-xs text-muted-foreground">
            {graph.definition.workflow_key}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={handleValidate}
          >
            <ShieldCheck data-icon="inline-start" />
            本地校验
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={handleSave}
          >
            <Save data-icon="inline-start" />
            保存草稿
          </Button>
          <Button
            type="button"
            disabled={publishDisabled}
            title={publishTitle}
            onClick={handlePublish}
          >
            {pending ? (
              <Loader2 className="animate-spin" data-icon="inline-start" />
            ) : (
              <GitBranch data-icon="inline-start" />
            )}
            发布
          </Button>
          <p className="basis-full text-xs text-muted-foreground">
            发布前需要保存草稿，并通过开始/结束节点、连线引用和出边校验。
          </p>
        </div>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)_300px]">
        <WorkflowNodeLibrary disabled={pending} onAddNode={addNode} />
        <WorkflowCanvas
          disabled={pending}
          nodes={graph.nodes}
          edges={graph.edges}
          selectedNodeKey={selectedNodeKey}
          onSelectNode={setSelectedNodeKey}
        />
        <WorkflowPropertyPanel
          disabled={pending}
          node={selectedNode}
          onChangeNode={updateNode}
        />
      </div>
      <WorkflowValidationPanel validation={validation} />
    </div>
  );
}
