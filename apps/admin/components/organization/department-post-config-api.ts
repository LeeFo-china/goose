import type { DepartmentPostRuleConfig } from "@/components/organization/organization-types";
import { requestBackendJson } from "@/lib/backend-client";

type SaveDepartmentPostCodesResult = {
  department_code?: string;
  selected_post_codes?: string[];
  config?: DepartmentPostRuleConfig;
};

export async function saveDepartmentPostCodes(
  departmentCode: string,
  postCodes: string[],
) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 20_000);

  try {
    const data = await requestBackendJson<SaveDepartmentPostCodesResult>(
      `/department-post-rules/${encodeURIComponent(departmentCode)}`,
      {
        method: "PUT",
        body: JSON.stringify({
          post_codes: postCodes,
        }),
        signal: controller.signal,
        fallbackMessage: "保存部门岗位失败",
      },
    );
    return { data };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("请求超时，请稍后重试");
    }
    throw err;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function fetchDepartmentPostRuleConfig() {
  return requestBackendJson<DepartmentPostRuleConfig>(
    "/department-post-rules",
    {
      cache: "no-store",
      fallbackMessage: "刷新部门岗位失败",
    },
  );
}

export async function createPostForDepartment(input: {
  name: string;
  departmentId: string;
}) {
  return requestBackendJson("/posts", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      tenant_department_id: input.departmentId,
      base_salary: null,
      salary_type: null,
      sort: 0,
      status: 1,
      description: null,
    }),
    fallbackMessage: "新增岗位失败",
  });
}

