import { redirect } from "next/navigation";

import { TenantDouyinMiniappWorkspace } from "@/components/douyin-miniapp/workspace";
import type { TenantDouyinWorkspace } from "@/components/douyin-miniapp/workspace-types";
import { getAdminSession, getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

const READ_PERMISSION = "douyin_miniapp.read";

export default async function TenantDouyinMiniappWorkspacePage() {
  const [session, token] = await Promise.all([
    getAdminSession(),
    getAdminToken(),
  ]);

  if (!session) redirect("/login");

  const canRead = session.permissions.some(
    (permission) => permission.code === READ_PERMISSION,
  );
  let workspace: TenantDouyinWorkspace | null = null;
  let loadError: string | null = null;

  if (canRead && token) {
    try {
      const response = await fetch(
        buildBackendUrl("/tenant/douyin-miniapp/workspace"),
        {
          headers: { authorization: `Bearer ${token}` },
          cache: "no-store",
        },
      );
      const payload = await parseBackendJson<TenantDouyinWorkspace>(response);
      workspace = payload.data ?? null;
    } catch (error) {
      loadError = error instanceof Error
        ? error.message
        : "抖音小程序工作台加载失败";
    }
  } else if (canRead) {
    loadError = "缺少登录凭证，请重新登录后重试";
  }

  return (
    <TenantDouyinMiniappWorkspace
      canRead={canRead}
      loadError={loadError}
      workspace={workspace}
    />
  );
}
