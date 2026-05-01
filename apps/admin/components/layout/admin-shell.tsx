import Link from "next/link";
import {
  BadgeCheck,
  BriefcaseBusiness,
  Camera,
  CircleDollarSign,
  ClipboardList,
  LayoutDashboard,
  Shield,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { type AdminSession } from "@/lib/backend";
import { LogoutButton } from "@/components/layout/logout-button";

const navItems = [
  { href: "/dashboard", label: "概览", icon: LayoutDashboard },
  { href: "/customers", label: "客户", icon: Users },
  { href: "/projects", label: "项目", icon: BriefcaseBusiness },
  { href: "/employees", label: "员工", icon: BadgeCheck },
  { href: "/permissions", label: "角色权限", icon: Shield },
  { href: "/expenses", label: "费用审批", icon: CircleDollarSign },
  { href: "/cameras", label: "工地监控", icon: Camera },
];

export function AdminShell({
  session,
  children,
}: {
  session: AdminSession;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 border-r bg-card lg:block">
        <div className="flex h-16 items-center gap-3 px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <ClipboardList className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-semibold">固鹅后台</div>
            <div className="text-xs text-muted-foreground">Admin Console</div>
          </div>
        </div>
        <Separator />
        <nav className="space-y-1 p-3">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="lg:pl-64">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b bg-background/92 px-4 backdrop-blur md:px-6">
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
