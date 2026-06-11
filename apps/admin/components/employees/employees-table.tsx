"use client";

import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import {
  CircleSlash2,
  Globe2,
  MonitorSmartphone,
  Smartphone,
  UserRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  EMPLOYEE_STATUS_VALUES,
  EmployeeStatusConfig,
  type EmployeeStatus,
} from "@gooes/domain";
import {
  EmployeeRowActions,
  type EmployeeDepartmentOption,
  type EmployeePostOption,
} from "@/components/employees/employee-mutations";
import { DataTable } from "@/components/admin/data-table";
import { Badge } from "@/components/ui/badge";

export type EmployeeRecord = {
  id: string;
  name: string | null;
  phone: string | null;
  role?: string | null;
  roles?: EmployeeRoleSummary[];
  status: EmployeeStatus | string | null;
  tenant_department_id?: string | null;
  department_name?: string | null;
  department_code?: string | null;
  post_id: string | null;
  avatar: string | null;
  user_id?: string | null;
  created_at: string | null;
  last_login_time?: string | null;
  login_bindings?: {
    status: "none" | "web_only" | "wechat_only" | "web_and_wechat" | "other";
    label: string;
    web: boolean;
    wechat_mini: boolean;
    wechat_openid_masked?: string | null;
  } | null;
};

type EmployeeRoleSummary = {
  id: string;
  code: string;
  name: string;
  status: string;
};

const statusMeta: Record<string, {
  label: string;
  variant: "success" | "warning" | "secondary" | "outline";
}> = Object.fromEntries(
  EMPLOYEE_STATUS_VALUES.map((value) => {
    const type = EmployeeStatusConfig[value].type;
    return [
      value,
      {
        label: EmployeeStatusConfig[value].label,
        variant: type === "success" ? "success" : type === "warning" ? "warning" : type === "danger" ? "secondary" : "outline",
      },
    ];
  }),
);

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function maskPhone(value: string | null) {
  if (!value || value.length < 7) return value || "-";
  return `${value.slice(0, 3)}****${value.slice(-4)}`;
}

function getLoginBindingMeta(employee: EmployeeRecord): {
  label: string;
  description: string;
  variant: "success" | "warning" | "secondary" | "outline";
  icon: LucideIcon;
} {
  const binding = employee.login_bindings;
  const status = binding?.status || (employee.user_id ? "other" : "none");

  if (status === "web_and_wechat") {
    return {
      label: "后台 + 微信",
      description: binding?.wechat_openid_masked
        ? `微信 ${binding.wechat_openid_masked}`
        : "后台与小程序均可登录",
      variant: "success",
      icon: MonitorSmartphone,
    };
  }

  if (status === "web_only") {
    return {
      label: "仅后台账号",
      description: "可登录租户后台",
      variant: "outline",
      icon: Globe2,
    };
  }

  if (status === "wechat_only") {
    return {
      label: "仅微信小程序",
      description: binding?.wechat_openid_masked
        ? `微信 ${binding.wechat_openid_masked}`
        : "仅可通过小程序登录",
      variant: "warning",
      icon: Smartphone,
    };
  }

  if (status === "other") {
    return {
      label: binding?.label || "其他登录账号",
      description: "已有关联账号，登录入口待识别",
      variant: "secondary",
      icon: UserRound,
    };
  }

  return {
    label: "未开通登录",
    description: "暂无后台或小程序登录账号",
    variant: "secondary",
    icon: CircleSlash2,
  };
}

function getRoleBadgeVariant(role: EmployeeRoleSummary) {
  return role.status === "active" ? "outline" : "secondary";
}

function EmployeeRolesCell({ roles }: { roles?: EmployeeRoleSummary[] }) {
  if (!roles?.length) {
    return <span className="text-muted-foreground">未分配</span>;
  }

  const visibleRoles = roles.slice(0, 2);
  const hiddenCount = roles.length - visibleRoles.length;

  return (
    <div className="flex max-w-[220px] flex-wrap gap-1.5">
      {visibleRoles.map((role) => (
        <Badge
          key={role.id}
          variant={getRoleBadgeVariant(role)}
          className="max-w-[140px] truncate"
          title={`${role.name} · ${role.code}`}
        >
          {role.name || role.code}
        </Badge>
      ))}
      {hiddenCount > 0 ? (
        <Badge variant="secondary" title={roles.map((role) => role.name || role.code).join("、")}>
          +{hiddenCount}
        </Badge>
      ) : null}
    </div>
  );
}

