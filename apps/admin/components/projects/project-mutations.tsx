"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Edit3, Eye, Loader2, Plus, Trash2 } from "lucide-react";
import { ConfirmActionDialog } from "@/components/admin/action-dialogs";
import { Button } from "@/components/ui/button";
import { ProjectDialog } from "@/components/projects/project-form-dialog";
import { ProjectDetailDialog } from "@/components/projects/project-detail-dialog";
import type { ProjectDetailTab, ProjectRecord } from "@/components/projects/project-mutation-types";
import { requestProject } from "@/components/projects/project-mutation-utils";

export type { ProjectRecord } from "@/components/projects/project-mutation-types";

export function CreateProjectButton({
  onSaved,
}: {
  onSaved?: (project?: ProjectRecord) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus />
        新增项目
      </Button>
      <ProjectDialog mode="create" open={open} onOpenChange={setOpen} onSaved={onSaved} />
    </>
  );
}

export function ProjectRowActions({
  project,
  onChanged,
}: {
  project: ProjectRecord;
  onChanged?: (project?: ProjectRecord) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [detail, setDetail] = useState<{
    project: ProjectRecord;
    initialTab: ProjectDetailTab;
  } | null>(null);
  const disabled = pending || project.status === "invalid";

  function openDetail(initialTab: ProjectDetailTab = "overview") {
    setError("");
    setDetail({
      project,
      initialTab,
    });
  }

  function deleteProject() {
    setError("");
    startTransition(async () => {
      try {
        const deletedProject = await requestProject({
          path: `/projects/${project.id}`,
          method: "DELETE",
        }) as Partial<ProjectRecord>;
        setDeleteOpen(false);
        if (onChanged) {
          onChanged({
            ...project,
            ...deletedProject,
            status: "invalid",
          });
        } else {
          router.refresh();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "作废失败");
      }
    });
  }

  return (
    <div className="flex min-w-[220px] flex-nowrap items-center justify-end gap-2 whitespace-nowrap">
      <Button type="button" variant="outline" size="sm" onClick={() => openDetail()} disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <Eye />}
        详情
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => setEditOpen(true)} disabled={disabled}>
        <Edit3 />
        编辑
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => setDeleteOpen(true)} disabled={disabled}>
        <Trash2 />
        作废
      </Button>
      <ProjectDialog
        mode="edit"
        project={project}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={onChanged}
      />
      {detail ? (
        <ProjectDetailDialog
          project={detail.project}
          initialTab={detail.initialTab}
          onClose={() => setDetail(null)}
          onChanged={onChanged}
        />
      ) : null}
      <ConfirmActionDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="作废项目"
        description={`确认作废项目「${project.name}」？`}
        confirmLabel="确认作废"
        destructive
        pending={pending}
        onConfirm={deleteProject}
      />
      {error ? (
        <div className="absolute right-5 mt-10 max-w-[360px] rounded-md border border-destructive/50 bg-background px-3 py-2 text-xs text-destructive shadow-sm">
          {error}
        </div>
      ) : null}
    </div>
  );
}
