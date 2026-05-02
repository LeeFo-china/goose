import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { type AdminSession } from "@/lib/backend";
import { LogoutButton } from "@/components/layout/logout-button";
import { AdminNav } from "@/components/layout/admin-nav";

export function AdminShell({
  session,
  children,
}: {
  session: AdminSession;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r bg-card lg:block">
        <div className="flex h-16 items-center gap-3 px-5">
          <div className="flex size-9 items-center justify-center overflow-hidden rounded-md border bg-background">
            <img src="/logo.png" alt="小笨鹅" className="size-8 object-contain" />
          </div>
          <div>
            <div className="text-sm font-semibold">小笨鹅</div>
            <div className="text-xs text-muted-foreground">Admin Console</div>
          </div>
        </div>
        <Separator />
        <AdminNav />
      </aside>
      <div className="lg:pl-64">
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b bg-card px-4 shadow-sm md:px-6">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">
              {session.employee.name || "未命名员工"}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {session.employee.department_name || "未分配部门"} · {session.employee.post_name || "未分配岗位"}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="success">权限 {session.permissions.length}</Badge>
            <LogoutButton />
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl px-4 py-5 md:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}
