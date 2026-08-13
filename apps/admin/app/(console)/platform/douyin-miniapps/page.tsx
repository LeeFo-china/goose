import { redirect } from "next/navigation";
import { PlatformDouyinReleasePanel } from
  "@/components/platform-douyin-miniapps/platform-douyin-release-panel";
import type { PlatformDouyinInstallation } from
  "@/components/platform-douyin-miniapps/platform-douyin-release-rules";
import { getAdminSession, getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

export type InstallationListData = {
  list: PlatformDouyinInstallation[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};
type TemplateSourceData = {
  template_app_id: string;
  installation: PlatformDouyinInstallation;
};

async function getInstallations(path: string): Promise<InstallationListData> {
  const token = await getAdminToken();
  if (!token) throw new Error("缺少登录凭证");
  const response = await fetch(buildBackendUrl(path), {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const payload = await parseBackendJson<InstallationListData>(response);
  if (!payload.data) throw new Error("接口未返回抖音小程序安装数据");
  return payload.data;
}

async function getTemplateSource(): Promise<TemplateSourceData> {
  const token = await getAdminToken();
  if (!token) throw new Error("缺少登录凭证");
  const response = await fetch(
    buildBackendUrl("/platform/douyin-miniapps/template-source"),
    {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    },
  );
  const payload = await parseBackendJson<TemplateSourceData>(response);
  if (!payload.data) throw new Error("接口未返回抖音模板源数据");
  return payload.data;
}

export default async function PlatformDouyinMiniappsPage({
  searchParams,
}: {
  searchParams: Promise<{ merchantPage?: string }>;
}) {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const hasPermission = session.permissions.some(
    (permission) => permission.code === "platform.douyin_miniapp.manage"
      && permission.scope === "all",
  );
  const isPlatformIdentity = session.roles.includes("platform_admin")
    || session.is_platform_staff === true;
  const canManage = isPlatformIdentity && hasPermission;
  const rawMerchantPage = (await searchParams).merchantPage ?? "1";
  const requestedPage = /^(?:[1-9][0-9]{0,3}|10000)$/.test(rawMerchantPage)
    ? Number(rawMerchantPage)
    : 1;
  const merchantPage = Number.isInteger(requestedPage)
    && requestedPage >= 1
    && requestedPage <= 10_000
    ? requestedPage
    : 1;
  let installations: PlatformDouyinInstallation[] = [];
  let templateAppId: string | null = null;
  let merchantPagination = {
    page: merchantPage,
    pageSize: 100,
    total: 0,
    totalPages: 0,
  };
  let error: string | null = null;

  if (!canManage) {
    error = "当前账号无权管理抖音小程序发布";
  } else {
    try {
      const [templateSource, merchantData] = await Promise.all([
        getTemplateSource(),
        getInstallations(
          `/platform/douyin-miniapps?page=${merchantPage}&pageSize=100`
            + "&installation_kind=merchant&authorization_status=active",
        ),
      ]);
      templateAppId = templateSource.template_app_id;
      installations = merchantData.list;
      merchantPagination = merchantData.pagination;
    } catch (caught) {
      error = caught instanceof Error ? caught.message : "加载抖音小程序安装失败";
    }
  }

  return (
    <PlatformDouyinReleasePanel
      installations={installations}
      initialError={error}
      merchantPagination={merchantPagination}
      templateAppId={templateAppId}
    />
  );
}
