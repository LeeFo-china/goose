import {
  BadgeCheck,
  BarChart3,
  Bot,
  Building2,
  BriefcaseBusiness,
  Camera,
  CalendarClock,
  ClipboardCheck,
  CircleDollarSign,
  Clapperboard,
  FileCheck2,
  GitBranch,
  Inbox,
  Images,
  KeyRound,
  LayoutDashboard,
  Megaphone,
  MessageSquareWarning,
  Newspaper,
  ScrollText,
  ScanText,
  SearchCheck,
  Shield,
  Sparkles,
  SlidersHorizontal,
  TerminalSquare,
  Users,
  RefreshCw,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import type { AdminPermission } from "@/lib/backend";

export type AdminPermissionScope = AdminPermission["scope"];

export type AdminMenuPermissionRequirement = {
  code: string;
  scope?: AdminPermissionScope;
};

export type AdminMenuItem = {
  href: string;
  activeHrefs?: string[];
  label: string;
  icon: LucideIcon;
  permission?: string | null;
  requiredPermissions?: AdminMenuPermissionRequirement[];
  activeMatch?: "exact" | "prefix";
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
      {
        href: "/platform/tenants",
        activeHrefs: ["/platform/tenant-onboarding"],
        label: "租户管理",
        icon: Building2,
      },
      { href: "/platform/partners", label: "城市合伙人", icon: Users },
      { href: "/platform/devices", label: "设备资产", icon: Camera },
      { href: "/platform/leads", label: "平台线索", icon: Inbox },
      { href: "/platform/picture-library", label: "图片资料库", icon: Images },
      { href: "/platform/marketing-pages", label: "H5 活动页", icon: Megaphone },
      {
        href: "/platform/site-content",
        label: "官网内容",
        icon: Newspaper,
        permission: "platform.site_content.read",
      },
      { href: "/platform/usage", label: "用量统计", icon: BarChart3 },
      { href: "/platform/billing", label: "计费中心", icon: CircleDollarSign },
      { href: "/platform/wechat-pay/applyments", label: "支付进件", icon: FileCheck2 },
      { href: "/platform/ai-models", label: "AI 模型路由", icon: Bot },
      { href: "/platform/audit-logs", label: "平台审计", icon: ScrollText },
      {
        href: "/platform/ocr",
        label: "证照识别",
        icon: ScanText,
        permission: "platform.ocr.recognition.read",
      },
      { href: "/platform/identity-diagnostics", label: "身份排障", icon: SearchCheck },
    ],
  },
  {
    label: "平台配置",
    items: [
      { href: "/settings", label: "系统配置", icon: SlidersHorizontal, activeMatch: "exact" },
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
      {
        href: "/wechat-rebind-requests",
        label: "微信换绑",
        icon: RefreshCw,
        permission: "customer.update",
      },
      { href: "/customer-service", label: "客服问题", icon: MessageSquareWarning },
      { href: "/projects", label: "项目", icon: BriefcaseBusiness },
      {
        href: "/workflows",
        label: "流程编排",
        icon: GitBranch,
        permission: "employee.permission_manage",
      },
      {
        href: "/acceptance-templates",
        label: "验收模板",
        icon: ClipboardCheck,
        permission: "employee.permission_manage",
      },
      { href: "/marketing", label: "营销活动", icon: Megaphone },
      {
        href: "/social-video",
        label: "自媒体脚本",
        icon: Clapperboard,
        permission: "social_video_transcription.manage",
      },
      { href: "/cameras", label: "工地监控", icon: Camera },
      { href: "/usage", label: "用量统计", icon: BarChart3 },
      { href: "/billing", label: "计费账户", icon: CircleDollarSign },
    ],
  },
  {
    label: "财务",
    items: [
      {
        href: "/finance",
        label: "财务总览",
        icon: CircleDollarSign,
        permission: "finance.dashboard.view",
        activeMatch: "exact",
      },
      {
        href: "/finance/ledger",
        label: "财务台账",
        icon: ScrollText,
        permission: "finance.ledger.view",
      },
      {
        href: "/finance/receivables",
        label: "应收计划",
        icon: CalendarClock,
        permission: "finance.receivable.view",
      },
      {
        href: "/finance/wechat-pay",
        label: "微信支付",
        icon: WalletCards,
        permission: "wechat_pay.config.read",
        activeMatch: "exact",
      },
      {
        href: "/finance/wechat-pay/applyment",
        label: "支付开通",
        icon: FileCheck2,
        permission: "wechat_pay.applyment.read",
      },
      {
        href: "/expenses",
        label: "费用审批",
        icon: CircleDollarSign,
        permission: "finance.expense.review",
      },
    ],
  },
  {
    label: "组织",
    items: [
      { href: "/employees", label: "员工", icon: BadgeCheck },
      { href: "/organization", label: "组织架构", icon: Building2 },
      { href: "/roles", label: "角色", icon: Shield },
      { href: "/permissions", label: "权限点", icon: KeyRound },
      {
        href: "/employee-personalization",
        label: "员工个性化",
        icon: Sparkles,
        permission: "employee.permission_manage",
      },
    ],
  },
  {
    label: "系统",
    items: [
      { href: "/settings", label: "系统配置", icon: SlidersHorizontal, activeMatch: "exact" },
      {
        href: "/settings/service-provider",
        label: "服务商资料",
        icon: Building2,
        permission: "service_provider.profile.read",
      },
    ],
  },
];
