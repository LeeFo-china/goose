"use client";

import type {
  WorkflowApprovalNodeConfig,
  WorkflowBaseNodeConfig,
  WorkflowNode,
  WorkflowNodeConfig,
  WorkflowNotificationNodeConfig,
  WorkflowProcedureNodeConfig,
} from "@/components/workflows/workflow-types";
import { Checkbox } from "@/components/ui/checkbox";
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

const NODE_CHANNEL_OPTIONS = [
  { value: "todo", label: "待办" },
  { value: "mini_program", label: "小程序" },
  { value: "sms", label: "短信" },
] as const;

const ASSIGNEE_RULE_OPTIONS = [
  { value: "employee", label: "指定员工" },
  { value: "department", label: "指定部门" },
  { value: "role", label: "指定角色" },
] as const;

const APPROVE_MODE_OPTIONS = [
  { value: "any", label: "任一人通过" },
  { value: "all", label: "全部通过" },
] as const;

const RECIPIENT_RULE_OPTIONS = [
  { value: "owner", label: "业务负责人" },
  { value: "assignee", label: "当前处理人" },
  { value: "customer", label: "客户" },
  { value: "role", label: "指定角色" },
] as const;

type NodeConfigChangeHandler = (config: WorkflowNodeConfig) => void;

export function WorkflowNodeConfigFields({
  disabled,
  node,
  onChangeConfig,
}: {
  disabled?: boolean;
  node: WorkflowNode;
  onChangeConfig: NodeConfigChangeHandler;
}) {
  function updateConfig(patch: Partial<WorkflowNodeConfig>) {
    onChangeConfig({
      ...node.config,
      ...patch,
    });
  }

  return (
    <div className="space-y-5">
      <CommonConfigFields
        config={node.config}
        disabled={disabled}
        onChangeConfig={updateConfig}
      />
      {node.node_type === "procedure" ? (
        <ProcedureConfigFields
          config={node.config}
          disabled={disabled}
          onChangeConfig={updateConfig}
        />
      ) : null}
      {node.node_type === "approval" ? (
        <ApprovalConfigFields
          config={node.config}
          disabled={disabled}
          onChangeConfig={updateConfig}
        />
      ) : null}
      {node.node_type === "notification" ? (
        <NotificationConfigFields
          config={node.config}
          disabled={disabled}
          onChangeConfig={updateConfig}
        />
      ) : null}
    </div>
  );
}

function CommonConfigFields({
  config,
  disabled,
  onChangeConfig,
}: {
  config: WorkflowNodeConfig;
  disabled?: boolean;
  onChangeConfig: (patch: Partial<WorkflowBaseNodeConfig>) => void;
}) {
  const permissions = Array.isArray(config.required_permissions)
    ? config.required_permissions.join("\n")
    : "";

  return (
    <section className="space-y-3">
      <div>
        <div className="text-sm font-medium">通用规则</div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          控制节点权限、超时和回退目标。
        </p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="workflow-node-permissions">所需权限</Label>
        <Textarea
          id="workflow-node-permissions"
          value={permissions}
          disabled={disabled}
          placeholder="每行一个权限编码，例如 project.manage"
          onChange={(event) =>
            onChangeConfig({
              required_permissions: splitListInput(event.target.value),
            })
          }
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label htmlFor="workflow-node-timeout">超时小时</Label>
          <Input
            id="workflow-node-timeout"
            type="number"
            min={0}
            value={formatOptionalNumber(config.timeout_hours)}
            disabled={disabled}
            onChange={(event) =>
              onChangeConfig({
                timeout_hours: parseOptionalNumber(event.target.value),
              })
            }
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="workflow-node-rollback">回退节点</Label>
          <Input
            id="workflow-node-rollback"
            value={config.rollback_target_key || ""}
            disabled={disabled}
            placeholder="节点编码"
            onChange={(event) =>
              onChangeConfig({
                rollback_target_key: event.target.value.trim() || null,
              })
            }
          />
        </div>
      </div>
    </section>
  );
}

function ProcedureConfigFields({
  config,
  disabled,
  onChangeConfig,
}: {
  config: WorkflowNodeConfig;
  disabled?: boolean;
  onChangeConfig: (patch: Partial<WorkflowProcedureNodeConfig>) => void;
}) {
  const procedureConfig = config as WorkflowProcedureNodeConfig;

  return (
    <section className="space-y-3">
      <div>
        <div className="text-sm font-medium">工序配置</div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          绑定施工阶段，并定义日志、图片和客户可见要求。
        </p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="workflow-node-stage-key">工序阶段</Label>
        <Input
          id="workflow-node-stage-key"
          value={procedureConfig.stage_key || ""}
          disabled={disabled}
          placeholder="例如 demolition 或 hydropower"
          onChange={(event) =>
            onChangeConfig({ stage_key: event.target.value.trim() })
          }
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="workflow-node-instructions">作业要求</Label>
        <Textarea
          id="workflow-node-instructions"
          value={procedureConfig.work_instructions || ""}
          disabled={disabled}
          maxLength={800}
          onChange={(event) =>
            onChangeConfig({
              work_instructions: event.target.value || null,
            })
          }
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="workflow-node-min-images">最少图片数</Label>
        <Input
          id="workflow-node-min-images"
          type="number"
          min={0}
          max={50}
          value={formatOptionalNumber(procedureConfig.min_image_count ?? 0)}
          disabled={disabled}
          onChange={(event) =>
            onChangeConfig({
              min_image_count: parseOptionalNumber(event.target.value) ?? 0,
            })
          }
        />
      </div>
      <CheckboxField
        checked={procedureConfig.require_log === true}
        disabled={disabled}
        label="必须填写施工日志"
        onCheckedChange={(checked) => onChangeConfig({ require_log: checked })}
      />
      <CheckboxField
        checked={procedureConfig.trigger_acceptance === true}
        disabled={disabled}
        label="完成后触发阶段验收"
        onCheckedChange={(checked) =>
          onChangeConfig({ trigger_acceptance: checked })
        }
      />
      <CheckboxField
        checked={procedureConfig.customer_visible === true}
        disabled={disabled}
        label="客户可见"
        onCheckedChange={(checked) => onChangeConfig({ customer_visible: checked })}
      />
    </section>
  );
}

