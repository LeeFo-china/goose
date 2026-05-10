import {
  BadgeCheck,
  Building2,
  BriefcaseBusiness,
  Camera,
  CircleDollarSign,
  Clapperboard,
  Inbox,
  KeyRound,
  LayoutDashboard,
  Megaphone,
  ScrollText,
  Shield,
  SlidersHorizontal,
  TerminalSquare,
  Users,
  type LucideIcon,
} from "lucide-react";

export type AdminMenuItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  permission?: string | null;
};

export type AdminMenuGroup = {
  label: string;
  items: AdminMenuItem[];
};

export const platformNavGroups: AdminMenuGroup[] = [
  {
    label: "平台运营",
    items: [
      { href: "/dashboard", label: "平台概览", icon: LayoutDashboard },
      { href: "/platform/tenants", label: "平台租户", icon: Building2 },
      { href: "/platform/leads", label: "平台线索", icon: Inbox },
      { href: "/platform/marketing-pages", label: "H5 活动页", icon: Megaphone },
      { href: "/platform/audit-logs", label: "平台审计", icon: ScrollText },
    ],
  },
  {
    label: "平台配置",
    items: [
      { href: "/settings", label: "系统配置", icon: SlidersHorizontal },
      { href: "/social-video", label: "自媒体脚本", icon: Clapperboard },
    ],
  },
  {
    label: "运维",
    items: [
      { href: "/ops", label: "运维脚本", icon: TerminalSquare },
    ],
  },
];

export const tenantNavGroups: AdminMenuGroup[] = [
  {
    label: "业务",
    items: [
      { href: "/dashboard", label: "概览", icon: LayoutDashboard },
      { href: "/customers", label: "客户", icon: Users },
      { href: "/projects", label: "项目", icon: BriefcaseBusiness },
      { href: "/expenses", label: "费用审批", icon: CircleDollarSign },
      { href: "/marketing", label: "营销活动", icon: Megaphone },
      { href: "/social-video", label: "自媒体脚本", icon: Clapperboard },
      { href: "/cameras", label: "工地监控", icon: Camera },
    ],
  },
  {
    label: "组织",
    items: [
      { href: "/employees", label: "员工", icon: BadgeCheck },
      { href: "/organization", label: "组织架构", icon: Building2 },
      { href: "/roles", label: "角色", icon: Shield },
      { href: "/permissions", label: "权限点", icon: KeyRound },
    ],
  },
  {
    label: "系统",
    items: [
      { href: "/settings", label: "系统配置", icon: SlidersHorizontal },
    ],
  },
];
