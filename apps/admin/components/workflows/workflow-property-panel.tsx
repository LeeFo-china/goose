"use client";

import {
  WORKFLOW_NODE_TYPE_VALUES,
  WorkflowNodeTypeConfig,
  type WorkflowNodeType,
} from "@gooes/domain";
import type { WorkflowNode } from "@/components/workflows/workflow-types";
import { Input } from "@/components/ui/input";
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
  node,
  onChangeNode,
}: {
  node: WorkflowNode | null;
  onChangeNode: (node: WorkflowNode) => void;
}) {
  if (!node) {
    return (
      <aside className="border-l bg-background p-4 text-sm text-muted-foreground">
        选择一个节点后编辑属性。
      </aside>
    );
  }

  return (
    <aside className="flex min-h-0 flex-col gap-4 overflow-auto border-l bg-background p-4">
      <div>
        <h2 className="text-sm font-semibold">节点属性</h2>
        <p className="mt-1 break-all text-xs text-muted-foreground">
          {node.node_key}
        </p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="workflow-node-title">标题</Label>
        <Input
          id="workflow-node-title"
          value={node.title}
          maxLength={100}
          onChange={(event) => onChangeNode({ ...node, title: event.target.value })}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="workflow-node-type">节点类型</Label>
        <Select
          value={node.node_type}
          onValueChange={(value) => onChangeNode({
            ...node,
            node_type: value as WorkflowNodeType,
          })}
        >
          <SelectTrigger id="workflow-node-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {WORKFLOW_NODE_TYPE_VALUES.map((type) => (
              <SelectItem key={type} value={type}>
                {WorkflowNodeTypeConfig[type].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="workflow-node-description">说明</Label>
        <Textarea
          id="workflow-node-description"
          value={node.description || ""}
          maxLength={500}
          onChange={(event) => onChangeNode({
            ...node,
            description: event.target.value || null,
          })}
        />
      </div>
      <div className="rounded-md border bg-muted/30 p-3 text-xs leading-5 text-muted-foreground">
        当前任务先开放公共属性。审批人、工序要求、通知模板等结构化配置会在画布交互任务中继续细化。
      </div>
    </aside>
  );
}
