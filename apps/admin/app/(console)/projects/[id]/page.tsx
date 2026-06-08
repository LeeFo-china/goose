import { notFound } from "next/navigation";
import { StatusAlert } from "@/components/admin/status-alert";
import { getTenantBusinessAccessDenied } from "@/components/layout/platform-mode-access-denied";
import { ProjectDetailPageClient } from "@/components/projects/project-detail-page-client";
import { parseProjectDetailTab } from "@/components/projects/project-detail-page-tabs";
import type { ProjectRecord } from "@/components/projects/project-mutations";
import { getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

type ProjectDetailPageParams = {
  id: string;
};

type ProjectDetailPageSearchParams = {
  tab?: string | string[];
  acceptanceId?: string | string[];
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
  } catch {
    return {
      project: null,
      error: "项目详情加载失败",
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
  const accessDenied = await getTenantBusinessAccessDenied();
  if (accessDenied) return accessDenied;

  const [{ id }, query] = await Promise.all([params, searchParams]);
  const { project, error } = await getProject(id);
  const initialAcceptanceId = Array.isArray(query.acceptanceId)
    ? query.acceptanceId[0] || ""
    : query.acceptanceId || "";

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
      initialAcceptanceId={initialAcceptanceId}
    />
  );
}
