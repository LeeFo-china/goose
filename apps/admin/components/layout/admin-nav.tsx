"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  platformNavGroups,
  tenantHardBlockedNavGroups,
  tenantNavGroups,
  tenantServiceRecoveryNavGroups,
} from "@/components/layout/menu-config";
import { getVisibleGroups } from "@/components/layout/admin-nav-visibility";
import { isActivePath } from "@/components/layout/admin-nav-utils";
import { useServiceAccess } from "@/components/service-access/service-access-context";
import { decideServiceAccessView } from "@/components/service-access/service-access-routes";
import type { AdminSession } from "@/lib/backend";
import { isPlatformOnlySession } from "@/lib/session-mode";
import { cn } from "@/lib/utils";

export function AdminNav({
  session,
  collapsed = false,
}: {
  session: AdminSession;
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  const { loadResult } = useServiceAccess();
  const isPlatformMode = isPlatformOnlySession(session);
  const serviceAccessView = decideServiceAccessView(loadResult, pathname);
  const isTenantBlocked = serviceAccessView === "recovery"
    || serviceAccessView === "replace";
  const isHardBlocked = loadResult.kind === "ready"
    && loadResult.summary.accessStatus === "hard_blocked";
  const rawGroups = isPlatformMode
    ? platformNavGroups
    : isHardBlocked
      ? tenantHardBlockedNavGroups
      : isTenantBlocked
      ? tenantServiceRecoveryNavGroups
      : tenantNavGroups;
  const visibleGroups = getVisibleGroups(session, rawGroups);

  return (
    <nav className={cn("flex flex-col gap-4 p-3", collapsed && "items-center px-2")}>
      {visibleGroups.map((group) => (
        <div key={group.label} className="flex w-full flex-col gap-1">
          <div className={cn("px-3 text-[11px] font-semibold text-[var(--goose-brown)] opacity-60", collapsed && "sr-only")}>
            {group.label}
          </div>
          {group.items.map((item) => {
            const active = isActivePath(pathname, item.href, {
              exact: item.activeMatch === "exact",
              activeHrefs: item.activeHrefs,
            });
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium text-[var(--goose-brown)] transition-colors hover:bg-[var(--goose-cream-deep)] hover:text-[var(--goose-ink)]",
                  collapsed && "justify-center px-0",
                  active && "bg-[var(--goose-ink)] text-[var(--goose-yellow-soft)] shadow-sm hover:bg-[var(--goose-ink)] hover:text-[var(--goose-yellow-soft)]",
                )}
              >
                <span
                  className={cn(
                    "absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-transparent transition-colors",
                    active && "bg-[var(--goose-yellow-soft)]",
                  )}
                />
                <Icon
                  className={cn(
                    "size-4 shrink-0 text-[var(--goose-brown)] opacity-70 transition-colors group-hover:text-[var(--goose-ink)] group-hover:opacity-100",
                    active && "text-[var(--goose-yellow-soft)] opacity-100 group-hover:text-[var(--goose-yellow-soft)]",
                  )}
                />
                <span className={cn("truncate", collapsed && "sr-only")}>{item.label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
