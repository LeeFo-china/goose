import { redirect } from "next/navigation";
import { PlatformDouyinReleaseAuditPanel } from
  "@/components/platform-douyin-miniapps/platform-douyin-release-audit-panel";
import type { PlatformDouyinInstallation } from
  "@/components/platform-douyin-miniapps/platform-douyin-release-audit-rules";
import { PlatformDouyinTemplatePanel } from
  "@/components/platform-douyin-miniapps/platform-douyin-template-panel";
import type { PlatformDouyinTemplateStatus } from
  "@/components/platform-douyin-miniapps/platform-douyin-template-rules";
import { getAdminSession, getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

type InstallationListData = {
  list: PlatformDouyinInstallation[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

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

async function getActiveMerchantInstallations(): Promise<PlatformDouyinInstallation[]> {
  const token = await getAdminToken();
  if (!token) throw new Error("缺少登录凭证");
  const response = await fetch(
    buildBackendUrl(
      "/platform/douyin-miniapps?page=1&pageSize=100"
        + "&installation_kind=merchant&authorization_status=active",
    ),
    {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    },
  );
  const payload = await parseBackendJson<InstallationListData>(response);
  if (!payload.data) throw new Error("接口未返回抖音小程序安装数据");
  return payload.data.list;
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
  let installations: PlatformDouyinInstallation[] = [];
  let error: string | null = null;
  let releaseError: string | null = null;

  if (!canManage) {
    error = "当前账号无权管理抖音模板";
    releaseError = "当前账号无权查看商户发布审核";
  } else {
    const [templateResult, installationsResult] = await Promise.allSettled([
      getTemplateStatus(),
      getActiveMerchantInstallations(),
    ]);
    if (templateResult.status === "fulfilled") {
      status = templateResult.value;
    } else {
      error = templateResult.reason instanceof Error
        ? templateResult.reason.message
        : "加载抖音模板状态失败";
    }
    if (installationsResult.status === "fulfilled") {
      installations = installationsResult.value;
    } else {
      releaseError = installationsResult.reason instanceof Error
        ? installationsResult.reason.message
        : "加载商户发布审核失败";
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-8 overflow-y-auto pb-10 pr-1 [scrollbar-gutter:stable]">
      <PlatformDouyinTemplatePanel
        initialError={error}
        initialStatus={status}
      />
      <PlatformDouyinReleaseAuditPanel
        installations={installations}
        initialError={releaseError}
      />
    </div>
  );
}
