import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { type AdminSession } from "@/lib/backend";
import { LogoutButton } from "@/components/layout/logout-button";
import { AdminNav } from "@/components/layout/admin-nav";
import { NotificationMenu } from "@/components/layout/notification-menu";
import { isPlatformOnlySession } from "@/lib/session-mode";

export function AdminShell({
  session,
  children,
}: {
  session: AdminSession;
  children: React.ReactNode;
}) {
  const isPlatformMode = isPlatformOnlySession(session);
  const sidebarIdentityRows = [
    ["身份", isPlatformMode ? "平台超管" : session.tenant?.name || "未绑定租户"],
    ["员工", session.employee.name || "未命名员工"],
    ["用户编号", session.user_id || "-"],
  ];

  return (
    <div className="goose-workbench-bg min-h-screen">
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-black/10 bg-white lg:flex">
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
        <div className="min-h-0 flex-1 overflow-y-auto">
          <AdminNav session={session} />
        </div>
        <div className="border-t border-black/10 p-3">
          <div className="rounded-md border border-black/10 bg-white p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="text-xs font-semibold text-[#4d3b00]/70">登录身份</div>
              <Badge variant={isPlatformMode ? "success" : "outline"}>
                {isPlatformMode ? "平台账号" : "租户账号"}
              </Badge>
            </div>
            <div className="flex flex-col gap-2">
              {sidebarIdentityRows.map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <div className="text-[11px] text-muted-foreground">{label}</div>
                  <div className="mt-0.5 truncate text-xs font-medium text-foreground">
                    {value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </aside>
      <div className="lg:pl-64">
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-black/10 bg-white px-4 shadow-[0_8px_24px_rgba(17,17,17,0.06)] md:px-6">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">
              {session.employee.name || "未命名员工"}
            </div>
            <div className="truncate text-xs text-[#4d3b00]">
              {isPlatformMode
                ? "平台超管 · 平台管理模式"
                : `${session.employee.department_name || "未分配部门"} · ${session.employee.post_name || "未分配岗位"}`}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <NotificationMenu />
            {isPlatformMode ? (
              <>
                <Badge variant="outline">平台账号</Badge>
                <Badge variant="success">平台超管</Badge>
              </>
            ) : (
              <>
                <Badge variant="outline">{session.tenant?.name || "未绑定租户"}</Badge>
                <Badge variant="success">权限 {session.permissions.length}</Badge>
              </>
            )}
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
