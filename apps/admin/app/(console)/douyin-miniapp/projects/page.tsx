import { redirect } from "next/navigation";

import { StatusAlert } from "@/components/admin/status-alert";
import { ProjectPublication } from
  "@/components/douyin-miniapp/project-publication";
import {
  normalizeProjectPage,
  type ProjectPublicationPage,
} from "@/components/douyin-miniapp/project-publication-logic";
import { getAdminSession, getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

const MANAGE_PERMISSION = "douyin_miniapp.manage";
const PAGE_SIZE = 20;
const PUBLICATION_STATUSES = new Set(["draft", "published", "hidden"]);

type PageSearchParams = {
  page?: string;
  publicationStatus?: string;
};

function normalizePage(value: string | undefined): number {
  const page = Number(value || 1);
  return Number.isFinite(page) && page >= 1
    ? Math.min(10_000, Math.floor(page))
    : 1;
}

function normalizePublicationStatus(value: string | undefined): string {
  const status = value?.trim() || "";
  return PUBLICATION_STATUSES.has(status) ? status : "";
}

function emptyPage(page: number): ProjectPublicationPage {
  return {
    list: [],
    pagination: {
      page,
      pageSize: PAGE_SIZE,
      total: 0,
      totalPages: 0,
    },
  };
}

export default async function TenantDouyinProjectPublicationPage({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  const [session, token, params] = await Promise.all([
    getAdminSession(),
    getAdminToken(),
    searchParams,
  ]);
  if (!session) redirect("/login");

  const page = normalizePage(params.page);
  const publicationStatus = normalizePublicationStatus(
    params.publicationStatus,
  );
  const canManage = session.tenant !== null && session.permissions.some(
    (permission) => permission.code === MANAGE_PERMISSION,
  );
  let data = emptyPage(page);
  let error: string | null = null;

  if (!canManage) {
    error = "当前账号缺少抖音小程序项目内容管理权限";
  } else if (!token) {
    error = "缺少登录凭证，请重新登录后重试";
  } else {
    const query = new URLSearchParams({
      page: String(page),
      pageSize: "20",
    });
    if (publicationStatus) {
      query.set("publicationStatus", publicationStatus);
    }

    try {
      const response = await fetch(
        buildBackendUrl(`/tenant/douyin-miniapp/projects?${query}`),
        {
          headers: { authorization: `Bearer ${token}` },
          cache: "no-store",
        },
      );
      const payload = await parseBackendJson<unknown>(response);
      const parsed = normalizeProjectPage(payload.data, {
        page,
        pageSize: PAGE_SIZE,
      });
      if (!parsed) {
        error = "项目列表分页数据无效，请刷新后重试";
      } else {
        data = parsed;
      }
    } catch (loadError) {
      error = loadError instanceof Error
        ? loadError.message
        : "项目实景内容加载失败";
    }
  }

  if (!canManage) {
    return <StatusAlert>{error}</StatusAlert>;
  }

  return (
    <ProjectPublication
      initialData={data}
      initialError={error}
      initialPublicationStatus={publicationStatus}
    />
  );
}
