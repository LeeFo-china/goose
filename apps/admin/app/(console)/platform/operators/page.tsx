import { redirect } from "next/navigation";
import { Shield } from "lucide-react";
import type { EmployeeStatus } from "@gooes/domain";

import { PlatformListPageShell } from "@/components/platform/platform-list-shell";
import { normalizePlatformListPageSize } from "@/components/platform/platform-list-page-size";
import { PlatformOperatorFormButton } from "@/components/platform-operators/platform-operator-actions";
import { PlatformOperatorFilters } from "@/components/platform-operators/platform-operator-filters";
import {
  buildPlatformOperatorQuery,
  cleanPlatformOperatorParam,
  getPlatformOperatorCurrentCount,
  normalizePlatformOperatorPage,
  normalizePlatformOperatorStatus,
} from "@/components/platform-operators/platform-operator-rules";
import { PlatformOperatorsTable } from "@/components/platform-operators/platform-operator-table";
import type {
  PageData,
  PlatformOperator,
  PlatformRoleOption,
} from "@/components/platform-operators/platform-operator-types";
import { getAdminSession, getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";
import { isPlatformOnlySession } from "@/lib/session-mode";

const READ_PERMISSION = "platform.operator.read";
const MANAGE_PERMISSION = "platform.operator.manage";

type SearchParams = Promise<{
  page?: string;
  pageSize?: string;
  keyword?: string;
  status?: string;
  roleId?: string;
}>;

function emptyPage(page: number, pageSize: number): PageData<PlatformOperator> {
  return {
    list: [],
    pagination: { page, pageSize, total: 0, totalPages: 0 },
  };
}

async function fetchBackend<T>(path: string, fallback: T) {
  const token = await getAdminToken();
  if (!token) return { data: fallback, error: "缺少登录凭证" };

  try {
    const response = await fetch(buildBackendUrl(path), {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const payload = await parseBackendJson<T>(response);
    return { data: payload.data || fallback, error: null };
  } catch (caught) {
    return {
      data: fallback,
      error: caught instanceof Error ? caught.message : "平台人员数据加载失败",
    };
  }
}

async function getOperatorsPage(query: string) {
  const token = await getAdminToken();
  if (!token) return { data: emptyPage(1, 20), error: "缺少登录凭证" };

  try {
    const response = await fetch(buildBackendUrl(`/platform/operators?${query}`), {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const payload = await parseBackendJson<PageData<PlatformOperator>>(response);
    return { data: payload.data || emptyPage(1, 20), error: null };
  } catch (caught) {
    return {
      data: emptyPage(1, 20),
      error: caught instanceof Error ? caught.message : "平台人员数据加载失败",
    };
  }
}

async function getPlatformRoleOptions() {
  return fetchBackend<PageData<PlatformRoleOption>>(
    "/platform/roles?page=1&pageSize=100&status=active",
    { list: [], pagination: { page: 1, pageSize: 100, total: 0, totalPages: 0 } },
  );
}

export default async function PlatformOperatorsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const permissions = new Set(session.permissions.map((item) => item.code));
  const isPlatformAdmin = isPlatformOnlySession(session);
  const canRead = isPlatformAdmin && permissions.has(READ_PERMISSION);
  const canManage = isPlatformAdmin && permissions.has(MANAGE_PERMISSION);
  const params = await searchParams;
  const page = normalizePlatformOperatorPage(params.page);
  const pageSize = normalizePlatformListPageSize(params.pageSize);
  const keyword = cleanPlatformOperatorParam(params.keyword);
  const status = normalizePlatformOperatorStatus(params.status);
  const roleId = cleanPlatformOperatorParam(params.roleId);

  let operators = emptyPage(page, pageSize);
  let roles: PlatformRoleOption[] = [];
  let error: string | null = null;

  if (!canRead) {
    error = "当前账号缺少平台人员查看权限";
  } else {
    const queryPath = buildPlatformOperatorQuery({
      page,
      pageSize,
      keyword,
      status: status as EmployeeStatus | "",
      roleId,
    });
    const query = queryPath.replace("/platform/operators?", "");
    const [operatorResult, roleResult] = await Promise.all([
      getOperatorsPage(query),
      getPlatformRoleOptions(),
    ]);
    operators = {
      ...operatorResult.data,
      pagination: operatorResult.data.pagination.pageSize === pageSize
        ? operatorResult.data.pagination
        : { ...operatorResult.data.pagination, page, pageSize },
    };
    roles = roleResult.data.list;
    error = operatorResult.error || roleResult.error;
  }

  return (
    <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-5 overflow-hidden">
      <PlatformListPageShell
        title="平台人员"
        description="管理平台超管和运营人员，明确角色权限、账号状态和登录会话边界。"
        leading={
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground">
            <Shield aria-hidden="true" />
          </span>
        }
        action={canRead && canManage ? (
          <PlatformOperatorFormButton roles={roles} />
        ) : null}
        error={error}
        filters={
          <PlatformOperatorFilters
            keyword={keyword}
            status={status}
            roleId={roleId}
            roles={roles}
          />
        }
        pagination={operators.pagination}
        currentCount={getPlatformOperatorCurrentCount({
          operators: operators.list,
          pageSize,
          total: operators.pagination.total,
        })}
        tableViewportTestId="platform-operators-table-viewport"
        unit="人"
      >
        <PlatformOperatorsTable
          operators={operators.list}
          roles={roles}
          canManage={canManage}
        />
      </PlatformListPageShell>
    </div>
  );
}
