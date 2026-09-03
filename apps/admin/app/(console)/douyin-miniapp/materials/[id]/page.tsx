import { notFound, redirect } from "next/navigation";
import type {
  DouyinMaterialNoteTenantDetail,
  DouyinMaterialNoteTenantVersionList,
} from "@gooes/domain";
import { z } from "zod";

import { StatusAlert } from "@/components/admin/status-alert";
import { MaterialNoteDetail } from
  "@/components/douyin-miniapp/material-note-detail";
import {
  assertMaterialNoteRequestedPage,
  getMaterialNotePermissions,
  parseMaterialNoteDetail,
  parseMaterialNoteVersionList,
} from "@/components/douyin-miniapp/material-note-contract";
import { getAdminSession, getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

const MANAGE_PERMISSION = "douyin_material_note.manage";
const PUBLISH_PERMISSION = "douyin_material_note.publish";
const MATERIAL_NOTE_VERSION_PAGE_SIZE = 3;

type LoadResult<T> = {
  data: T | null;
  error: string | null;
  status: number;
};

async function loadResource<T>(
  token: string,
  path: string,
  parser: (value: unknown) => T,
  fallbackMessage: string,
): Promise<LoadResult<T>> {
  try {
    const response = await fetch(buildBackendUrl(path), {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (response.status === 404) {
      return { data: null, error: "资料或版本不存在", status: 404 };
    }
    const payload = await parseBackendJson<unknown>(response);
    return { data: parser(payload.data), error: null, status: response.status };
  } catch (error) {
    const status = typeof error === "object" && error !== null && "status" in error
      ? Number((error as { status?: unknown }).status) || 500
      : 500;
    return {
      data: null,
      error: error instanceof Error ? error.message : fallbackMessage,
      status,
    };
  }
}

export default async function TenantMaterialNoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [session, token, rawParams] = await Promise.all([
    getAdminSession(),
    getAdminToken(),
    params,
  ]);
  if (!session) redirect("/login");

  const permissionCodes = session.permissions.map((permission) => permission.code);
  const permissions = getMaterialNotePermissions(permissionCodes);
  if (session.tenant === null || !permissions.canRead) {
    return <StatusAlert>当前账号缺少 douyin_material_note.read 权限</StatusAlert>;
  }
  if (!z.string().uuid().safeParse(rawParams.id).success) notFound();
  if (!token) return <StatusAlert>缺少登录凭证，请重新登录后重试</StatusAlert>;

  const [detailResult, versionResult] = await Promise.all([
    loadResource<DouyinMaterialNoteTenantDetail>(
      token,
      `/tenant/douyin-material-notes/${rawParams.id}`,
      parseMaterialNoteDetail,
      "资料详情加载失败",
    ),
    loadResource<DouyinMaterialNoteTenantVersionList>(
      token,
      `/tenant/douyin-material-notes/${rawParams.id}/versions?page=1&pageSize=${MATERIAL_NOTE_VERSION_PAGE_SIZE}`,
      (value) => {
        const result = parseMaterialNoteVersionList(value);
        assertMaterialNoteRequestedPage(result.pagination, { page: 1, pageSize: MATERIAL_NOTE_VERSION_PAGE_SIZE });
        return result;
      },
      "版本历史加载失败",
    ),
  ]);
  if (detailResult.status === 404) notFound();
  if (!detailResult.data) {
    return <StatusAlert>{detailResult.error ?? "资料详情加载失败"}</StatusAlert>;
  }

  const fallbackVersions: DouyinMaterialNoteTenantVersionList = {
    list: [],
    pagination: { page: 1, pageSize: MATERIAL_NOTE_VERSION_PAGE_SIZE, total: 0, totalPages: 0 },
  };
  return <MaterialNoteDetail
    detail={detailResult.data}
    initialVersionPage={versionResult.data ?? fallbackVersions}
    initialVersionError={versionResult.error}
    canManage={permissionCodes.includes(MANAGE_PERMISSION)}
    canPublish={permissionCodes.includes(PUBLISH_PERMISSION)}
  />;
}
