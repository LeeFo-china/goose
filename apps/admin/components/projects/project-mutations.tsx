"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardCheck, Edit3, Loader2, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { ConfirmActionDialog } from "@/components/admin/action-dialogs";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
    <div className="relative flex min-w-24 justify-end whitespace-nowrap">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm" disabled={pending}>
            {pending ? (
              <Loader2 className="animate-spin" data-icon="inline-start" />
            ) : (
              <MoreHorizontal data-icon="inline-start" />
            )}
            操作
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="left" sideOffset={8} className="w-36">
          <DropdownMenuGroup>
            <DropdownMenuItem asChild>
              <Link href={projectDetailHref(project.id, "acceptances")}>
                <ClipboardCheck />
                工序验收
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={projectDetailHref(project.id, "acceptances")}>
                详情
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem disabled={disabled} onSelect={() => setEditOpen(true)}>
              <Edit3 />
              编辑
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              disabled={disabled}
              onSelect={() => setDeleteOpen(true)}
            >
              <Trash2 />
              作废
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
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
