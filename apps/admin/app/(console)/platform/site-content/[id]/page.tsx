import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { StatusAlert } from "@/components/admin/status-alert";
import { SiteContentEditor } from "@/components/site-content/site-content-editor";
import { hasSiteContentPermission, type SiteContentDetail } from "@/components/site-content/site-content-types";
import { Button } from "@/components/ui/button";
import { getAdminSession, getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";
import { isPlatformOnlySession } from "@/lib/session-mode";

async function fetchDetail(id: string) {
  const token = await getAdminToken();
  if (!token) return { data: null, error: "缺少登录凭证", status: 401 };
  try {
    const response = await fetch(buildBackendUrl(`/platform/site-content/${id}`), {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (response.status === 404) return { data: null, error: "官网内容不存在", status: 404 };
    const payload = await parseBackendJson<SiteContentDetail>(response);
    return { data: payload.data ?? null, error: null, status: response.status };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : "官网内容加载失败", status: 500 };
  }
}
export default async function SiteContentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session) redirect("/login");
  if (!isPlatformOnlySession(session) || !hasSiteContentPermission(session.permissions, "platform.site_content.read")) notFound();

  const { id } = await params;
  const result = await fetchDetail(id);
  if (result.status === 404) notFound();
  if (!result.data) {
    return <div className="flex flex-col gap-4"><StatusAlert>{result.error}</StatusAlert><Button asChild variant="outline" className="self-start"><Link href="/platform/site-content"><ArrowLeft data-icon="inline-start" />返回内容列表</Link></Button></div>;
  }

  return (
    <SiteContentEditor
      detail={result.data}
      canRead
      canManage={hasSiteContentPermission(session.permissions, "platform.site_content.manage")}
      canPublish={hasSiteContentPermission(session.permissions, "platform.site_content.publish")}
    />
  );
}
