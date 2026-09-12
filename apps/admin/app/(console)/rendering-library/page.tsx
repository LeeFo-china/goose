import { getAdminSession } from '@/lib/auth';
import { getTenantBusinessAccessDenied } from '@/components/layout/platform-mode-access-denied';
import { StatusAlert } from '@/components/admin/status-alert';
import { getLibraryAccess } from '@/components/rendering-library/contracts';
import { LibraryClient } from '@/components/rendering-library/library-client';

export default async function RenderingLibraryPage() {
  const denied = await getTenantBusinessAccessDenied();
  if (denied) return denied;
  const access = getLibraryAccess(await getAdminSession());
  if (!access.canRead) return <StatusAlert title="无权访问装修效果库">当前身份没有公司素材库的读取权限，请联系管理员。</StatusAlert>;
  return <LibraryClient access={access} />;
}
