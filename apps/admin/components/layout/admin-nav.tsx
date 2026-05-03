"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BadgeCheck,
  Building2,
  BriefcaseBusiness,
  Camera,
  CircleDollarSign,
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
  { href: "/cameras", label: "工地监控", icon: Camera },
  { href: "/ops", label: "运维脚本", icon: TerminalSquare },
  { href: "/settings", label: "系统配置", icon: SlidersHorizontal },
];

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1 p-3">
      {navItems.map((item) => {
        const active = isActivePath(pathname, item.href);
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
              active && "bg-primary text-primary-foreground shadow-sm hover:bg-primary hover:text-primary-foreground",
            )}
          >
            <span
              className={cn(
                "absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-transparent transition-colors",
                active && "bg-primary-foreground/90",
              )}
            />
            <Icon
              className={cn(
                "size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-accent-foreground",
                active && "text-primary-foreground group-hover:text-primary-foreground",
              )}
            />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
