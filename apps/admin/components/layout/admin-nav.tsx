"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BadgeCheck,
  Building2,
  BriefcaseBusiness,
  Camera,
  CircleDollarSign,
  Clapperboard,
  KeyRound,
  LayoutDashboard,
  Megaphone,
  Shield,
  SlidersHorizontal,
  TerminalSquare,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  platformOnly?: boolean;
};

const navItems: NavItem[] = [
  { href: "/dashboard", label: "概览", icon: LayoutDashboard },
  { href: "/customers", label: "客户", icon: Users },
  { href: "/projects", label: "项目", icon: BriefcaseBusiness },
  { href: "/employees", label: "员工", icon: BadgeCheck },
  { href: "/organization", label: "组织架构", icon: Building2 },
  { href: "/roles", label: "角色", icon: Shield },
  { href: "/permissions", label: "权限点", icon: KeyRound },
  { href: "/expenses", label: "费用审批", icon: CircleDollarSign },
  { href: "/marketing", label: "营销活动", icon: Megaphone },
  { href: "/social-video", label: "自媒体脚本", icon: Clapperboard },
  { href: "/cameras", label: "工地监控", icon: Camera },
  { href: "/platform/tenants", label: "平台租户", icon: Building2, platformOnly: true },
  { href: "/ops", label: "运维脚本", icon: TerminalSquare },
  { href: "/settings", label: "系统配置", icon: SlidersHorizontal },
];

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminNav({ roles }: { roles?: string[] }) {
  const pathname = usePathname();
  const visibleItems = navItems.filter((item) => !item.platformOnly || roles?.includes("platform_admin"));

  return (
    <nav className="flex flex-col gap-1 p-3">
      {visibleItems.map((item) => {
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
    </nav>
  );
}