function ApprovalConfigFields({
  config,
  disabled,
  onChangeConfig,
}: {
  config: WorkflowNodeConfig;
  disabled?: boolean;
  onChangeConfig: (patch: Partial<WorkflowApprovalNodeConfig>) => void;
}) {
  const approvalConfig = config as WorkflowApprovalNodeConfig;

  return (
    <section className="space-y-3">
      <div>
        <div className="text-sm font-medium">审批配置</div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          设置审批人规则、金额阈值和驳回目标。
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label htmlFor="workflow-node-assignee-rule">审批人规则</Label>
          <Select
            disabled={disabled}
            value={approvalConfig.assignee_rule || "employee"}
            onValueChange={(value) =>
              onChangeConfig({
                assignee_rule: value as WorkflowApprovalNodeConfig["assignee_rule"],
              })
            }
          >
            <SelectTrigger id="workflow-node-assignee-rule">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ASSIGNEE_RULE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="workflow-node-approve-mode">通过方式</Label>
          <Select
            disabled={disabled}
            value={approvalConfig.approve_mode || "any"}
            onValueChange={(value) =>
              onChangeConfig({
                approve_mode: value as WorkflowApprovalNodeConfig["approve_mode"],
              })
            }
          >
            <SelectTrigger id="workflow-node-approve-mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {APPROVE_MODE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="workflow-node-assignee-id">审批对象编码</Label>
        <Input
          id="workflow-node-assignee-id"
          value={approvalConfig.assignee_id || ""}
          disabled={disabled}
          placeholder="员工 ID、部门 ID 或角色编码"
          onChange={(event) =>
            onChangeConfig({ assignee_id: event.target.value.trim() || null })
          }
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label htmlFor="workflow-node-amount-threshold">金额阈值</Label>
          <Input
            id="workflow-node-amount-threshold"
            type="number"
            min={0}
            value={formatOptionalNumber(approvalConfig.amount_threshold)}
            disabled={disabled}
            onChange={(event) =>
              onChangeConfig({
                amount_threshold: parseOptionalNumber(event.target.value),
              })
            }
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="workflow-node-reject-target">驳回节点</Label>
          <Input
            id="workflow-node-reject-target"
            value={approvalConfig.reject_target_key || ""}
            disabled={disabled}
            placeholder="节点编码"
            onChange={(event) =>
              onChangeConfig({
                reject_target_key: event.target.value.trim() || null,
              })
            }
          />
        </div>
      </div>
    </section>
  );
}

function NotificationConfigFields({
  config,
  disabled,
  onChangeConfig,
}: {
  config: WorkflowNodeConfig;
  disabled?: boolean;
  onChangeConfig: (patch: Partial<WorkflowNotificationNodeConfig>) => void;
}) {
  const notificationConfig = config as WorkflowNotificationNodeConfig;
  const channels = Array.isArray(notificationConfig.channels)
    ? notificationConfig.channels
    : [];

  return (
    <section className="space-y-3">
      <div>
        <div className="text-sm font-medium">通知配置</div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          设置通知渠道、接收人规则和消息模板。
        </p>
      </div>
      <div className="space-y-2">
        <Label>通知渠道</Label>
        <div className="grid grid-cols-3 gap-2">
          {NODE_CHANNEL_OPTIONS.map((option) => (
            <CheckboxField
              key={option.value}
              checked={channels.includes(option.value)}
              disabled={disabled}
              label={option.label}
              onCheckedChange={(checked) =>
                onChangeConfig({
                  channels: toggleChannel(channels, option.value, checked),
                })
              }
            />
          ))}
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="workflow-node-recipient-rule">接收人规则</Label>
        <Select
          disabled={disabled}
          value={notificationConfig.recipient_rule || "owner"}
          onValueChange={(value) =>
            onChangeConfig({
              recipient_rule: value as WorkflowNotificationNodeConfig["recipient_rule"],
            })
          }
        >
          <SelectTrigger id="workflow-node-recipient-rule">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RECIPIENT_RULE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="workflow-node-template">通知模板</Label>
        <Textarea
          id="workflow-node-template"
          value={notificationConfig.template || ""}
          disabled={disabled}
          maxLength={800}
          onChange={(event) => onChangeConfig({ template: event.target.value })}
        />
      </div>
    </section>
  );
}

function CheckboxField({
  checked,
  disabled,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-10 items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm">
      <Checkbox
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onCheckedChange(value === true)}
      />
      <span>{label}</span>
    </label>
  );
}

function splitListInput(value: string) {
  const items = value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);

  return items.length > 0 ? items : undefined;
}

function formatOptionalNumber(value: number | null | undefined) {
  return typeof value === "number" ? String(value) : "";
}

function parseOptionalNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toggleChannel(
  channels: WorkflowNotificationNodeConfig["channels"],
  channel: WorkflowNotificationNodeConfig["channels"][number],
  checked: boolean,
) {
  if (checked) {
    return channels.includes(channel) ? channels : [...channels, channel];
  }

  return channels.filter((item) => item !== channel);
}
