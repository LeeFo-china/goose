import { notFound, redirect } from "next/navigation";

import { SiteContentEditor } from "@/components/site-content/site-content-editor";
import { hasSiteContentPermission } from "@/components/site-content/site-content-types";
import { getAdminSession } from "@/lib/auth";
import { isPlatformOnlySession } from "@/lib/session-mode";

export default async function NewSiteContentPage() {
  const session = await getAdminSession();
  if (!session) redirect("/login");
  if (!isPlatformOnlySession(session) || !hasSiteContentPermission(session.permissions, "platform.site_content.read")) notFound();

  return (
    <SiteContentEditor
      canRead
      canManage={hasSiteContentPermission(session.permissions, "platform.site_content.manage")}
      canPublish={hasSiteContentPermission(session.permissions, "platform.site_content.publish")}
    />
  );
}
