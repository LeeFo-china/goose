import { redirect } from "next/navigation";
import Link from "next/link";
import { PlatformOcrFilters } from "@/components/platform-ocr/platform-ocr-filters";
import { PlatformOcrTable } from "@/components/platform-ocr/platform-ocr-page";
import { PlatformOcrTenantPolicyFilters } from "@/components/platform-ocr/platform-ocr-tenant-policy-filters";
import { PlatformOcrTenantPolicyTable } from "@/components/platform-ocr/platform-ocr-tenant-policy-table";
import {
  platformOcrDocumentOptions,
  platformOcrStatusOptions,
  type PlatformOcrRecognitionListData,
  type PlatformOcrTenantPolicyListData,
} from "@/components/platform-ocr/platform-ocr-types";
import { PlatformListPageShell } from "@/components/platform/platform-list-shell";
import { normalizePlatformListPageSize } from "@/components/platform/platform-list-page-size";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getAdminSession, getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

type SearchParams = Promise<{
  page?: string;
  pageSize?: string;
  status?: string;
  document_type?: string;
  tenant_id?: string;
  view?: string;
  keyword?: string;
  enabled?: string;
}>;

const STATUS_VALUES = new Set<string>(
  platformOcrStatusOptions.map((item) => item.value),
);
const DOCUMENT_VALUES = new Set<string>(
  platformOcrDocumentOptions.map((item) => item.value),
);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function buildQuery(input: {
  page: number;
  pageSize: number;
  status: string;
  documentType: string;
  tenantId: string;
}) {
  const query = new URLSearchParams();
  query.set("page", String(input.page));
  query.set("pageSize", String(input.pageSize));
  if (input.status) query.set("status", input.status);
  if (input.documentType) query.set("document_type", input.documentType);
  if (input.tenantId) query.set("tenant_id", input.tenantId);
  return query.toString();
}

async function getPlatformOcrRecognitions(input: {
  page: number;
  pageSize: number;
  status: string;
  documentType: string;
  tenantId: string;
}) {
  const token = await getAdminToken();
  if (!token) {
    return {
      list: [],
      pagination: { page: input.page, pageSize: input.pageSize, total: 0, totalPages: 0 },
      error: "缺少登录凭证",
    };
  }

  try {
    const query = buildQuery(input);
    const response = await fetch(
      buildBackendUrl(`/platform/ocr/recognitions?${query}`),
      {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      },
    );
    const payload = await parseBackendJson<PlatformOcrRecognitionListData>(response);
    return {
      ...(payload.data || {
        list: [],
        pagination: { page: input.page, pageSize: input.pageSize, total: 0, totalPages: 0 },
      }),
      error: null,
    };
  } catch (error) {
    return {
      list: [],
      pagination: { page: input.page, pageSize: input.pageSize, total: 0, totalPages: 0 },
      error: error instanceof Error ? error.message : "OCR 调用记录加载失败",
    };
  }
}

async function getPlatformOcrTenantPolicies(input: {
  page: number;
  pageSize: number;
  keyword: string;
  enabled: string;
}) {
  const token = await getAdminToken();
  const empty = {
    list: [],
    pagination: { page: input.page, pageSize: input.pageSize, total: 0, totalPages: 0 },
  };
  if (!token) return { ...empty, error: "缺少登录凭证" };

  try {
    const query = new URLSearchParams();
    query.set("page", String(input.page));
    query.set("pageSize", String(input.pageSize));
    if (input.keyword) query.set("keyword", input.keyword);
    if (input.enabled) query.set("enabled", input.enabled);
    const response = await fetch(
      buildBackendUrl(`/platform/ocr/tenant-policies?${query.toString()}`),
      {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      },
    );
    const payload = await parseBackendJson<PlatformOcrTenantPolicyListData>(response);
    return { ...(payload.data || empty), error: null };
  } catch (error) {
    return {
      ...empty,
      error: error instanceof Error ? error.message : "OCR 租户灰度策略加载失败",
    };
  }
}

export default async function PlatformOcrPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const params = await searchParams;
  const page = readPositiveInteger(params.page, 1);
  const pageSize = normalizePlatformListPageSize(params.pageSize);
  const view = params.view === "tenants" ? "tenants" : "recognitions";
  const status = STATUS_VALUES.has(params.status ?? "") ? params.status ?? "" : "";
  const documentType = DOCUMENT_VALUES.has(params.document_type ?? "")
    ? params.document_type ?? ""
    : "";
  const tenantId = UUID_PATTERN.test(params.tenant_id ?? "")
    ? params.tenant_id ?? ""
    : "";
  const keyword = (params.keyword ?? "").trim().slice(0, 80);
  const enabled = params.enabled === "true" || params.enabled === "false"
    ? params.enabled
    : "";
  const hasPlatformAccess = session.roles.includes("platform_admin");
  const result = hasPlatformAccess
    ? view === "tenants"
      ? await getPlatformOcrTenantPolicies({ page, pageSize, keyword, enabled })
      : await getPlatformOcrRecognitions({ page, pageSize, status, documentType, tenantId })
    : {
      list: [],
      pagination: { page, pageSize, total: 0, totalPages: 0 },
      error: "当前账号不是平台超管，无法查看 OCR 运营数据",
    };
  const tabs = (
    <Tabs defaultValue={view}>
      <TabsList>
        <TabsTrigger value="recognitions" asChild>
          <Link href={`/platform/ocr?pageSize=${pageSize}`}>调用记录</Link>
        </TabsTrigger>
        <TabsTrigger value="tenants" asChild>
          <Link href={`/platform/ocr?view=tenants&pageSize=${pageSize}`}>租户灰度</Link>
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );

  return (
    <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-5 overflow-hidden">
      <PlatformListPageShell
        title="证照识别"
        description={view === "tenants"
          ? "按租户控制真实 OCR 调用能力、允许的证照类型和每日额度。"
          : "查看腾讯云 OCR 调用状态、计费单元与安全诊断，不展示证照内容和识别字段。"}
        error={result.error}
        tabs={tabs}
        summary={view === "tenants" ? (
          <Alert>
            <AlertTitle>总开关优先</AlertTitle>
            <AlertDescription>
              平台总开关关闭时，所有租户灰度策略均不生效。
            </AlertDescription>
          </Alert>
        ) : null}
        filters={view === "tenants" ? (
          <PlatformOcrTenantPolicyFilters
            pageSize={pageSize}
            keyword={keyword}
            enabled={enabled}
          />
        ) : (
          <PlatformOcrFilters
            pageSize={pageSize}
            status={status}
            documentType={documentType}
            tenantId={tenantId}
          />
        )}
        pagination={result.pagination}
        currentCount={result.list.length}
        tableViewportTestId={view === "tenants"
          ? "platform-ocr-tenant-policy-table-viewport"
          : "platform-ocr-list-table-viewport"}
        unit={view === "tenants" ? "个租户" : "条调用记录"}
      >
        {view === "tenants"
          ? <PlatformOcrTenantPolicyTable records={result.list as PlatformOcrTenantPolicyListData["list"]} />
          : <PlatformOcrTable records={result.list as PlatformOcrRecognitionListData["list"]} />}
      </PlatformListPageShell>
    </div>
  );
}
