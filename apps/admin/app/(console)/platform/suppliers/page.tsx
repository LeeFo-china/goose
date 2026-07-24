import Link from "next/link";
import { redirect } from "next/navigation";
import { PackageSearch } from "lucide-react";

import { PlatformListPageShell } from "@/components/platform/platform-list-shell";
import { normalizePlatformListPageSize } from "@/components/platform/platform-list-page-size";
import {
  platformTabsListClassName,
  platformTabsTriggerClassName,
} from "@/components/platform/platform-tabs";
import { PlatformSupplierFilters } from "@/components/platform-suppliers/platform-supplier-filters";
import { PlatformSupplierFormButton } from "@/components/platform-suppliers/platform-supplier-form";
import { PlatformSupplierTable } from "@/components/platform-suppliers/platform-supplier-table";
import { normalizeSupplierPage } from "@/components/platform-suppliers/platform-supplier-rules";
import {
  type PageData,
  type PlatformSupplierListItem,
  type SupplierOnboardingStatus,
  type SupplierOperationalStatus,
  type SupplierQualificationHealth,
  type SupplierQualificationType,
  type SupplierRecordStatus,
  type SupplierType,
} from "@/components/platform-suppliers/platform-supplier-types";
import { SupplierQualificationTypeFilters } from "@/components/platform-suppliers/supplier-qualification-type-filters";
import { SupplierQualificationTypeFormButton } from "@/components/platform-suppliers/supplier-qualification-type-form";
import { SupplierQualificationTypeTable } from "@/components/platform-suppliers/supplier-qualification-type-table";
import { CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getAdminSession, getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

const SUPPLIER_TYPES = [
  "manufacturer",
  "brand_agent",
  "distributor",
  "retailer",
  "other",
] as const;
const ONBOARDING_STATUSES = [
  "draft",
  "pending_review",
  "approved",
  "rejected",
] as const;
const OPERATIONAL_STATUSES = ["active", "suspended", "blacklisted"] as const;
const QUALIFICATION_HEALTHS = [
  "valid",
  "expiring",
  "expired",
  "missing",
] as const;
const RECORD_STATUSES = ["active", "inactive"] as const;

type SupplierView = "suppliers" | "qualification-types";
type SearchParams = Promise<{
  view?: string;
  page?: string;
  pageSize?: string;
  keyword?: string;
  supplier_type?: string;
  onboarding_status?: string;
  operational_status?: string;
  qualification_health?: string;
  status?: string;
}>;

function readEnum<Value extends string>(
  value: string | undefined,
  values: readonly Value[],
) {
  return values.includes(value as Value) ? (value as Value) : "";
}

function emptyPage<RecordType>(page: number, pageSize: number) {
  return {
    list: [] as RecordType[],
    pagination: { page, pageSize, total: 0, totalPages: 0 },
  };
}

function buildSupplierQuery(input: {
  page: number;
  pageSize: number;
  keyword: string;
  supplierType: SupplierType | "";
  onboardingStatus: SupplierOnboardingStatus | "";
  operationalStatus: SupplierOperationalStatus | "";
  qualificationHealth: SupplierQualificationHealth | "";
}) {
  const query = new URLSearchParams();
  query.set("page", String(input.page));
  query.set("pageSize", String(input.pageSize));
  if (input.keyword) query.set("keyword", input.keyword);
  if (input.supplierType) query.set("supplier_type", input.supplierType);
  if (input.onboardingStatus) {
    query.set("onboarding_status", input.onboardingStatus);
  }
  if (input.operationalStatus) {
    query.set("operational_status", input.operationalStatus);
  }
  if (input.qualificationHealth) {
    query.set("qualification_health", input.qualificationHealth);
  }
  return query.toString();
}

function buildQualificationTypeQuery(input: {
  page: number;
  pageSize: number;
  keyword: string;
  supplierType: SupplierType | "";
  status: SupplierRecordStatus | "";
}) {
  const query = new URLSearchParams();
  query.set("page", String(input.page));
  query.set("pageSize", String(input.pageSize));
  if (input.keyword) query.set("keyword", input.keyword);
  if (input.supplierType) query.set("supplier_type", input.supplierType);
  if (input.status) query.set("status", input.status);
  return query.toString();
}

async function getPlatformPage<RecordType>(path: string) {
  const token = await getAdminToken();
  if (!token) throw new Error("缺少登录凭证");
  const response = await fetch(buildBackendUrl(path), {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const payload = await parseBackendJson<PageData<RecordType>>(response);
  if (!payload.data) throw new Error("接口未返回列表数据");
  return payload.data;
}

export default async function PlatformSuppliersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const permissions = new Set(session.permissions.map((item) => item.code));
  const isPlatformAdmin = session.roles.includes("platform_admin");
  const canView = isPlatformAdmin && permissions.has("platform.supplier.view");
  const canManage =
    isPlatformAdmin && permissions.has("platform.supplier.manage");
  const canReview =
    isPlatformAdmin && permissions.has("platform.supplier.review");
  const canBlacklist =
    isPlatformAdmin && permissions.has("platform.supplier.blacklist");
  const params = await searchParams;
  const requestedView: SupplierView =
    params.view === "qualification-types" ? "qualification-types" : "suppliers";
  const view = requestedView === "qualification-types" && !canManage
    ? "suppliers"
    : requestedView;
  const page = normalizeSupplierPage(params.page);
  const pageSize = normalizePlatformListPageSize(params.pageSize);
  const keyword = (params.keyword || "").trim().slice(0, 80);
  const supplierType = readEnum(params.supplier_type, SUPPLIER_TYPES);
  const onboardingStatus = readEnum(
    params.onboarding_status,
    ONBOARDING_STATUSES,
  );
  const operationalStatus = readEnum(
    params.operational_status,
    OPERATIONAL_STATUSES,
  );
  const qualificationHealth = readEnum(
    params.qualification_health,
    QUALIFICATION_HEALTHS,
  );
  const status = readEnum(params.status, RECORD_STATUSES);

  let suppliers = emptyPage<PlatformSupplierListItem>(page, pageSize);
  let qualificationTypes = emptyPage<SupplierQualificationType>(page, pageSize);
  let error: string | null = null;

  if (!canView) {
    error = "当前账号缺少供应商查看权限";
  } else {
    try {
      if (view === "suppliers") {
        const query = buildSupplierQuery({
          page,
          pageSize,
          keyword,
          supplierType,
          onboardingStatus,
          operationalStatus,
          qualificationHealth,
        });
        suppliers = await getPlatformPage(`/platform/suppliers?${query}`);
      } else {
        const query = buildQualificationTypeQuery({
          page,
          pageSize,
          keyword,
          supplierType,
          status,
        });
        qualificationTypes = await getPlatformPage(
          `/platform/supplier-qualification-types?${query}`,
        );
      }
    } catch (caught) {
      error = caught instanceof Error ? caught.message : "供应商数据加载失败";
    }
  }

  const currentPage = view === "suppliers" ? suppliers : qualificationTypes;

  return (
    <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-5 overflow-hidden">
      <Tabs value={view} className="contents">
        <PlatformListPageShell
          title="供应商管理"
          description="维护平台供应商准入、资质风险和运营状态，所有变更保留可追溯记录。"
          leading={
            <span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground">
              <PackageSearch className="size-4" aria-hidden="true" />
            </span>
          }
          action={
            canManage
              ? view === "suppliers"
                ? <PlatformSupplierFormButton />
                : <SupplierQualificationTypeFormButton />
              : null
          }
          error={error}
          tabs={
            <div className="overflow-x-auto">
              <TabsList className={platformTabsListClassName}>
              <TabsTrigger
                value="suppliers"
                className={platformTabsTriggerClassName}
                asChild
              >
                <Link href="/platform/suppliers">供应商列表</Link>
              </TabsTrigger>
              {canManage ? (
                <TabsTrigger
                  value="qualification-types"
                  className={platformTabsTriggerClassName}
                  asChild
                >
                  <Link href="/platform/suppliers?view=qualification-types">
                    资质类型
                  </Link>
                </TabsTrigger>
              ) : null}
              </TabsList>
            </div>
          }
          listHeader={
            <CardTitle>
              {view === "suppliers" ? "供应商列表" : "资质类型"}
            </CardTitle>
          }
          filters={
            view === "suppliers" ? (
              <PlatformSupplierFilters
                keyword={keyword}
                supplierType={supplierType}
                onboardingStatus={onboardingStatus}
                operationalStatus={operationalStatus}
                qualificationHealth={qualificationHealth}
                view={view}
              />
            ) : (
              <SupplierQualificationTypeFilters
                keyword={keyword}
                supplierType={supplierType}
                status={status}
              />
            )
          }
          pagination={currentPage.pagination}
          currentCount={currentPage.list.length}
          tableViewportTestId="platform-supplier-list-table-viewport"
          unit={view === "suppliers" ? "个供应商" : "个资质类型"}
        >
          {view === "suppliers" ? (
            <PlatformSupplierTable
              suppliers={suppliers.list}
              canManage={canManage}
              canReview={canReview}
              canBlacklist={canBlacklist}
            />
          ) : (
            <SupplierQualificationTypeTable
              records={qualificationTypes.list}
              pagination={qualificationTypes.pagination}
            />
          )}
        </PlatformListPageShell>
      </Tabs>
    </div>
  );
}
