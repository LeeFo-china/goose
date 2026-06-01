"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { type AdminSession } from "@/lib/backend";
import { LogoutButton } from "@/components/layout/logout-button";
import { AdminNav } from "@/components/layout/admin-nav";
import {
  AdminPreferencesMenu,
  applyThemeTone,
  defaultPreferences,
  loadPreferences,
  savePreferences,
} from "@/components/layout/admin-shell-preferences";
import { NotificationMenu } from "@/components/layout/notification-menu";
import { isPlatformOnlySession } from "@/lib/session-mode";
import { cn } from "@/lib/utils";

export function AdminShell({
  session,
  children,
}: {
  session: AdminSession;
  children: React.ReactNode;
}) {
  const [preferences, setPreferences] = useState(defaultPreferences);
  const isPlatformMode = isPlatformOnlySession(session);
  const sidebarIdentityTitle = `${isPlatformMode ? "平台超管" : session.tenant?.name || "未绑定租户"} · ${session.employee.name || "未命名员工"}`;
  const sidebarIdentityMeta = isPlatformMode
    ? `平台账号 · ${session.user_id || "-"}`
    : `${session.employee.department_name || "未分配部门"} · ${session.user_id || "-"}`;
  const mainWidthClassName = useMemo(() => {
    if (preferences.contentWidth === "compact") return "max-w-6xl";
    if (preferences.contentWidth === "full") return "max-w-none";
    return "max-w-7xl";
  }, [preferences.contentWidth]);

  useEffect(() => {
    const nextPreferences = loadPreferences();
    setPreferences(nextPreferences);
    applyThemeTone(nextPreferences.themeTone);
  }, []);

  useEffect(() => {
    savePreferences(preferences);
    applyThemeTone(preferences.themeTone);
    document.documentElement.dataset.adminCompact = preferences.compact ? "true" : "false";
  }, [preferences]);

  return (
    <div className="goose-workbench-bg min-h-screen">
      <aside className={cn(
        "fixed inset-y-0 left-0 hidden flex-col border-r border-black/10 bg-white transition-[width] duration-200 lg:flex",
        preferences.sidebarCollapsed ? "w-20" : "w-64",
      )}>
        <div className={cn("flex h-16 items-center gap-3 px-5", preferences.sidebarCollapsed && "justify-center px-3")}>
          <div className="flex size-10 items-center justify-center overflow-hidden rounded-full border-2 border-[var(--goose-yellow)] bg-white shadow-[0_8px_18px_rgba(17,17,17,0.08)]">
            <img src="/logo.png" alt="鹅班长" className="size-8 object-contain" />
          </div>
          <div className={preferences.sidebarCollapsed ? "sr-only" : undefined}>
            <div className="text-sm font-extrabold text-[var(--goose-ink)]">鹅班长工作台</div>
            <div className="text-xs text-[var(--goose-brown)]">AI 装修管理后台</div>
          </div>
        </div>
        <Separator />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <AdminNav session={session} collapsed={preferences.sidebarCollapsed} />
        </div>
        <div className={cn("border-t border-black/10 px-5 py-3", preferences.sidebarCollapsed && "px-2 text-center")}>
          <div className="truncate text-xs font-semibold text-[var(--goose-ink)]">
            {preferences.sidebarCollapsed ? session.employee.name?.slice(0, 1) || "员" : sidebarIdentityTitle}
          </div>
          <div className={cn("mt-1 truncate text-[11px] text-[var(--goose-brown)] opacity-70", preferences.sidebarCollapsed && "sr-only")}>
            {sidebarIdentityMeta}
          </div>
        </div>
      </aside>
      <div className={cn("transition-[padding] duration-200", preferences.sidebarCollapsed ? "lg:pl-20" : "lg:pl-64")}>
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-black/10 bg-white px-4 shadow-[0_8px_24px_rgba(17,17,17,0.06)] md:px-6">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">
              {session.employee.name || "未命名员工"}
            </div>
            <div className="truncate text-xs text-[var(--goose-brown)]">
              {isPlatformMode
                ? "平台超管 · 平台管理模式"
                : `${session.employee.department_name || "未分配部门"} · ${session.employee.post_name || "未分配岗位"}`}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <AdminPreferencesMenu
              preferences={preferences}
              onChange={setPreferences}
            />
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
        <main className={cn(
          "mx-auto w-full px-4 md:px-6",
          mainWidthClassName,
          preferences.compact ? "py-3" : "py-5",
        )}>
          {children}
        </main>
      </div>
    </div>
  );
}
