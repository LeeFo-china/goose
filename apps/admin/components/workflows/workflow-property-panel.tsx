"use client";

import { PanelRight, Settings2, Trash2 } from "lucide-react";
import {
  getWorkflowNodeTypeLabel,
  shouldShowWorkflowNodeTypeBadge,
} from "@/components/workflows/workflow-node-labels";
import { WorkflowNodeConfigFields } from "@/components/workflows/workflow-node-config-fields";
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
      <aside className="flex min-h-0 flex-col border-l bg-background">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">属性配置</h2>
        </div>
        <div className="flex flex-1 items-center justify-center p-6 text-center">
          <div>
            <span className="mx-auto flex size-10 items-center justify-center rounded-md border bg-muted/40">
              <PanelRight className="size-5 text-muted-foreground" />
            </span>
            <div className="mt-3 text-sm font-medium">未选择节点</div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              在画布中选择一个节点后，可以编辑平台节点和说明。
            </p>
          </div>
        </div>
      </aside>
    );
  }
  const currentPreset = getWorkflowNodePreset(node.node_key);

  return (
    <aside className="flex min-h-0 flex-col border-l bg-background">
      <div className="border-b px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Settings2 className="size-4" />
          节点属性
        </div>
        <div className="mt-3 rounded-md border bg-muted/25 p-3">
          <div className="truncate text-sm font-medium">{node.title}</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {shouldShowWorkflowNodeTypeBadge(node.title, node.node_type) ? (
              <Badge variant="outline" className="bg-background">
                {getWorkflowNodeTypeLabel(node.node_type)}
              </Badge>
            ) : null}
            <span className="break-all text-xs text-muted-foreground">{node.node_key}</span>
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
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
          <Label htmlFor="workflow-node-description">说明</Label>
          <Textarea
            id="workflow-node-description"
            value={node.description || ""}
            disabled={disabled}
            maxLength={500}
            onChange={(event) =>
              onChangeNode({
                ...node,
                description: event.target.value || null,
              })
            }
          />
        </div>
        <WorkflowNodeConfigFields
          disabled={disabled}
          node={node}
          onChangeConfig={(config) =>
            onChangeNode({
              ...node,
              config,
            })
          }
        />
      </div>
      <Button
        type="button"
        variant="outline"
        className="m-4 mt-0 justify-start text-destructive hover:text-destructive"
        disabled={disabled}
        onClick={() => onDeleteNode(node.id)}
      >
        <Trash2 data-icon="inline-start" />
        删除节点
      </Button>
    </aside>
  );
}
