"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  platformNavGroups,
  tenantNavGroups,
  type AdminMenuGroup,
} from "@/components/layout/menu-config";
import type { AdminSession } from "@/lib/backend";
import { isPlatformOnlySession } from "@/lib/session-mode";
import { cn } from "@/lib/utils";

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function hasPermission(session: AdminSession, permission: string) {
  return session.permissions.some((item) => item.code === permission);
}

function getVisibleGroups(session: AdminSession, groups: AdminMenuGroup[]) {
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        !item.permission || hasPermission(session, item.permission)
      ),
    }))
    .filter((group) => group.items.length > 0);
}

export function AdminNav({ session }: { session: AdminSession }) {
  const pathname = usePathname();
  const rawGroups = isPlatformOnlySession(session)
    ? platformNavGroups
    : tenantNavGroups;
  const visibleGroups = getVisibleGroups(session, rawGroups);

  return (
    <nav className="flex flex-col gap-4 p-3">
      {visibleGroups.map((group) => (
        <div key={group.label} className="flex flex-col gap-1">
          <div className="px-3 text-[11px] font-semibold text-[#4d3b00]/60">
            {group.label}
          </div>
          {group.items.map((item) => {
            const active = isActivePath(pathname, item.href);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium text-[#4d3b00] transition-colors hover:bg-[#fff5cf] hover:text-[#141414]",
                  active && "bg-[#141414] text-[#ffd449] shadow-sm hover:bg-[#141414] hover:text-[#ffd449]",
                )}
              >
                <span
                  className={cn(
                    "absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-transparent transition-colors",
                    active && "bg-[#ffd449]",
                  )}
                />
                <Icon
                  className={cn(
                    "size-4 shrink-0 text-[#4d3b00]/70 transition-colors group-hover:text-[#141414]",
                    active && "text-[#ffd449] group-hover:text-[#ffd449]",
                  )}
                />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
