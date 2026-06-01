"use client";

import { FormEvent, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormSelect } from "@/components/admin/form-select";
import type { ProjectFormState, ProjectMode, ProjectRecord } from "@/components/projects/project-mutation-types";
import { buildDefaults, buildOptimisticProject, requestProject, syncProjectPrimaryAssignees, visibilityOptions } from "@/components/projects/project-mutation-utils";
import { useSelectOptions } from "@/components/projects/use-project-select-options";
import { OptionSelect } from "@/components/projects/project-option-select";
import { refreshAfterDialogClose } from "@/lib/deferred-refresh";

export function ProjectDialog({
  mode,
  project,
  open,
  onOpenChange,
  onSaved,
}: {
  mode: ProjectMode;
  project?: ProjectRecord;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (project?: ProjectRecord) => void;
}) {
  const router = useRouter();
  const defaults = useMemo(() => buildDefaults(project), [project]);
  const [formState, setFormState] = useState<ProjectFormState>(defaults);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const options = useSelectOptions(open, project);

  useEffect(() => {
    if (open) setFormState(defaults);
  }, [open, defaults]);

  if (!open) return null;

  function close() {
    if (pending) return;
    setError("");
    onOpenChange(false);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const styleTags = formState.style_tags
      .split(/[,，\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
    const payload: {
      name: string;
      status?: string;
      customer_id: string | null;
      budget: number | null;
      start_date: string | null;
      address: string | null;
      visibility_status: string;
      style_tags: string[];
    } = {
      name: formState.name.trim(),
      customer_id: formState.customer_id || null,
      budget: formState.budget ? Number(formState.budget) : null,
      start_date: formState.start_date || null,
      address: formState.address.trim() || null,
      visibility_status: formState.visibility_status,
      style_tags: styleTags,
    };
    if (mode === "create") {
      payload.status = "designing";
    }

    setError("");
    startTransition(async () => {
      try {
        const savedProject = await requestProject({
          path: mode === "create" ? "/projects" : `/projects/${project?.id}`,
          method: mode === "create" ? "POST" : "PATCH",
          payload,
        }) as ProjectRecord;
        const projectId = mode === "create" ? savedProject.id : project?.id;
        if (projectId) {
          await syncProjectPrimaryAssignees({
            projectId,
            designerId: formState.designer_employee_id || null,
            supervisorId: formState.supervisor_employee_id || null,
          });
        }
        if (mode === "edit" && project && onSaved) {
          onSaved(buildOptimisticProject(project, formState, options));
        }
        const nextProject = projectId
          ? await requestProject({ path: `/projects/${projectId}` }) as ProjectRecord
          : savedProject;
        onOpenChange(false);
        if (onSaved) {
          onSaved(nextProject);
        } else {
          refreshAfterDialogClose(router);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "保存失败");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? onOpenChange(true) : close())}>
      <DialogContent className="max-h-[88vh] max-w-[720px] overflow-hidden p-0">
        <DialogHeader className="border-b p-5">
          <DialogTitle>
            {mode === "create" ? "新增项目" : "编辑项目"}
          </DialogTitle>
          <DialogDescription>
            维护项目基础档案、客户、设计师、工程负责人和展示状态。
          </DialogDescription>
        </DialogHeader>
        <form className="flex max-h-[calc(88vh-82px)] flex-col gap-4 overflow-y-auto p-5" onSubmit={submit}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2 md:col-span-2">
              <Label htmlFor={`${mode}-project-name`}>项目名称</Label>
              <Input
                id={`${mode}-project-name`}
                value={formState.name}
                disabled={pending}
                required
                onChange={(event) => setFormState((current) => ({
                  ...current,
                  name: event.target.value,
                }))}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${mode}-project-visibility`}>展示状态</Label>
              <FormSelect
                id={`${mode}-project-visibility`}
                value={formState.visibility_status}
                disabled={pending}
                options={visibilityOptions.map(([value, label]) => ({
                  value,
                  label,
                }))}
                onChange={(value) => setFormState((current) => ({
                  ...current,
                  visibility_status: value,
                }))}
              />
            </div>
            <div className="flex flex-col gap-2 md:col-span-2">
              <Label htmlFor={`${mode}-project-customer`}>客户</Label>
              <OptionSelect
                id={`${mode}-project-customer`}
                value={formState.customer_id}
                options={options.customers}
                disabled={pending || options.loading}
                placeholder={options.loading ? "客户加载中" : "不关联客户"}
                onChange={(value) => setFormState((current) => ({
                  ...current,
                  customer_id: value,
                }))}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${mode}-project-designer`}>设计师</Label>
              <OptionSelect
                id={`${mode}-project-designer`}
                value={formState.designer_employee_id}
                options={options.designers}
                disabled={pending || options.loading}
                placeholder={options.loading ? "设计师加载中" : "未选择"}
                onChange={(value) => setFormState((current) => ({
                  ...current,
                  designer_employee_id: value,
                }))}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${mode}-project-supervisor`}>工程负责人</Label>
              <OptionSelect
                id={`${mode}-project-supervisor`}
                value={formState.supervisor_employee_id}
                options={options.supervisors}
                disabled={pending || options.loading}
                placeholder={options.loading ? "负责人加载中" : "未选择"}
                onChange={(value) => setFormState((current) => ({
                  ...current,
                  supervisor_employee_id: value,
                }))}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${mode}-project-budget`}>预算</Label>
              <Input
                id={`${mode}-project-budget`}
                type="number"
                min="0"
                step="0.01"
                value={formState.budget}
                disabled={pending}
                onChange={(event) => setFormState((current) => ({
                  ...current,
                  budget: event.target.value,
                }))}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${mode}-project-start-date`}>开工日期</Label>
              <Input
                id={`${mode}-project-start-date`}
                type="date"
                value={formState.start_date}
                disabled={pending}
                onChange={(event) => setFormState((current) => ({
                  ...current,
                  start_date: event.target.value,
                }))}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${mode}-project-tags`}>风格标签</Label>
              <Input
                id={`${mode}-project-tags`}
                value={formState.style_tags}
                placeholder="现代,轻奢"
                disabled={pending}
                onChange={(event) => setFormState((current) => ({
                  ...current,
                  style_tags: event.target.value,
                }))}
              />
            </div>
            <div className="flex flex-col gap-2 md:col-span-2">
              <Label htmlFor={`${mode}-project-address`}>项目地址</Label>
              <Textarea
                id={`${mode}-project-address`}
                value={formState.address}
                disabled={pending}
                className="min-h-[72px]"
                onChange={(event) => setFormState((current) => ({
                  ...current,
                  address: event.target.value,
                }))}
              />
            </div>
          </div>
          {options.error ? (
            <StatusAlert tone="warning">{options.error}</StatusAlert>
          ) : null}
          {error ? (
            <StatusAlert>{error}</StatusAlert>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close} disabled={pending}>
              取消
            </Button>
            <Button type="submit" disabled={pending || options.loading}>
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              {mode === "create" ? "创建项目" : "保存修改"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
