"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardCheck, Edit3, Plus, Trash2 } from "lucide-react";
import { ConfirmActionDialog } from "@/components/admin/action-dialogs";
import { Button } from "@/components/ui/button";
import { projectDetailHref } from "@/components/projects/project-detail-page-tabs";
import { ProjectDialog } from "@/components/projects/project-form-dialog";
import type { ProjectRecord } from "@/components/projects/project-mutation-types";
import { requestProject } from "@/components/projects/project-mutation-utils";
import { refreshAfterDialogClose } from "@/lib/deferred-refresh";

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
  const disabled = pending || project.status === "invalid";

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
          refreshAfterDialogClose(router);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "作废失败");
      }
    });
  }

  return (
    <div className="flex min-w-[300px] flex-nowrap items-center justify-end gap-2 whitespace-nowrap">
      <Button asChild type="button" variant="outline" size="sm">
        <Link href={projectDetailHref(project.id, "acceptances")}>
          <ClipboardCheck />
          工序验收
        </Link>
      </Button>
      <Button asChild type="button" variant="outline" size="sm">
        <Link href={projectDetailHref(project.id, "acceptances")}>
          详情
        </Link>
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
