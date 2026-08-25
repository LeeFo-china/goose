"use client";

import {
  WorkflowProcedureStageOptions,
  isWorkflowProcedureStageKey,
} from "@/components/workflows/workflow-procedure-stages";
import type {
  WorkflowNodeConfig,
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

const CANDIDATE_DEPARTMENT_LABELS: Record<string, string> = {
  PROJECT: "项目部",
  INSTALLATION: "安装部",
  DESIGN: "设计部",
  FINANCE: "财务部",
  CUSTOMER_SERVICE: "客服部",
  SALES: "销售部",
  ENGINEERING: "工程部",
};

const CANDIDATE_DEPARTMENT_CODES = Object.fromEntries(
  Object.entries(CANDIDATE_DEPARTMENT_LABELS).map(([code, label]) => [label, code]),
) as Record<string, string>;

export function ProcedureConfigFields({
  config,
  disabled,
  usedStageKeys,
  onChangeConfig,
}: {
  config: WorkflowNodeConfig;
  disabled?: boolean;
  usedStageKeys: string[];
  onChangeConfig: (patch: Partial<WorkflowProcedureNodeConfig>) => void;
}) {
  const procedureConfig = config as WorkflowProcedureNodeConfig;
  const selectedStageKey = isWorkflowProcedureStageKey(procedureConfig.stage_key)
    ? procedureConfig.stage_key
    : "";

  return (
    <section className="space-y-3">
      <div className="grid gap-2">
        <Label htmlFor="workflow-node-stage-key">工序类型</Label>
        <Select
          disabled={disabled}
          value={selectedStageKey}
          onValueChange={(value) => {
            if (!isWorkflowProcedureStageKey(value)) return;
            onChangeConfig({ stage_key: value });
          }}
        >
          <SelectTrigger id="workflow-node-stage-key">
            <SelectValue placeholder="选择工序类型" />
          </SelectTrigger>
          <SelectContent>
            {WorkflowProcedureStageOptions.map((option) => (
              <SelectItem
                key={option.value}
                value={option.value}
                disabled={usedStageKeys.includes(option.value)}
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
        checked={procedureConfig.require_procedure_assignment !== false}
        disabled={disabled}
        label="必须先派工再开工"
        onCheckedChange={(checked) =>
          onChangeConfig({ require_procedure_assignment: checked })
        }
      />
      <div className="grid gap-2">
        <Label htmlFor="workflow-node-default-duration-days">
          默认工期
        </Label>
        <Input
          id="workflow-node-default-duration-days"
          type="number"
          min={1}
          max={365}
          value={formatOptionalNumber(procedureConfig.default_duration_days)}
          disabled={disabled}
          placeholder="例如 3"
          onChange={(event) =>
            onChangeConfig({
              default_duration_days: parseOptionalNumber(event.target.value),
            })
          }
        />
      </div>
      <CheckboxField
        checked={procedureConfig.allow_duration_override !== false}
        disabled={disabled}
        label="开工时允许调整工期"
        onCheckedChange={(checked) =>
          onChangeConfig({ allow_duration_override: checked })
        }
      />
      <div className="grid gap-2">
        <Label htmlFor="workflow-node-candidate-department-codes">
          候选派工部门
        </Label>
        <Input
          id="workflow-node-candidate-department-codes"
          value={formatCandidateDepartmentInput(
            procedureConfig.candidate_department_codes || [],
          )}
          disabled={disabled}
          placeholder="例如 项目部、安装部"
          onChange={(event) =>
            onChangeConfig({
              candidate_department_codes: parseCandidateDepartmentInput(
                event.target.value,
              ),
            })
          }
        />
      </div>
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

function formatOptionalNumber(value: number | null | undefined) {
  return typeof value === "number" ? String(value) : "";
}

function parseOptionalNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatCandidateDepartmentInput(codes: string[]) {
  return codes.map((code) => CANDIDATE_DEPARTMENT_LABELS[code] || "其他部门")
    .join("、");
}

export function parseCandidateDepartmentInput(value: string) {
  return value
    .split(/[,，、]/)
    .map((item) => item.trim())
    .map((item) => CANDIDATE_DEPARTMENT_CODES[item] || item)
    .filter(Boolean);
}
