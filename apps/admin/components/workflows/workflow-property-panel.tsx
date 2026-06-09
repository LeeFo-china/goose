"use client";

import { WorkflowNodeTypeConfig } from "@gooes/domain";
import { Trash2 } from "lucide-react";
import {
  applyWorkflowNodePreset,
  getWorkflowNodePreset,
  WorkflowNodePresetGroupLabels,
  WorkflowNodePresets,
  type WorkflowNodePresetGroup,
} from "@/components/workflows/workflow-node-presets";
import type { WorkflowNode } from "@/components/workflows/workflow-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const nodePresetGroups: WorkflowNodePresetGroup[] = [
  "control",
  "business",
  "construction",
  "procedure",
  "approval",
  "system",
];

export function WorkflowPropertyPanel({
  disabled,
  node,
  usedNodeKeys,
  onDeleteNode,
  onChangeNode,
}: {
  disabled?: boolean;
  node: WorkflowNode | null;
  usedNodeKeys: string[];
  onDeleteNode: (nodeId: string) => void;
  onChangeNode: (node: WorkflowNode) => void;
}) {
  if (!node) {
    return (
      <aside className="border-l bg-background p-4 text-sm text-muted-foreground">
        选择一个节点后编辑属性。
      </aside>
    );
  }
  const currentPreset = getWorkflowNodePreset(node.node_key);

  return (
    <aside className="flex min-h-0 flex-col gap-4 overflow-auto border-l bg-background p-4">
      <div>
        <h2 className="text-sm font-semibold">节点属性</h2>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge variant="outline">
            {WorkflowNodeTypeConfig[node.node_type]?.label || node.node_type}
          </Badge>
          <span className="break-all text-xs text-muted-foreground">{node.node_key}</span>
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="workflow-node-preset">平台节点</Label>
        <Select
          disabled={disabled}
          value={node.node_key}
          onValueChange={(value) => {
            const preset = getWorkflowNodePreset(value);
            if (!preset) return;
            onChangeNode(applyWorkflowNodePreset(node, preset));
          }}
        >
          <SelectTrigger id="workflow-node-preset">
            <SelectValue placeholder="选择平台节点" />
          </SelectTrigger>
          <SelectContent>
            {!currentPreset ? (
              <>
                <SelectItem value={node.node_key}>
                  未识别节点：{node.node_key}
                </SelectItem>
                <SelectSeparator />
              </>
            ) : null}
            {nodePresetGroups.map((group, groupIndex) => (
              <SelectGroup key={group}>
                {groupIndex > 0 ? <SelectSeparator /> : null}
                <SelectLabel>{WorkflowNodePresetGroupLabels[group]}</SelectLabel>
                {WorkflowNodePresets.filter((preset) => preset.group === group).map((preset) => (
                  <SelectItem
                    key={preset.key}
                    value={preset.key}
                    disabled={usedNodeKeys.includes(preset.key)}
                  >
                    {preset.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          节点编码：<span className="font-medium text-foreground">{node.node_key}</span>
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="workflow-node-title">标题</Label>
        <Input
          id="workflow-node-title"
          value={node.title}
          disabled={disabled}
          maxLength={100}
          onChange={(event) => onChangeNode({ ...node, title: event.target.value })}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="workflow-node-description">说明</Label>
        <Textarea
          id="workflow-node-description"
          value={node.description || ""}
          disabled={disabled}
          maxLength={500}
          onChange={(event) => onChangeNode({
            ...node,
            description: event.target.value || null,
          })}
        />
      </div>
      <div className="rounded-md border bg-muted/30 p-3 text-xs leading-5 text-muted-foreground">
        审批人、工序要求、通知模板等结构化配置会在后续节点配置面板继续细化。
      </div>
      <Button
        type="button"
        variant="outline"
        className="justify-start text-destructive hover:text-destructive"
        disabled={disabled}
        onClick={() => onDeleteNode(node.id)}
      >
        <Trash2 data-icon="inline-start" />
        删除节点
      </Button>
    </aside>
  );
}
