import { notFound } from "next/navigation";
import { StatusAlert } from "@/components/admin/status-alert";
import { ProjectDetailPageClient } from "@/components/projects/project-detail-page-client";
import { parseProjectDetailTab } from "@/components/projects/project-detail-page-tabs";
import type { ProjectRecord } from "@/components/projects/project-mutations";
import { getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

type ProjectDetailPageParams = {
  id: string;
};

type ProjectDetailPageSearchParams = {
  tab?: string;
  acceptanceId?: string;
};

async function getProject(projectId: string) {
  const token = await getAdminToken();
  if (!token) {
    return { project: null, error: "缺少登录凭证" };
  }

  try {
    const response = await fetch(buildBackendUrl(`/projects/${projectId}`), {
      headers: {
        authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    if (response.status === 404) {
      return { project: null, error: null };
    }

    const payload = await parseBackendJson<ProjectRecord>(response);
    return { project: payload.data || null, error: null };
  } catch (error) {
    return {
      project: null,
      error: error instanceof Error ? error.message : "项目详情加载失败",
    };
  }
}

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<ProjectDetailPageParams>;
  searchParams: Promise<ProjectDetailPageSearchParams>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const { project, error } = await getProject(id);

  if (!project && !error) {
    notFound();
  }

  if (!project) {
    return <StatusAlert>{error || "项目不存在"}</StatusAlert>;
  }

  return (
    <ProjectDetailPageClient
      project={project}
      initialTab={parseProjectDetailTab(query.tab)}
      initialAcceptanceId={query.acceptanceId || ""}
    />
  );
}
