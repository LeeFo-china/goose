"use client";

import { PanelRight, Settings2, Trash2 } from "lucide-react";
import { WorkflowNodeConfigFields } from "@/components/workflows/workflow-node-config-fields";
import {
  applyWorkflowBusinessKind,
  applyWorkflowNodeCapability,
  getWorkflowBusinessFlowOption,
  getWorkflowNodeCapability,
  getWorkflowNodeDisplayLabels,
  isWorkflowControlNode,
  WORKFLOW_BUSINESS_FLOW_OPTIONS,
  WORKFLOW_NODE_CAPABILITY_OPTIONS,
  type WorkflowNodeCapability,
} from "@/components/workflows/workflow-node-capabilities";
import {
  createWorkflowProcedureNodeKey,
  getWorkflowProcedureStageLabel,
  isWorkflowProcedureStageKey,
} from "@/components/workflows/workflow-procedure-stages";
import { getWorkflowPaymentCollectionLabel } from "@/components/workflows/workflow-payment-collection-config-fields";
import type {
  WorkflowEdge,
  WorkflowNode,
  WorkflowNodeConfig,
} from "@/components/workflows/workflow-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export function WorkflowPropertyPanel({
  disabled,
  edges,
  node,
  nodes,
  usedNodeKeys,
  usedProcedureStageKeys,
  onDeleteNode,
  onChangeNode,
}: {
  disabled?: boolean;
  edges: WorkflowEdge[];
  node: WorkflowNode | null;
  nodes: WorkflowNode[];
  usedNodeKeys: string[];
  usedProcedureStageKeys?: string[];
  onDeleteNode: (nodeId: string) => void;
  onChangeNode: (node: WorkflowNode) => void;
}) {
  if (!node) {
    return (
      <aside className="flex h-full min-h-0 flex-col overflow-hidden border-l bg-background">
        <div className="shrink-0 border-b px-4 py-3">
          <h2 className="text-sm font-semibold">属性配置</h2>
        </div>
        <div className="flex flex-1 items-center justify-center p-6 text-center">
          <div>
            <span className="mx-auto flex size-10 items-center justify-center rounded-md border bg-muted/40">
              <PanelRight className="size-5 text-muted-foreground" />
            </span>
            <div className="mt-3 text-sm font-medium">未选择节点</div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              在画布中选择一个节点后，可以编辑节点能力和说明。
            </p>
          </div>
        </div>
      </aside>
    );
  }
  const selectedNode = node;
  const isControlNode = isWorkflowControlNode(selectedNode);
  const selectedCapability = getWorkflowNodeCapability(selectedNode);
  const displayLabels = getWorkflowNodeDisplayLabels(selectedNode);
  const selectedBusinessOption = getWorkflowBusinessFlowOption(
    selectedNode.business_kind,
  );
  const rollbackTargetNodes = getRollbackTargetNodes({
    currentNode: selectedNode,
    edges,
    nodes,
  });

  function handleChangeConfig(config: WorkflowNodeConfig) {
    if (
      selectedNode.node_type === "procedure" &&
      "stage_key" in config &&
      isWorkflowProcedureStageKey(config.stage_key)
    ) {
      const title =
        getWorkflowProcedureStageLabel(config.stage_key) || selectedNode.title;
      onChangeNode({
        ...selectedNode,
        node_key: createWorkflowProcedureNodeKey(config.stage_key),
        title,
        config,
      });
      return;
    }

    if (
      selectedNode.business_kind === "payment_collection" &&
      "payment_type" in config
    ) {
      const title =
        getWorkflowPaymentCollectionLabel(config.payment_type) ||
        selectedNode.title;
      onChangeNode({
        ...selectedNode,
        title,
        config,
      });
      return;
    }

    onChangeNode({
      ...selectedNode,
      config,
    });
  }

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden border-l bg-background">
      <div className="shrink-0 border-b px-4 py-3">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Settings2 className="size-3.5" />
              节点属性
            </div>
            <div className="mt-1 truncate text-sm font-semibold">
              {displayLabels.specificLabel}
            </div>
          </div>
          <Badge variant="outline" className="shrink-0 bg-background">
            {displayLabels.capabilityLabel}
          </Badge>
        </div>
      </div>
      <div
        data-workflow-property-scroll="true"
        className="min-h-0 flex-1 space-y-4 overflow-auto px-4 py-3"
      >
        <div className="grid gap-2">
          <Label htmlFor="workflow-node-capability">
            {isControlNode ? "控制节点" : "节点能力"}
          </Label>
          {isControlNode ? (
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
              {displayLabels.specificLabel}
            </div>
          ) : (
            <Select
              disabled={disabled}
              value={selectedCapability}
              onValueChange={(value) =>
                onChangeNode(
                  applyWorkflowNodeCapability({
                    node: selectedNode,
                    capability: value as WorkflowNodeCapability,
                    usedNodeKeys,
                  }),
                )
              }
            >
              <SelectTrigger id="workflow-node-capability">
                <SelectValue placeholder="选择节点能力" />
              </SelectTrigger>
              <SelectContent>
                {WORKFLOW_NODE_CAPABILITY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        {!isControlNode && selectedCapability === "business" ? (
          <div className="grid gap-2">
            <Label htmlFor="workflow-node-business-kind">业务类型</Label>
            <Select
              disabled={disabled}
              value={selectedBusinessOption?.value ?? "customer_lead"}
              onValueChange={(value) =>
                onChangeNode(
                  applyWorkflowBusinessKind({
                    node: selectedNode,
                    businessKind: value as typeof WORKFLOW_BUSINESS_FLOW_OPTIONS[number]["value"],
                    usedNodeKeys,
                  }),
                )
              }
            >
              <SelectTrigger id="workflow-node-business-kind">
                <SelectValue placeholder="选择业务类型" />
              </SelectTrigger>
              <SelectContent>
                {WORKFLOW_BUSINESS_FLOW_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <WorkflowNodeConfigFields
          disabled={disabled}
          node={selectedNode}
          rollbackTargetNodes={rollbackTargetNodes}
          usedProcedureStageKeys={usedProcedureStageKeys}
          onChangeConfig={handleChangeConfig}
        />
        <div className="grid gap-2">
          <Textarea
            id="workflow-node-description"
            aria-label="节点说明"
            value={selectedNode.description || ""}
            disabled={disabled}
            maxLength={500}
            placeholder="节点说明"
            onChange={(event) =>
              onChangeNode({
                ...selectedNode,
                description: event.target.value || null,
              })
            }
          />
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        className="m-4 mt-0 shrink-0 justify-start text-destructive hover:text-destructive"
        disabled={disabled}
        onClick={() => onDeleteNode(selectedNode.id)}
      >
        <Trash2 data-icon="inline-start" />
        删除节点
      </Button>
    </aside>
  );
}

function getRollbackTargetNodes({
  currentNode,
  edges,
  nodes,
}: {
  currentNode: WorkflowNode;
  edges: WorkflowEdge[];
  nodes: WorkflowNode[];
}) {
  const nodesById = new Map(nodes.map((item) => [item.id, item]));
  const incomingByTargetId = new Map<string, WorkflowEdge[]>();
  for (const edge of edges) {
    const incomingEdges = incomingByTargetId.get(edge.target_node_id) || [];
    incomingEdges.push(edge);
    incomingByTargetId.set(edge.target_node_id, incomingEdges);
  }

  const result: WorkflowNode[] = [];
  const visitedNodeIds = new Set<string>([currentNode.id]);
  const queue = [currentNode.id];

  while (queue.length > 0) {
    const targetNodeId = queue.shift();
    if (!targetNodeId) continue;

    for (const edge of incomingByTargetId.get(targetNodeId) || []) {
      if (visitedNodeIds.has(edge.source_node_id)) continue;
      visitedNodeIds.add(edge.source_node_id);
      const sourceNode = nodesById.get(edge.source_node_id);
      if (!sourceNode) continue;
      result.push(sourceNode);
      queue.push(sourceNode.id);
    }
  }

  const orderByNodeId = new Map(nodes.map((item, index) => [item.id, index]));
  return result.sort((left, right) =>
    (orderByNodeId.get(right.id) ?? 0) - (orderByNodeId.get(left.id) ?? 0)
  );
}
