"use client";

import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AddProjectMemberDialog } from "@/components/projects/project-member-dialog";
import type { ProjectRecord } from "@/components/projects/project-mutation-types";
import { getEmployeeMeta, personName } from "@/components/projects/project-mutation-utils";

export function ProjectMembersPanel({
  project,
  refreshing,
  onChanged,
}: {
  project: ProjectRecord;
  refreshing: boolean;
  onChanged: () => Promise<void>;
}) {
  const members = project.members || [];
  const existingEmployeeIds = members
    .filter((member) => !member.is_virtual)
    .map((member) => member.employee?.id || member.employee_id)
    .filter((item): item is string => Boolean(item));

  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-semibold">项目成员</h3>
          <p className="mt-1 text-sm text-muted-foreground">设计、工程和客户归属成员。</p>
        </div>
        <div className="flex items-center gap-2">
          {refreshing ? (
            <Badge variant="secondary">
              <Loader2 className="animate-spin" data-icon="inline-start" />
              正在刷新
            </Badge>
          ) : null}
          <AddProjectMemberDialog
            projectId={project.id}
            existingEmployeeIds={existingEmployeeIds}
            onAdded={onChanged}
          />
        </div>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-2">
        {members.map((member) => (
          <article key={member.id} className="rounded-md border bg-background p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-medium">{personName(member.employee)}</div>
                <div className="mt-1 truncate text-sm text-muted-foreground">
                  {getEmployeeMeta(member.employee) || "暂无部门岗位信息"}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {member.is_primary ? <Badge variant="success">主责</Badge> : null}
                {member.is_virtual ? <Badge variant="secondary">客户归属</Badge> : null}
              </div>
            </div>
          </article>
        ))}
        {members.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
            暂无成员
          </div>
        ) : null}
      </div>
    </section>
  );
}
