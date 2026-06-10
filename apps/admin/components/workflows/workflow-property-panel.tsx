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
import {
  createWorkflowProcedureNodeKey,
  getWorkflowProcedureStageLabel,
  isWorkflowProcedureStageKey,
} from "@/components/workflows/workflow-procedure-stages";
import { getWorkflowPaymentCollectionLabel } from "@/components/workflows/workflow-payment-collection-config-fields";
import type { WorkflowNode, WorkflowNodeConfig } from "@/components/workflows/workflow-types";
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
  "finance",
  "approval",
  "system",
];

export function WorkflowPropertyPanel({
  disabled,
  node,
  usedNodeKeys,
  usedProcedureStageKeys,
  onDeleteNode,
  onChangeNode,
}: {
  disabled?: boolean;
  node: WorkflowNode | null;
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
              在画布中选择一个节点后，可以编辑平台节点和说明。
            </p>
          </div>
        </div>
      </aside>
    );
  }
  const selectedNode = node;
  const selectedPresetKey = selectedNode.node_type === "procedure"
    ? "procedure_template"
    : selectedNode.business_kind === "payment_collection"
      ? "payment_collection"
    : selectedNode.node_key;
  const currentPreset = getWorkflowNodePreset(selectedPresetKey);

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
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Settings2 className="size-4" />
          节点属性
        </div>
        <div className="mt-3 rounded-md border bg-muted/25 p-3">
          <div className="truncate text-sm font-medium">{selectedNode.title}</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {shouldShowWorkflowNodeTypeBadge(selectedNode.title, selectedNode.node_type) ? (
              <Badge variant="outline" className="bg-background">
                {getWorkflowNodeTypeLabel(selectedNode.node_type)}
              </Badge>
            ) : null}
            <span className="break-all text-xs text-muted-foreground">{selectedNode.node_key}</span>
          </div>
        </div>
      </div>
      <div
        data-workflow-property-scroll="true"
        className="min-h-0 flex-1 space-y-4 overflow-auto p-4"
      >
        <div className="grid gap-2">
          <Label htmlFor="workflow-node-preset">平台节点</Label>
          <Select
            disabled={disabled}
            value={selectedPresetKey}
            onValueChange={(value) => {
              const preset = getWorkflowNodePreset(value);
              if (!preset) return;
              onChangeNode(applyWorkflowNodePreset(selectedNode, preset));
            }}
          >
            <SelectTrigger id="workflow-node-preset">
              <SelectValue placeholder="选择平台节点" />
            </SelectTrigger>
            <SelectContent>
              {!currentPreset ? (
                <>
                  <SelectItem value={selectedNode.node_key}>
                    未识别节点：{selectedNode.node_key}
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
                      disabled={
                        preset.nodeType !== "procedure" &&
                        usedNodeKeys.includes(preset.key)
                      }
                    >
                      {preset.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            节点编码：<span className="font-medium text-foreground">{selectedNode.node_key}</span>
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="workflow-node-description">说明</Label>
          <Textarea
            id="workflow-node-description"
            value={selectedNode.description || ""}
            disabled={disabled}
            maxLength={500}
            onChange={(event) =>
              onChangeNode({
                ...selectedNode,
                description: event.target.value || null,
              })
            }
          />
        </div>
        <WorkflowNodeConfigFields
          disabled={disabled}
          node={selectedNode}
          usedProcedureStageKeys={usedProcedureStageKeys}
          onChangeConfig={handleChangeConfig}
        />
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
