import { notFound } from "next/navigation";
import { WorkflowDesignerShell } from "@/components/workflows/workflow-designer-shell";
import type { WorkflowDefinitionDetail } from "@/components/workflows/workflow-types";
import { getTenantBusinessAccessDenied } from "@/components/layout/platform-mode-access-denied";
import { getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

type WorkflowDesignerPageParams = {
  id: string;
};

async function getWorkflowDetail(id: string) {
  const token = await getAdminToken();
  if (!token) {
    return {
      detail: null,
      error: "缺少登录凭证",
    };
  }

  try {
    const response = await fetch(buildBackendUrl(`/workflows/${id}`), {
      headers: {
        authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    if (response.status === 404) {
      return { detail: null, error: null };
    }

    const payload = await parseBackendJson<WorkflowDefinitionDetail>(response);
    return {
      detail: payload.data || null,
      error: null,
    };
  } catch (error) {
    return {
      detail: null,
      error: error instanceof Error ? error.message : "流程详情加载失败",
    };
  }
}

export default async function WorkflowDesignerPage({
  params,
}: {
  params: Promise<WorkflowDesignerPageParams>;
}) {
  const accessDenied = await getTenantBusinessAccessDenied();
  if (accessDenied) return accessDenied;

  const { id } = await params;
  const { detail, error } = await getWorkflowDetail(id);

  if (!detail && !error) {
    notFound();
  }

  return (
    <WorkflowDesignerShell
      workflowId={id}
      initialDetail={detail}
      initialError={error}
    />
  );
}
