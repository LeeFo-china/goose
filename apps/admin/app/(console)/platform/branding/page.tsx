import { redirect } from "next/navigation";

import { StatusAlert } from "@/components/admin/status-alert";
import { PlatformBrandingForm } from "@/components/platform-branding/platform-branding-form";
import type { PlatformBrandingResult } from "@/components/platform-branding/platform-branding-types";
import { getAdminSession, getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";
import { isPlatformOnlySession } from "@/lib/session-mode";

const MANAGE_PERMISSION = "platform.branding.manage";

async function getPlatformBranding(): Promise<{
  branding: PlatformBrandingResult | null;
  error: string | null;
}> {
  const token = await getAdminToken();
  if (!token) {
    return { branding: null, error: "缺少登录凭证" };
  }

  try {
    const response = await fetch(buildBackendUrl("/platform/branding"), {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const payload = await parseBackendJson<PlatformBrandingResult>(response);
    return {
      branding: payload.data ?? null,
      error: payload.data ? null : "平台品牌资料加载失败",
    };
  } catch (error) {
    return {
      branding: null,
      error: error instanceof Error ? error.message : "平台品牌资料加载失败",
    };
  }
}

export default async function PlatformBrandingPage() {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const hasManagePermission = isPlatformOnlySession(session) &&
    session.permissions.some(
      (permission) => permission.code === MANAGE_PERMISSION,
    );
  const result = hasManagePermission
    ? await getPlatformBranding()
    : {
      branding: null,
      error: "当前账号无权管理平台品牌",
    };

  return (
    <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-5 overflow-hidden">
      <div className="shrink-0">
        <h1 className="text-2xl font-semibold tracking-normal">平台品牌</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          维护租户未启用自定义品牌时展示的默认名称和 Logo。
        </p>
      </div>

      {result.error ? (
        <div className="shrink-0">
          <StatusAlert>{result.error}</StatusAlert>
        </div>
      ) : null}
      {result.branding ? (
        <PlatformBrandingForm
          key={`${result.branding.profile?.version ?? 0}:${result.branding.effective.version}`}
          initialBranding={result.branding}
        />
      ) : null}
    </div>
  );
}
