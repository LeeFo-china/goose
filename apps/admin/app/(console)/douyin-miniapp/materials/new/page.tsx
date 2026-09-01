import { redirect } from "next/navigation";

import { StatusAlert } from "@/components/admin/status-alert";
import { getMaterialNotePermissions } from
  "@/components/douyin-miniapp/material-note-contract";
import { MaterialNoteEditor } from
  "@/components/douyin-miniapp/material-note-editor";
import { getAdminSession } from "@/lib/auth";

export default async function NewTenantMaterialNotePage() {
  const session = await getAdminSession();
  if (!session) redirect("/login");
  const permissions = getMaterialNotePermissions(
    session.permissions.map((permission) => permission.code),
  );
  if (session.tenant === null || !permissions.canRead || !permissions.canManage) {
    return <StatusAlert>新建资料需要 douyin_material_note.manage 权限</StatusAlert>;
  }
  return <MaterialNoteEditor canManage />;
}
