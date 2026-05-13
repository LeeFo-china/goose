"use client";

import { BadgeCheck, UserRound } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";

export type EmployeeRecord = {
  id: string;
  name: string | null;
  phone: string | null;
  role?: string | null;
  status: EmployeeStatus | string | null;
  department_id: string | null;
  post_id: string | null;
  avatar: string | null;
  user_id?: string | null;
  created_at: string | null;
  last_login_time?: string | null;
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

export function EmployeesTable({
  employees,
  departments,
  posts,
}: {
  employees: EmployeeRecord[];
  departments: EmployeeDepartmentOption[];
  posts: EmployeePostOption[];
}) {
  const departmentMap = new Map(departments.map((department) => [department.id, department]));
  const postMap = new Map(posts.map((post) => [post.id, post]));

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1040px] border-t text-sm">
        <thead className="bg-muted/60 text-left text-xs font-medium text-muted-foreground">
          <tr>
            <th className="px-5 py-3">员工</th>
            <th className="px-5 py-3">手机号</th>
            <th className="px-5 py-3">状态</th>
            <th className="px-5 py-3">登录绑定</th>
            <th className="px-5 py-3">部门</th>
            <th className="px-5 py-3">职位</th>
            <th className="px-5 py-3">创建时间</th>
            <th className="px-5 py-3 text-right">操作</th>
          </tr>
        </thead>
        <tbody>
          {employees.length > 0 ? (
            employees.map((employee) => {
              const meta = statusMeta[employee.status || ""] || {
                label: employee.status || "未知",
                variant: "outline" as const,
              };
              const department = employee.department_id
                ? departmentMap.get(employee.department_id)
                : null;
              const post = employee.post_id ? postMap.get(employee.post_id) : null;

              return (
                <tr key={employee.id} className="border-t transition-colors hover:bg-muted/40">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex size-9 items-center justify-center overflow-hidden rounded-md bg-accent text-accent-foreground">
                        {employee.avatar ? (
                          <img
                            src={employee.avatar}
                            alt={`${employee.name || "员工"}头像`}
                            className="size-full object-cover"
                          />
                        ) : (
                          <UserRound className="size-4" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate font-medium">
                          {employee.name || "未命名员工"}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {employee.id}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">{maskPhone(employee.phone)}</td>
                  <td className="px-5 py-4">
                    <Badge variant={meta.variant}>{meta.label}</Badge>
                  </td>
                  <td className="px-5 py-4">
                    {employee.user_id ? (
                      <Badge variant="success">
                        <BadgeCheck className="size-3" />
                        已绑定
                      </Badge>
                    ) : (
                      <Badge variant="secondary">未绑定</Badge>
                    )}
                  </td>
                  <td className="px-5 py-4 text-muted-foreground">
                    {department ? (
                      <div>
                        <div className="font-medium text-foreground">{department.name}</div>
                        <div className="text-xs text-muted-foreground">{department.code}</div>
                      </div>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-5 py-4 text-muted-foreground">
                    {post ? (
                      <div>
                        <div className="font-medium text-foreground">{post.name}</div>
                        <div className="text-xs text-muted-foreground">{post.code}</div>
                      </div>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-5 py-4 text-muted-foreground">
                    {formatDate(employee.created_at)}
                  </td>
                  <td className="relative px-5 py-4">
                    <EmployeeRowActions
                      employee={employee}
                      departments={departments}
                      posts={posts}
                    />
                  </td>
                </tr>
              );
            })
          ) : (
            <tr>
              <td className="px-5 py-12 text-center text-muted-foreground" colSpan={8}>
                没有符合条件的员工
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
