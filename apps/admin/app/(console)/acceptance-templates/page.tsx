import { ClipboardCheck } from "lucide-react";
import { AcceptanceTemplateManagementShell } from "@/components/acceptance-templates/acceptance-template-management-shell";
import type {
  AcceptanceTemplateFilters,
  AcceptanceTemplateListData,
} from "@/components/acceptance-templates/acceptance-template-types";
import { getTenantBusinessAccessDenied } from "@/components/layout/platform-mode-access-denied";
import { getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

type AcceptanceTemplatePageSearchParams = {
  acceptance_type?: string | string[];
  stage_code?: string | string[];
  status?: string | string[];
  template_id?: string | string[];
};

function firstSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeTextParam(value: string | string[] | undefined) {
  return firstSearchParam(value)?.trim() || "";
}

function getFilters(
  params: AcceptanceTemplatePageSearchParams,
): AcceptanceTemplateFilters {
  return {
    acceptanceType: normalizeTextParam(params.acceptance_type),
    stageCode: normalizeTextParam(params.stage_code),
    status: normalizeTextParam(params.status),
    templateId: normalizeTextParam(params.template_id),
  };
}

async function getAcceptanceTemplates(filters: AcceptanceTemplateFilters) {
  const token = await getAdminToken();
  if (!token) {
    return {
      list: [],
      error: "缺少登录凭证",
    };
  }

  const query = new URLSearchParams();
  if (filters.acceptanceType) {
    query.set("acceptance_type", filters.acceptanceType);
  }
  if (filters.stageCode) query.set("stage_code", filters.stageCode);
  if (filters.status) query.set("status", filters.status);

  try {
    const response = await fetch(
      buildBackendUrl(`/project-acceptance-templates?${query}`),
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      },
    );
    const payload = await parseBackendJson<AcceptanceTemplateListData>(response);
    return {
      list: payload.data?.list || [],
      error: null,
    };
  } catch (error) {
    return {
      list: [],
      error: error instanceof Error ? error.message : "验收模板加载失败",
    };
  }
}

export default async function AcceptanceTemplatesPage({
  searchParams,
}: {
  searchParams: Promise<AcceptanceTemplatePageSearchParams>;
}) {
  const accessDenied = await getTenantBusinessAccessDenied();
  if (accessDenied) return accessDenied;

  const params = await searchParams;
  const filters = getFilters(params);
  const { list, error } = await getAcceptanceTemplates(filters);

  return (
    <div className="flex h-[calc(100dvh-6.5rem)] min-h-0 flex-col gap-5 overflow-hidden">
      <div className="flex shrink-0 flex-col justify-between gap-3 md:flex-row md:items-end">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground">
            <ClipboardCheck aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-normal">验收模板</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              维护工序和竣工验收的分组、检查项、拍照和备注要求。当前筛选共 {list.length} 个模板。
            </p>
          </div>
        </div>
      </div>

      <AcceptanceTemplateManagementShell
        templates={list}
        filters={filters}
        error={error}
      />
    </div>
  );
}
