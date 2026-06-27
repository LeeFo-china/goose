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
    <section data-testid="project-members-panel" className="border-y bg-card">
      <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">项目成员</h3>
            <Badge variant="secondary">{members.length} 人</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">设计、工程和客户归属成员。</p>
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

      <div data-testid="project-member-list" className="divide-y">
        {members.map((member) => (
          <article
            key={member.id}
            className="flex min-w-0 flex-col gap-2 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="min-w-0 truncate font-medium">{personName(member.employee)}</span>
                {member.is_primary ? <Badge variant="success">主责</Badge> : null}
                {member.is_virtual ? <Badge variant="secondary">客户归属</Badge> : null}
              </div>
              <div className="mt-1 truncate text-xs text-muted-foreground">
                {getEmployeeMeta(member.employee) || "暂无部门岗位信息"}
              </div>
            </div>
            <div className="shrink-0 text-xs text-muted-foreground">
              {member.is_virtual ? "客户关系" : "内部成员"}
            </div>
          </article>
        ))}
        {members.length === 0 ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">
            暂无成员
          </div>
        ) : null}
      </div>
    </section>
  );
}
