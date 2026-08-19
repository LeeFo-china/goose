"use client";

import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { type AdminSession } from "@/lib/backend";
import { LogoutButton } from "@/components/layout/logout-button";
import { AdminNav } from "@/components/layout/admin-nav";
import { AdminSessionGuard } from "@/components/layout/admin-session-guard";
import { AdminSessionScopeProvider } from "@/components/layout/admin-session-scope";
import { ServiceAccessProvider } from "@/components/service-access/service-access-context";
import { ServiceAccessGate } from "@/components/service-access/service-access-gate";
import {
  AdminPreferencesMenu,
  applyThemeTone,
  defaultPreferences,
  loadPreferences,
  savePreferences,
} from "@/components/layout/admin-shell-preferences";
import { NotificationMenu } from "@/components/layout/notification-menu";
import { isPlatformOnlySession } from "@/lib/session-mode";
import type { TenantServiceAccessLoadResult } from "@/lib/tenant-service-access";
import { cn } from "@/lib/utils";

export function AdminShell({
  session,
  serviceAccess,
  children,
}: {
  session: AdminSession;
  serviceAccess: TenantServiceAccessLoadResult;
  children: React.ReactNode;
}) {
  const [preferences, setPreferences] = useState(defaultPreferences);
  const isPlatformMode = isPlatformOnlySession(session);
  const headerTenantLabel = isPlatformMode
    ? "平台管理"
    : session.tenant?.name || "未绑定租户";
  const headerRoleLabel = isPlatformMode
    ? "平台管理模式"
    : session.employee.post_name || "未分配岗位";
  const headerDepartmentLabel = isPlatformMode
    ? "平台账号"
    : session.employee.department_name || "未分配部门";
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

  useLayoutEffect(() => {
    const root = document.documentElement;
    const previousScrollLock = root.getAttribute("data-admin-shell-scroll-lock");

    root.setAttribute("data-admin-shell-scroll-lock", "true");

    return () => {
      if (previousScrollLock === null) {
        root.removeAttribute("data-admin-shell-scroll-lock");
      } else {
        root.setAttribute("data-admin-shell-scroll-lock", previousScrollLock);
      }
    };
  }, []);

  useEffect(() => {
    savePreferences(preferences);
    applyThemeTone(preferences.themeTone);
    document.documentElement.dataset.adminCompact = preferences.compact ? "true" : "false";
  }, [preferences]);

  return (
    <AdminSessionScopeProvider
      tenantId={session.tenant?.id ?? null}
      userId={session.user_id}
    >
      <ServiceAccessProvider
        session={session}
        initialLoadResult={serviceAccess}
      >
      <AdminSessionGuard />
      <div className="goose-workbench-bg h-screen overflow-hidden">
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
      <div className={cn("flex h-screen min-h-0 flex-col transition-[padding] duration-200", preferences.sidebarCollapsed ? "lg:pl-20" : "lg:pl-64")}>
        <header className="shrink-0 sticky top-0 z-40 border-b border-black/10 bg-card shadow-[0_6px_18px_rgba(17,17,17,0.05)]">
          <div className="flex min-h-16 items-center justify-between gap-3 px-3 md:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-background lg:hidden">
                <img src="/logo.png" alt="鹅班长" className="size-7 object-contain" />
              </div>
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <div className="truncate text-sm font-semibold text-foreground">
                    {headerTenantLabel}
                  </div>
                  <Badge
                    variant={isPlatformMode ? "success" : "outline"}
                    className="hidden shrink-0 md:inline-flex"
                  >
                    {isPlatformMode ? "平台超管" : `权限 ${session.permissions.length}`}
                  </Badge>
                </div>
                <div className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                  <span className="truncate">
                    {session.employee.name || "未命名员工"}
                  </span>
                  <span className="hidden h-3 w-px shrink-0 bg-border sm:inline" aria-hidden="true" />
                  <span className="hidden min-w-0 truncate sm:inline">
                    {headerDepartmentLabel}
                  </span>
                  <span className="hidden h-3 w-px shrink-0 bg-border md:inline" aria-hidden="true" />
                  <span className="hidden min-w-0 truncate md:inline">
                    {headerRoleLabel}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
              <AdminPreferencesMenu
                preferences={preferences}
                onChange={setPreferences}
              />
              {!isPlatformMode ? <NotificationMenu /> : null}
              <LogoutButton />
            </div>
          </div>
        </header>
        <main className={cn(
          "mx-auto min-h-0 w-full flex-1 overflow-hidden px-4 md:px-6",
          mainWidthClassName,
          preferences.compact ? "py-3" : "py-5",
        )}>
          <ServiceAccessGate>{children}</ServiceAccessGate>
        </main>
      </div>
      </div>
      </ServiceAccessProvider>
    </AdminSessionScopeProvider>
  );
}
