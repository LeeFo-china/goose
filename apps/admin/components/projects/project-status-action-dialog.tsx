"use client";

import { Dispatch, SetStateAction, useEffect, useMemo, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type {
  ProjectStatusActionItem,
} from "@/components/projects/project-mutation-types";
import { requestBackendJson } from "@/lib/backend-client";

type ActionOutputValues = Record<string, string>;

type ProcedureCandidate = {
  id: string;
  name?: string | null;
  status?: string | null;
  department?: {
    code?: string | null;
    name?: string | null;
  } | null;
  post?: {
    code?: string | null;
    name?: string | null;
  } | null;
  busy: boolean;
  busy_assignment?: {
    project_id: string;
    project_name?: string | null;
    planned_end_date?: string | null;
    remaining_days?: number | null;
  } | null;
};

type ProjectStatusActionDialogProps = {
  projectId: string;
  selectedAction: ProjectStatusActionItem | null;
  pending: boolean;
  reason: string;
  setReason: Dispatch<SetStateAction<string>>;
  outputValues: ActionOutputValues;
  setOutputValues: Dispatch<SetStateAction<ActionOutputValues>>;
  closeActionDialog: () => void;
  submitAction: () => void;
};

export function ProjectStatusActionDialog({
  projectId,
  selectedAction,
  pending,
  reason,
  setReason,
  outputValues,
  setOutputValues,
  closeActionDialog,
  submitAction,
}: ProjectStatusActionDialogProps) {
  const isPaymentCollection =
    selectedAction?.workflow_business_domain === "payment_collection";
  const outputFields = selectedAction?.workflow_output_fields || [];

  function setOutputValue(name: string, value: string) {
    setOutputValues((current) => ({ ...current, [name]: value }));
  }

  return (
    <Dialog open={Boolean(selectedAction)} onOpenChange={(open) => !open && closeActionDialog()}>
      <DialogContent className="max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{selectedAction?.label || "流程操作"}</DialogTitle>
          <DialogDescription>
            {isPaymentCollection
              ? "确认后仅校验是否已有已确认入账记录；不会在此录入金额或凭证，满足条件后推进流程。"
              : selectedAction
              ? "将通过后端返回的流程待办执行该动作。"
              : "确认执行该流程操作。"}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {selectedAction && outputFields.length > 0 ? (
            <div className="rounded-md border bg-muted/20 p-3">
              <div className="mb-3 text-sm font-medium">流程表单</div>
              <div className="grid gap-3">
                {outputFields.map((field) => (
                  <WorkflowOutputFieldControl
                    key={field.name}
                    action={selectedAction}
                    disabled={pending}
                    field={field}
                    outputValues={outputValues}
                    projectId={projectId}
                    onChange={setOutputValue}
                  />
                ))}
              </div>
            </div>
          ) : null}
          <div className="flex flex-col gap-2">
            <Label htmlFor="project-status-reason">
              {selectedAction?.requires_reason ? "原因" : "备注"}
            </Label>
            <Textarea
              id="project-status-reason"
              value={reason}
              disabled={pending}
              placeholder={selectedAction?.requires_reason ? "请输入原因" : "可选"}
              className="min-h-[96px]"
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={closeActionDialog}>
            取消
          </Button>
          <Button
            type="button"
            disabled={pending}
            onClick={submitAction}
          >
            {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
            确认执行
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WorkflowOutputFieldControl({
  action,
  disabled,
  field,
  onChange,
  outputValues,
  projectId,
}: {
  action: ProjectStatusActionItem;
  disabled: boolean;
  field: NonNullable<ProjectStatusActionItem["workflow_output_fields"]>[number];
  onChange: (name: string, value: string) => void;
  outputValues: ActionOutputValues;
  projectId: string;
}) {
  const value = outputValues[field.name] || "";
  const label = `${field.label}${field.required ? " *" : ""}`;

  if (field.source === "procedure_candidate" || field.type === "employee") {
    return (
      <ProcedureCandidateField
        action={action}
        disabled={disabled}
        field={field}
        label={label}
        outputValues={outputValues}
        projectId={projectId}
        value={value}
        onChange={(nextValue) => onChange(field.name, nextValue)}
      />
    );
  }

  if (field.type === "date") {
    return (
      <div className="grid gap-2">
        <Label htmlFor={`workflow-output-${field.name}`}>{label}</Label>
        <Input
          id={`workflow-output-${field.name}`}
          type="date"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(field.name, event.target.value)}
        />
      </div>
    );
  }

  if (field.type === "number") {
    return (
      <div className="grid gap-2">
        <Label htmlFor={`workflow-output-${field.name}`}>{label}</Label>
        <Input
          id={`workflow-output-${field.name}`}
          type="number"
          min={field.min}
          max={field.max}
          value={value}
          disabled={disabled}
          placeholder={field.name === "planned_duration_days" ? "请输入工期天数" : undefined}
          onChange={(event) => onChange(field.name, event.target.value)}
        />
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <Label htmlFor={`workflow-output-${field.name}`}>{label}</Label>
      <Input
        id={`workflow-output-${field.name}`}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(field.name, event.target.value)}
      />
    </div>
  );
}

function ProcedureCandidateField({
  action,
  disabled,
  field,
  label,
  onChange,
  outputValues,
  projectId,
  value,
}: {
  action: ProjectStatusActionItem;
  disabled: boolean;
  field: NonNullable<ProjectStatusActionItem["workflow_output_fields"]>[number];
  label: string;
  onChange: (value: string) => void;
  outputValues: ActionOutputValues;
  projectId: string;
  value: string;
}) {
  const [keyword, setKeyword] = useState("");
  const [candidates, setCandidates] = useState<ProcedureCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const plannedStartDate = outputValues.planned_start_date || "";
  const plannedDurationDays = outputValues.planned_duration_days || "";
  const selectedCandidate = useMemo(
    () => candidates.find((candidate) => candidate.id === value) || null,
    [candidates, value],
  );

  useEffect(() => {
    if (!action.workflow_task_id || !plannedStartDate || !plannedDurationDays) {
      setCandidates([]);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const query = new URLSearchParams({
        page: "1",
        pageSize: "20",
        task_id: action.workflow_task_id || "",
        planned_start_date: plannedStartDate,
        planned_duration_days: plannedDurationDays,
      });
      if (field.stage_code) query.set("stage_code", field.stage_code);
      if (keyword.trim()) query.set("keyword", keyword.trim());

      setLoading(true);
      setError("");
      requestBackendJson<{ list?: ProcedureCandidate[] }>(
        `/projects/${projectId}/procedure-candidates?${query.toString()}`,
        {
          cache: "no-store",
          signal: controller.signal,
          fallbackMessage: "施工人员候选加载失败",
        },
      )
        .then((data) => setCandidates(data.list || []))
        .catch((err) => {
          if (controller.signal.aborted) return;
          setCandidates([]);
          setError(err instanceof Error ? err.message : "施工人员候选加载失败");
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    action.workflow_task_id,
    field.stage_code,
    keyword,
    plannedDurationDays,
    plannedStartDate,
    projectId,
  ]);

  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <Command shouldFilter={false} className="rounded-md border bg-background">
        <CommandInput
          value={keyword}
          onValueChange={setKeyword}
          disabled={disabled || !plannedStartDate || !plannedDurationDays}
          placeholder="搜索工程部施工人员"
        />
        <CommandList className="max-h-[240px]">
          <CommandEmpty>
            {!plannedStartDate || !plannedDurationDays
              ? "请先填写开工时间和工期"
              : loading
                ? "加载中..."
                : error || "没有可选施工人员"}
          </CommandEmpty>
          <CommandGroup>
            {candidates.map((candidate) => (
              <CommandItem
                key={candidate.id}
                value={`${candidate.name || ""} ${candidate.department?.name || ""} ${candidate.post?.name || ""}`}
                disabled={disabled || candidate.busy}
                onSelect={() => {
                  if (candidate.busy) return;
                  onChange(candidate.id);
                }}
                className="cursor-pointer"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">
                    {candidate.name || candidate.id}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {formatCandidateMeta(candidate)}
                  </span>
                </span>
                {candidate.id === value ? <Check className="size-4" /> : null}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
      {selectedCandidate ? (
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          已选择 {selectedCandidate.name || selectedCandidate.id}
        </div>
      ) : value ? (
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          已选择员工 ID：{value}
        </div>
      ) : null}
    </div>
  );
}

function formatCandidateMeta(candidate: ProcedureCandidate) {
  if (candidate.busy_assignment) {
    const remainingDays = candidate.busy_assignment.remaining_days;
    const projectName = candidate.busy_assignment.project_name || "其他项目";
    return `正在 ${projectName} 施工${
      typeof remainingDays === "number" ? `，剩余 ${remainingDays} 天` : ""
    }`;
  }

  return [
    candidate.department?.name,
    candidate.post?.name,
    candidate.status === "active" ? "可派工" : candidate.status,
  ].filter(Boolean).join(" · ") || "可派工";
}
