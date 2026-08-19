import { redirect } from "next/navigation";
import { AdminShell } from "@/components/layout/admin-shell";
import { getAdminSession, getAdminToken } from "@/lib/auth";
import { loadTenantServiceAccess } from "@/lib/tenant-service-access";

export default async function ConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getAdminSession();
  if (!session) {
    redirect("/login");
  }

  const token = await getAdminToken();
  const serviceAccess = await loadTenantServiceAccess({ session, token });

  return (
    <AdminShell session={session} serviceAccess={serviceAccess}>
      {children}
    </AdminShell>
  );
}
