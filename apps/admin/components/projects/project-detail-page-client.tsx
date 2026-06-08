"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProjectDetailSideRail } from "@/components/projects/project-detail-side-rail";
import {
  projectDetailHref,
  type ProjectDetailPageTab,
} from "@/components/projects/project-detail-page-tabs";
import type { ProjectRecord } from "@/components/projects/project-mutation-types";
import { requestProject } from "@/components/projects/project-mutation-utils";

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
  const refreshRequestIdRef = useRef(0);
  const [currentProject, setCurrentProject] = useState(project);
  const [activeTab, setActiveTab] = useState<ProjectDetailPageTab>(initialTab);
  const [acceptanceId, setAcceptanceId] = useState(initialAcceptanceId);
  const [refreshing, startRefreshTransition] = useTransition();
  const [error, setError] = useState("");

  useEffect(() => {
    latestProjectIdRef.current = project.id;
    setCurrentProject(project);
    setError("");
  }, [project]);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

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
    setActiveTab(tab);
    if (tab === "acceptances") {
      setAcceptanceId(nextAcceptanceId);
    }
    router.push(projectDetailHref(currentProject.id, tab, nextAcceptanceId));
  }

  function refreshProject() {
    const projectId = currentProject.id;
    const requestId = refreshRequestIdRef.current + 1;
    refreshRequestIdRef.current = requestId;
    setError("");
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
      }
    });
  }

  return (
    <div className="grid min-h-[calc(100vh-4rem)] gap-0 lg:grid-cols-[280px_minmax(0,1fr)]">
      <ProjectDetailSideRail
        project={currentProject}
        activeTab={activeTab}
        onNavigate={navigate}
      />

      <main className="min-w-0 p-4 lg:p-6">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
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

          {error ? <StatusAlert>{error}</StatusAlert> : null}

          {activeTab === "acceptances" ? (
            <section
              data-acceptance-id={acceptanceId}
              className="rounded-md border bg-card p-5 text-sm text-muted-foreground"
            >
              工序验收工作区加载中
            </section>
          ) : (
            <section className="rounded-md border bg-card p-5 text-sm text-muted-foreground">
              {title} 模块加载中
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
