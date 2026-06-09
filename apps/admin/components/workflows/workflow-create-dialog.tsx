"use client";

import { type FormEvent, useState } from "react";
import type { WorkflowCategory } from "@gooes/domain";
import { Loader2, Plus } from "lucide-react";
import { FormSelect } from "@/components/admin/form-select";
import { StatusAlert } from "@/components/admin/status-alert";
import { createWorkflowDefinition } from "@/components/workflows/workflow-requests";
import { workflowCategoryOptions } from "@/components/workflows/workflow-labels";
import type { WorkflowDefinition } from "@/components/workflows/workflow-types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const createCategoryOptions = workflowCategoryOptions
  .filter(([value]) => value)
  .map(([value, label]) => ({ value, label }));

export function WorkflowCreateDialog({
  disabled,
  onCreated,
}: {
  disabled?: boolean;
  onCreated: (workflow: WorkflowDefinition) => void;
}) {
  const [open, setOpen] = useState(false);
  const [workflowKey, setWorkflowKey] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState<WorkflowCategory>("main");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function resetForm() {
    setWorkflowKey("");
    setName("");
    setCategory("main");
    setDescription("");
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextWorkflowKey = workflowKey.trim();
    const nextName = name.trim();
    const nextDescription = description.trim();

    if (!nextWorkflowKey || !nextName) {
      setError("流程编码和流程名称不能为空");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const workflow = await createWorkflowDefinition({
        workflow_key: nextWorkflowKey,
        name: nextName,
        category,
        description: nextDescription || null,
      });
      setOpen(false);
      resetForm();
      onCreated(workflow);
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建流程失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) resetForm();
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" disabled={disabled}>
          <Plus data-icon="inline-start" />
          新建流程
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新建流程</DialogTitle>
          <DialogDescription>
            创建流程定义后，在详情页配置节点、连线和发布版本。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-4">
          {error ? <StatusAlert>{error}</StatusAlert> : null}
          <div className="grid gap-2">
            <Label htmlFor="workflow-create-key">流程编码</Label>
            <Input
              id="workflow-create-key"
              value={workflowKey}
              maxLength={100}
              placeholder="例如 sales_default"
              disabled={submitting}
              onChange={(event) => setWorkflowKey(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="workflow-create-name">流程名称</Label>
            <Input
              id="workflow-create-name"
              value={name}
              maxLength={100}
              placeholder="例如 标准销售流转"
              disabled={submitting}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="workflow-create-category">流程分类</Label>
            <FormSelect
              id="workflow-create-category"
              value={category}
              options={createCategoryOptions}
              disabled={submitting}
              onChange={(value) => setCategory(value as WorkflowCategory)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="workflow-create-description">流程说明</Label>
            <Textarea
              id="workflow-create-description"
              value={description}
              maxLength={500}
              placeholder="用于区分适用场景，可后续修改"
              disabled={submitting}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() => setOpen(false)}
            >
              取消
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <Loader2 className="animate-spin" data-icon="inline-start" />
              ) : null}
              创建并编排
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
