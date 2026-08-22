import { redirect } from "next/navigation";
import type { DouyinReleaseReadiness } from "@gooes/domain";

import { TenantDouyinMiniappWorkspace } from "@/components/douyin-miniapp/workspace";
import type { TenantDouyinWorkspace } from "@/components/douyin-miniapp/workspace-types";
import { getAdminSession, getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

const READ_PERMISSION = "douyin_miniapp.read";
const MANAGE_PERMISSION = "douyin_miniapp.manage";
const AUDIT_PERMISSION = "douyin_miniapp.audit.submit";
const PUBLISH_PERMISSION = "douyin_miniapp.publish";

export default async function TenantDouyinMiniappWorkspacePage() {
  const [session, token] = await Promise.all([
    getAdminSession(),
    getAdminToken(),
  ]);

  if (!session) redirect("/login");

  const canRead = session.permissions.some(
    (permission) => permission.code === READ_PERMISSION,
  );
  const canManage = session.permissions.some(
    (permission) => permission.code === MANAGE_PERMISSION,
  );
  const canSubmitAudit = session.permissions.some(
    (permission) => permission.code === AUDIT_PERMISSION,
  );
  const canPublish = session.permissions.some(
    (permission) => permission.code === PUBLISH_PERMISSION,
  );
  let workspace: TenantDouyinWorkspace | null = null;
  let readiness: DouyinReleaseReadiness | null = null;
  let readinessLoadError: string | null = null;
  let loadError: string | null = null;

  if (canRead && token) {
    const headers = { authorization: `Bearer ${token}` };
    const [workspaceResult, readinessResult] = await Promise.allSettled([
      fetch(buildBackendUrl("/tenant/douyin-miniapp/workspace"), {
        headers,
        cache: "no-store",
      }).then((response) => parseBackendJson<TenantDouyinWorkspace>(response)),
      fetch(buildBackendUrl("/tenant/douyin-miniapp/release-readiness"), {
        headers,
        cache: "no-store",
      }).then((response) => parseBackendJson<DouyinReleaseReadiness>(response)),
    ]);
    if (workspaceResult.status === "fulfilled") {
      workspace = workspaceResult.value.data ?? null;
    } else {
      loadError = workspaceResult.reason instanceof Error
        ? workspaceResult.reason.message
        : "抖音小程序工作台加载失败";
    }
    if (readinessResult.status === "fulfilled") {
      readiness = readinessResult.value.data ?? null;
    } else {
      readinessLoadError = readinessResult.reason instanceof Error
        ? readinessResult.reason.message
        : "提审就绪检查加载失败";
    }
  } else if (canRead) {
    loadError = "缺少登录凭证，请重新登录后重试";
  }

  return (
    <TenantDouyinMiniappWorkspace
      canManage={canManage}
      canPublish={canPublish}
      canRead={canRead}
      canSubmitAudit={canSubmitAudit}
      loadError={loadError}
      readiness={readiness}
      readinessLoadError={readinessLoadError}
      workspace={workspace}
    />
  );
}
