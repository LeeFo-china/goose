import { redirect } from "next/navigation";
import { PlatformDouyinTemplatePanel } from
  "@/components/platform-douyin-miniapps/platform-douyin-template-panel";
import type { PlatformDouyinTemplateStatus } from
  "@/components/platform-douyin-miniapps/platform-douyin-template-rules";
import { getAdminSession, getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

async function getTemplateStatus(): Promise<PlatformDouyinTemplateStatus> {
  const token = await getAdminToken();
  if (!token) throw new Error("缺少登录凭证");
  const response = await fetch(
    buildBackendUrl(
      "/platform/douyin-miniapps/deployable-template?channel=default",
    ),
    {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    },
  );
  const payload = await parseBackendJson<PlatformDouyinTemplateStatus>(response);
  if (!payload.data) throw new Error("接口未返回抖音模板状态");
  return payload.data;
}

export default async function PlatformDouyinMiniappsPage() {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const hasPermission = session.permissions.some(
    (permission) => permission.code === "platform.douyin_miniapp.manage"
      && permission.scope === "all",
  );
  const isPlatformIdentity = session.roles.includes("platform_admin")
    || session.is_platform_staff === true;
  const canManage = isPlatformIdentity && hasPermission;
  let status: PlatformDouyinTemplateStatus | null = null;
  let error: string | null = null;

  if (!canManage) {
    error = "当前账号无权管理抖音模板";
  } else {
    try {
      status = await getTemplateStatus();
    } catch (caught) {
      error = caught instanceof Error ? caught.message : "加载抖音模板状态失败";
    }
  }

  return (
    <PlatformDouyinTemplatePanel
      initialError={error}
      initialStatus={status}
    />
  );
}
