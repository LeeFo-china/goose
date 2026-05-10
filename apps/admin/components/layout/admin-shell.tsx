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
    <div className="goose-workbench-bg min-h-screen">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-black/10 bg-white lg:block">
        <div className="flex h-16 items-center gap-3 px-5">
          <div className="flex size-10 items-center justify-center overflow-hidden rounded-full border-2 border-[#f3b400] bg-white shadow-[0_8px_18px_rgba(17,17,17,0.08)]">
            <img src="/logo.png" alt="鹅班长" className="size-8 object-contain" />
          </div>
          <div>
            <div className="text-sm font-extrabold text-[#141414]">鹅班长工作台</div>
            <div className="text-xs text-[#4d3b00]">AI 装修管理后台</div>
          </div>
        </div>
        <Separator />
        <AdminNav roles={session.roles} />
      </aside>
      <div className="lg:pl-64">
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-black/10 bg-white px-4 shadow-[0_8px_24px_rgba(17,17,17,0.06)] md:px-6">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">
              {session.employee.name || "未命名员工"}
            </div>
            <div className="truncate text-xs text-[#4d3b00]">
              {session.employee.department_name || "未分配部门"} · {session.employee.post_name || "未分配岗位"}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{session.tenant?.name || "未绑定租户"}</Badge>
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