export function EmployeesTable({
  employees,
  departments,
  posts,
  onEmployeeChanged,
}: {
  employees: EmployeeRecord[];
  departments: EmployeeDepartmentOption[];
  posts: EmployeePostOption[];
  onEmployeeChanged?: () => void;
}) {
  const departmentMap = useMemo(() => new Map(
    departments
      .map((department) =>
        department.tenant_department_id
          ? [department.tenant_department_id, department] as const
          : null
      )
      .filter((item): item is readonly [string, EmployeeDepartmentOption] => Boolean(item)),
  ), [departments]);
  const postMap = useMemo(() => new Map(posts.map((post) => [post.id, post])), [posts]);
  const columns = useMemo<ColumnDef<EmployeeRecord>[]>(() => [
    {
      id: "employee",
      header: "员工",
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center overflow-hidden rounded-md bg-accent text-accent-foreground">
            {row.original.avatar ? (
              <img
                src={row.original.avatar}
                alt={`${row.original.name || "员工"}头像`}
                className="size-full object-cover"
              />
            ) : (
              <UserRound className="size-4" />
            )}
          </div>
          <div className="min-w-0">
            <div className="truncate font-medium">
              {row.original.name || "未命名员工"}
            </div>
            <div className="max-w-[160px] truncate text-xs text-muted-foreground">
              {row.original.id}
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "phone",
      header: "手机号",
      cell: ({ row }) => maskPhone(row.original.phone),
      meta: {
        cellClassName: "whitespace-nowrap",
      },
    },
    {
      id: "status",
      header: "状态",
      cell: ({ row }) => {
        const meta = statusMeta[row.original.status || ""] || {
          label: row.original.status || "未知",
          variant: "outline" as const,
        };
        return (
          <Badge variant={meta.variant} className="whitespace-nowrap">
            {meta.label}
          </Badge>
        );
      },
      meta: {
        cellClassName: "whitespace-nowrap",
      },
    },
    {
      id: "login",
      header: "登录绑定",
      cell: ({ row }) => {
        const loginMeta = getLoginBindingMeta(row.original);
        const LoginIcon = loginMeta.icon;
        return (
          <div className="flex min-w-[132px] flex-col gap-1">
            <Badge variant={loginMeta.variant} className="w-fit gap-1">
              <LoginIcon className="size-3" />
              {loginMeta.label}
            </Badge>
            <div className="text-xs text-muted-foreground">
              {loginMeta.description}
            </div>
          </div>
        );
      },
    },
    {
      id: "roles",
      header: "角色",
      cell: ({ row }) => <EmployeeRolesCell roles={row.original.roles} />,
    },
    {
      id: "department",
      header: "部门",
      cell: ({ row }) => {
        const department = row.original.tenant_department_id
          ? departmentMap.get(row.original.tenant_department_id)
          : null;
        const departmentName = row.original.department_name || department?.name || "";
        const departmentCode = row.original.department_code || department?.code || "";
        return departmentName || departmentCode ? (
          <div className="whitespace-nowrap">
            <div className="font-medium text-foreground">{departmentName || "-"}</div>
            <div className="text-xs text-muted-foreground">{departmentCode || "-"}</div>
          </div>
        ) : (
          <span className="text-muted-foreground">-</span>
        );
      },
    },
    {
      id: "post",
      header: "职位",
      cell: ({ row }) => {
        const post = row.original.post_id ? postMap.get(row.original.post_id) : null;
        return post ? (
          <div className="whitespace-nowrap">
            <div className="font-medium text-foreground">{post.name}</div>
            <div className="text-xs text-muted-foreground">{post.code}</div>
          </div>
        ) : (
          <span className="text-muted-foreground">-</span>
        );
      },
    },
    {
      id: "createdAt",
      header: "创建时间",
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {formatDate(row.original.created_at)}
        </span>
      ),
    },
    {
      id: "actions",
      header: () => <div className="text-right">操作</div>,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <EmployeeRowActions
            employee={row.original}
            departments={departments}
            posts={posts}
            onChanged={onEmployeeChanged}
          />
        </div>
      ),
      meta: {
        headerClassName: "text-right lg:sticky lg:right-0 lg:bg-muted lg:shadow-[-12px_0_18px_-18px_hsl(var(--foreground)/0.25)]",
        cellClassName: "text-right lg:sticky lg:right-0 lg:bg-card lg:shadow-[-12px_0_18px_-18px_hsl(var(--foreground)/0.25)]",
      },
    },
  ], [departmentMap, departments, onEmployeeChanged, postMap, posts]);

  return (
    <DataTable
      columns={columns}
      data={employees}
      emptyText="没有符合条件的员工"
      minWidth="min-w-[1180px]"
    />
  );
}
