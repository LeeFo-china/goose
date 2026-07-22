import { redirect } from "next/navigation";
import { PlatformOcrFilters } from "@/components/platform-ocr/platform-ocr-filters";
import { PlatformOcrTable } from "@/components/platform-ocr/platform-ocr-page";
import {
  platformOcrDocumentOptions,
  platformOcrStatusOptions,
  type PlatformOcrRecognitionListData,
} from "@/components/platform-ocr/platform-ocr-types";
import { PlatformListPageShell } from "@/components/platform/platform-list-shell";
import { normalizePlatformListPageSize } from "@/components/platform/platform-list-page-size";
import { getAdminSession, getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

type SearchParams = Promise<{
  page?: string;
  pageSize?: string;
  status?: string;
  document_type?: string;
  tenant_id?: string;
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
  const status = STATUS_VALUES.has(params.status ?? "") ? params.status ?? "" : "";
  const documentType = DOCUMENT_VALUES.has(params.document_type ?? "")
    ? params.document_type ?? ""
    : "";
  const tenantId = UUID_PATTERN.test(params.tenant_id ?? "")
    ? params.tenant_id ?? ""
    : "";
  const hasPlatformAccess = session.roles.includes("platform_admin");
  const { list, pagination, error } = hasPlatformAccess
    ? await getPlatformOcrRecognitions({ page, pageSize, status, documentType, tenantId })
    : {
      list: [],
      pagination: { page, pageSize, total: 0, totalPages: 0 },
      error: "当前账号不是平台超管，无法查看 OCR 调用记录",
    };

  return (
    <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-5 overflow-hidden">
      <PlatformListPageShell
        title="证照识别"
        description="查看腾讯云 OCR 调用状态、计费单元与安全诊断，不展示证照内容和识别字段。"
        error={error}
        filters={(
          <PlatformOcrFilters
            pageSize={pageSize}
            status={status}
            documentType={documentType}
            tenantId={tenantId}
          />
        )}
        pagination={pagination}
        currentCount={list.length}
        tableViewportTestId="platform-ocr-list-table-viewport"
        unit="条调用记录"
      >
        <PlatformOcrTable records={list} />
      </PlatformListPageShell>
    </div>
  );
}
