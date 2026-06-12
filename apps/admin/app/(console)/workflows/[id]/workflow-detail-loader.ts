import type { WorkflowDefinitionDetail } from "@/components/workflows/workflow-types";
import { getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

export type WorkflowDesignerPageParams = {
  id: string;
};

export async function getWorkflowDetail(id: string) {
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
