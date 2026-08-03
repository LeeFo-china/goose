import { redirect } from "next/navigation";

import {
  TenantDouyinAuthorizationCallback,
} from "@/components/douyin-miniapp/authorization-callback";
import { getAdminSession } from "@/lib/auth";

export default async function TenantDouyinAuthorizationCallbackPage() {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  return (
    <main className="flex min-h-0 flex-1 items-start justify-center overflow-y-auto p-5 lg:p-6">
      <TenantDouyinAuthorizationCallback />
    </main>
  );
}
