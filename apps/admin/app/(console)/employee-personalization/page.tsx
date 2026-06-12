import { Sparkles } from "lucide-react";
import { EmployeePersonalizationClient } from "@/components/employee-personalization/employee-personalization-client";
import type { EmployeePersonalizationListData } from "@/components/employee-personalization/employee-personalization-types";
import { getTenantBusinessAccessDenied } from "@/components/layout/platform-mode-access-denied";
import { getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

const EMPTY_DATA: EmployeePersonalizationListData = {
  list: [],
  pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
  options: {
    employees: [],
    departments: [],
    posts: [],
    roles: [],
  },
};

async function getRules() {
  const token = await getAdminToken();
  if (!token) {
    return { data: EMPTY_DATA, error: "缺少登录凭证" };
  }

  try {
    const response = await fetch(
      buildBackendUrl("/admin/employee-personalization-rules?page=1&pageSize=20"),
      {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      },
    );
    const payload = await parseBackendJson<EmployeePersonalizationListData>(response);
    return { data: payload.data || EMPTY_DATA, error: null };
  } catch (error) {
    return {
      data: EMPTY_DATA,
      error: error instanceof Error ? error.message : "个性化规则加载失败",
    };
  }
}

export default async function EmployeePersonalizationPage() {
  const accessDenied = await getTenantBusinessAccessDenied();
  if (accessDenied) return accessDenied;

  const { data, error } = await getRules();

  return (
    <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-5 overflow-hidden">
      <div className="shrink-0 flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground">
            <Sparkles aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-normal">员工个性化</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              配置员工登录后按部门、岗位和角色命中的首页内容。当前共 {data.pagination.total} 条规则。
            </p>
          </div>
        </div>
      </div>

      <EmployeePersonalizationClient data={data} error={error} />
    </div>
  );
}
