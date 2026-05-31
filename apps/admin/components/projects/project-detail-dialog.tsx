"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProjectLogsPanel } from "@/components/projects/project-logs-dialog";
import { ProjectAcceptancesPanel } from "@/components/projects/project-acceptances-panel";
import { ProjectConstructionStagesPanel } from "@/components/projects/project-construction-stages-panel";
import { AddProjectMemberDialog } from "@/components/projects/project-member-dialog";
import { ProjectStatusPanel } from "@/components/projects/project-status-panel";
import type { ProjectDetailTab, ProjectRecord } from "@/components/projects/project-mutation-types";
import { customerName, customerStatus, customerStatusLabel, getEmployeeMeta, personName, requestProject } from "@/components/projects/project-mutation-utils";
import { cn } from "@/lib/utils";

export function ProjectDetailDialog({
  project,
  initialTab,
  onClose,
  onChanged,
}: {
  project: ProjectRecord;
  initialTab: ProjectDetailTab;
  onClose: () => void;
  onChanged?: (project?: ProjectRecord) => void;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ProjectDetailTab>(initialTab);
  const [currentProject, setCurrentProject] = useState(project);
  const [refreshing, setRefreshing] = useState(false);
  const [detailError, setDetailError] = useState("");
  const members = currentProject.members || [];
  const existingEmployeeIds = members
    .map((member) => member.employee?.id || member.employee_id)
    .filter((item): item is string => Boolean(item));

  useEffect(() => {
    setCurrentProject(project);
  }, [project]);

  useEffect(() => {
    let cancelled = false;
    setRefreshing(true);
    setDetailError("");
    requestProject({ path: `/projects/${project.id}` })
      .then((data) => {
        if (!cancelled) setCurrentProject(data as ProjectRecord);
      })
      .catch((err) => {
        if (!cancelled) {
          setDetailError(err instanceof Error ? err.message : "详情刷新失败");
        }
      })
      .finally(() => {
        if (!cancelled) setRefreshing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [project.id]);

  async function refreshProject() {
    setRefreshing(true);
    setDetailError("");
    try {
      const data = await requestProject({ path: `/projects/${currentProject.id}` });
      const nextProject = data as ProjectRecord;
      setCurrentProject(nextProject);
      if (onChanged) {
        onChanged(nextProject);
      } else {
        router.refresh();
      }
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : "详情刷新失败");
    } finally {
      setRefreshing(false);
    }
  }

  const updateActiveTab = (value: string) => {
    if (
      value === "overview" ||
      value === "members" ||
      value === "logs" ||
      value === "acceptances"
    ) {
      setActiveTab(value);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex h-[88vh] max-w-[920px] flex-col overflow-hidden p-0">
        <DialogHeader className="border-b p-5 text-left">
          <div>
            <DialogTitle>{currentProject.name}</DialogTitle>
            <DialogDescription>
              {currentProject.customer_id
                ? `客户：${customerName(currentProject.customer)} · 客户销售状态：${customerStatusLabel(customerStatus(currentProject.customer))}`
                : "未关联客户"}
            </DialogDescription>
          </div>
        </DialogHeader>
        <Tabs
          value={activeTab}
          onValueChange={updateActiveTab}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <div className="shrink-0 border-b px-5 pt-4">
            <TabsList>
              <TabsTrigger value="overview">概览</TabsTrigger>
              <TabsTrigger value="members">成员</TabsTrigger>
              <TabsTrigger value="logs">施工日志</TabsTrigger>
              <TabsTrigger value="acceptances">工序验收</TabsTrigger>
            </TabsList>
          </div>
          <div
            className={cn(
              "min-h-0 flex-1 p-5",
              activeTab === "acceptances"
                ? "overflow-hidden"
                : "overflow-y-auto [scrollbar-gutter:stable]",
            )}
          >
            {detailError ? (
              <StatusAlert>{detailError}</StatusAlert>
            ) : null}
            <TabsContent value="overview" className="flex flex-col gap-5">
              <ProjectConstructionStagesPanel
                projectId={currentProject.id}
                active={activeTab === "overview"}
              />
              <ProjectStatusPanel project={currentProject} onChanged={refreshProject} />
            </TabsContent>
            <TabsContent value="members">
              <section className="flex flex-col gap-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="text-sm font-semibold">项目成员</h3>
                  <div className="flex items-center gap-2">
                    {refreshing ? (
                      <Badge variant="secondary">
                        <Loader2 className="animate-spin" data-icon="inline-start" />
                        正在刷新
                      </Badge>
                    ) : null}
                    <AddProjectMemberDialog
                      projectId={currentProject.id}
                      existingEmployeeIds={existingEmployeeIds}
                      onAdded={refreshProject}
                    />
                  </div>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  {members.map((member) => (
                    <div key={member.id} className="rounded-md border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate font-medium">
                            {personName(member.employee)}
                          </div>
                          <div className="mt-1 truncate text-sm text-muted-foreground">
                            {getEmployeeMeta(member.employee) || "暂无部门岗位信息"}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {member.is_primary ? <Badge variant="success">主责</Badge> : null}
                          {member.is_virtual ? <Badge variant="secondary">客户归属</Badge> : null}
                        </div>
                      </div>
                    </div>
                  ))}
                  {members.length === 0 ? (
                    <div className="rounded-md border p-4 text-sm text-muted-foreground">
                      暂无成员
                    </div>
                  ) : null}
                </div>
              </section>
            </TabsContent>
            <TabsContent value="logs">
              <div className="flex flex-col gap-5">
                <ProjectConstructionStagesPanel
                  projectId={currentProject.id}
                  active={activeTab === "logs"}
                  compact
                />
                <ProjectLogsPanel project={currentProject} active={activeTab === "logs"} />
              </div>
            </TabsContent>
            <TabsContent value="acceptances" className="h-full min-h-0">
              <ProjectAcceptancesPanel
                project={currentProject}
                active={activeTab === "acceptances"}
              />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
