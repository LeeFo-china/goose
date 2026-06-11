"use client";

import { GitBranch, Trash2 } from "lucide-react";
import {
  getWorkflowEdgeConditionOption,
  WORKFLOW_EDGE_CONDITION_OPTIONS,
  type WorkflowEdgeConditionOptionKey,
} from "@/components/workflows/workflow-edge-conditions";
import type { WorkflowEdge, WorkflowNode } from "@/components/workflows/workflow-types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function WorkflowEdgePropertyPanel({
  disabled,
  edge,
  nodes,
  onChangeEdge,
  onDeleteEdge,
}: {
  disabled?: boolean;
  edge: WorkflowEdge;
  nodes: WorkflowNode[];
  onChangeEdge: (edge: WorkflowEdge) => void;
  onDeleteEdge: (edgeId: string) => void;
}) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const sourceNode = nodeById.get(edge.source_node_id);
  const targetNode = nodeById.get(edge.target_node_id);
  const selectedCondition = getWorkflowEdgeConditionOption(edge.condition);

  function handleConditionChange(value: WorkflowEdgeConditionOptionKey) {
    const option = WORKFLOW_EDGE_CONDITION_OPTIONS.find((item) => item.value === value);
    if (!option) return;
    onChangeEdge({
      ...edge,
      label: option.edgeLabel,
      condition: option.condition,
    });
  }

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden border-l bg-background">
      <div className="shrink-0 border-b px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <GitBranch className="size-4 text-muted-foreground" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">连线属性</h2>
            <div className="mt-1 truncate text-xs text-muted-foreground">
              {sourceNode?.title || "来源节点"} → {targetNode?.title || "目标节点"}
            </div>
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-auto px-4 py-3">
        <div className="grid gap-2">
          <Label htmlFor="workflow-edge-condition">分支条件</Label>
          <Select
            disabled={disabled}
            value={selectedCondition.value}
            onValueChange={(value) =>
              handleConditionChange(value as WorkflowEdgeConditionOptionKey)
            }
          >
            <SelectTrigger id="workflow-edge-condition" aria-label="分支条件">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WORKFLOW_EDGE_CONDITION_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        className="m-4 mt-0 shrink-0 justify-start text-destructive hover:text-destructive"
        disabled={disabled}
        onClick={() => onDeleteEdge(edge.id)}
      >
        <Trash2 data-icon="inline-start" />
        删除连线
      </Button>
    </aside>
  );
}
