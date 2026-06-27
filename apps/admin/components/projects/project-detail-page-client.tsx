"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProjectAcceptanceWorkbench } from "@/components/projects/project-acceptance-workbench";
import { ProjectConstructionStagesPanel } from "@/components/projects/project-construction-stages-panel";
import { ProjectDetailOverviewPanel } from "@/components/projects/project-detail-overview-panel";
import { ProjectDetailSideRail } from "@/components/projects/project-detail-side-rail";
import {
  projectDetailHref,
  type ProjectDetailPageTab,
} from "@/components/projects/project-detail-page-tabs";
import { ProjectLogsPanel } from "@/components/projects/project-logs-dialog";
import { ProjectMembersPanel } from "@/components/projects/project-members-panel";
import type { ProjectRecord } from "@/components/projects/project-mutation-types";
import { requestProject } from "@/components/projects/project-mutation-utils";
import { ProjectStatusPanel } from "@/components/projects/project-status-panel";
import { ProjectWorkflowRuntimePanel } from "@/components/projects/project-workflow-runtime-panel";

export function ProjectDetailPageClient({
  project,
  initialTab,
  initialAcceptanceId,
}: {
  project: ProjectRecord;
  initialTab: ProjectDetailPageTab;
  initialAcceptanceId: string;
}) {
  const router = useRouter();
  const latestProjectIdRef = useRef(project.id);
  const latestActiveTabRef = useRef(initialTab);
  const refreshRequestIdRef = useRef(0);
  const [currentProject, setCurrentProject] = useState(project);
  const [activeTab, setActiveTab] = useState<ProjectDetailPageTab>(initialTab);
  const [acceptanceId, setAcceptanceId] = useState(initialAcceptanceId);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [refreshing, startRefreshTransition] = useTransition();
  const [error, setError] = useState("");

  useEffect(() => {
    refreshRequestIdRef.current += 1;
    latestProjectIdRef.current = project.id;
    setCurrentProject(project);
    setError("");
  }, [project]);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    latestActiveTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    setAcceptanceId(initialAcceptanceId);
  }, [initialAcceptanceId]);

  const title = useMemo(() => {
    if (activeTab === "logs") return "施工日志";
    if (activeTab === "members") return "成员/状态";
    if (activeTab === "overview") return "总览";
    return "工序验收";
  }, [activeTab]);

  function navigate(tab: ProjectDetailPageTab, nextAcceptanceId = "") {
    latestActiveTabRef.current = tab;
    setActiveTab(tab);
    if (tab === "acceptances") {
      setAcceptanceId(nextAcceptanceId);
    }
    router.push(projectDetailHref(currentProject.id, tab, nextAcceptanceId));
  }

  function refreshProject(): Promise<void> {
    const projectId = currentProject.id;
    const requestId = refreshRequestIdRef.current + 1;
    refreshRequestIdRef.current = requestId;
    setError("");
    return new Promise((resolve) => {
      startRefreshTransition(async () => {
        try {
          const nextProject = await requestProject<ProjectRecord>({
            path: `/projects/${projectId}`,
          });
          if (
            refreshRequestIdRef.current === requestId &&
            latestProjectIdRef.current === projectId
          ) {
            setCurrentProject(nextProject);
            setRefreshVersion((value) => value + 1);
          }
        } catch (err) {
          if (
            refreshRequestIdRef.current === requestId &&
            latestProjectIdRef.current === projectId
          ) {
            setError(
              err instanceof Error && err.message ? err.message : "项目详情刷新失败",
            );
          }
        } finally {
          resolve();
        }
      });
    });
  }

  const isAcceptanceTab = activeTab === "acceptances";

  return (
    <div
      data-testid="project-detail-workspace"
      className="flex h-[calc(100dvh-6.5625rem)] min-h-0 flex-col overflow-hidden rounded-md border bg-card [contain:layout_paint] lg:grid lg:grid-cols-[280px_minmax(0,1fr)]"
    >
      <ProjectDetailSideRail
        project={currentProject}
        activeTab={activeTab}
        onNavigate={navigate}
      />

      <main
        data-testid="project-detail-content"
        className="flex min-h-0 min-w-0 flex-1 flex-col bg-background lg:h-full"
      >
        <div className="shrink-0 border-b bg-card px-4 py-3 lg:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold tracking-normal">{title}</h2>
                {refreshing ? (
                  <Badge variant="secondary">
                    <Loader2 className="animate-spin" data-icon="inline-start" />
                    正在刷新
                  </Badge>
                ) : null}
              </div>
              <div className="mt-1 truncate text-sm text-muted-foreground">
                {currentProject.name || "未命名项目"}
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={refreshing}
              onClick={refreshProject}
            >
              {refreshing ? (
                <Loader2 className="animate-spin" data-icon="inline-start" />
              ) : null}
              刷新
            </Button>
          </div>
        </div>

        <div
          data-testid="project-detail-scroll-region"
          className={isAcceptanceTab
            ? "min-h-0 flex-1 overflow-y-auto p-4 [scrollbar-gutter:stable] lg:overflow-hidden lg:p-5"
            : "min-h-0 flex-1 overflow-y-auto p-4 [scrollbar-gutter:stable] lg:p-5"}
        >
          <div className="flex h-full min-h-0 min-w-0 flex-col gap-4">
            {error ? <StatusAlert>{error}</StatusAlert> : null}

            {isAcceptanceTab ? (
              <ProjectAcceptanceWorkbench
                project={currentProject}
                active={activeTab === "acceptances"}
                acceptanceId={acceptanceId}
                onAcceptanceIdChange={(id) => {
                  if (latestActiveTabRef.current !== "acceptances") return;
                  setAcceptanceId(id);
                  router.replace(
                    projectDetailHref(currentProject.id, "acceptances", id),
                    { scroll: false },
                  );
                }}
              />
            ) : activeTab === "logs" ? (
              <div className="flex flex-col gap-5">
                <ProjectConstructionStagesPanel
                  key={`logs-${currentProject.id}-${refreshVersion}`}
                  projectId={currentProject.id}
                  active={activeTab === "logs"}
                  compact
                />
                <ProjectLogsPanel project={currentProject} active={activeTab === "logs"} />
              </div>
            ) : activeTab === "members" ? (
              <div className="flex flex-col gap-4">
                <ProjectStatusPanel project={currentProject} />
                <ProjectMembersPanel
                  project={currentProject}
                  refreshing={refreshing}
                  onChanged={refreshProject}
                />
                <ProjectWorkflowRuntimePanel
                  project={currentProject}
                  active={activeTab === "members"}
                  compact
                  onChanged={refreshProject}
                />
              </div>
            ) : (
              <ProjectDetailOverviewPanel
                active={activeTab === "overview"}
                project={currentProject}
                refreshVersion={refreshVersion}
                onChanged={refreshProject}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
