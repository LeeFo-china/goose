"use client";

import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { UserRound } from "lucide-react";
import type { EmployeeStatus } from "@gooes/domain";

import { DataTable } from "@/components/admin/data-table";
import { PLATFORM_LIST_TABLE_ROW_HEIGHT_CLASS_NAME } from "@/components/platform/platform-list-page-size";
import { Badge } from "@/components/ui/badge";

import { PlatformOperatorRowActions } from "./platform-operator-actions";
import {
  formatPlatformOperatorDate,
  platformOperatorStatusMeta,
} from "./platform-operator-rules";
import type {
  PlatformOperator,
  PlatformOperatorRole,
  PlatformRoleOption,
} from "./platform-operator-types";

const IDENTITY_COLUMN_CLASS_NAME = "min-w-[230px]";
const PHONE_COLUMN_CLASS_NAME = "w-[128px] whitespace-nowrap";
const STATUS_COLUMN_CLASS_NAME = "w-[88px] whitespace-nowrap";
const ROLES_COLUMN_CLASS_NAME = "min-w-[220px]";
const LOGIN_COLUMN_CLASS_NAME = "hidden w-[156px] whitespace-nowrap xl:table-cell";
const UPDATED_COLUMN_CLASS_NAME = "hidden w-[156px] whitespace-nowrap 2xl:table-cell";
const ACTION_COLUMN_CLASS_NAME = "w-[230px] whitespace-nowrap text-right";

function getStatusMeta(status: string | null | undefined) {
  if (status && status in platformOperatorStatusMeta) {
    return platformOperatorStatusMeta[status as EmployeeStatus];
  }

  return {
    label: status || "未知",
    variant: "outline" as const,
  };
}

function RolesCell({ roles }: { roles: PlatformOperatorRole[] }) {
  if (!roles.length) {
    return <span className="text-muted-foreground">未分配</span>;
  }

  const visibleRoles = roles.slice(0, 3);
  const hiddenCount = roles.length - visibleRoles.length;

  return (
    <div className="flex min-w-0 flex-wrap gap-1.5">
      {visibleRoles.map((role) => (
        <Badge
          key={role.id}
          variant={role.status === "active" ? "outline" : "secondary"}
          className="max-w-[132px] truncate"
          title={`${role.name || role.code} · ${role.code}`}
        >
          {role.name || role.code}
        </Badge>
      ))}
      {hiddenCount > 0 ? (
        <Badge variant="secondary">+{hiddenCount}</Badge>
      ) : null}
    </div>
  );
}

export function PlatformOperatorsTable({
  operators,
  roles,
  canManage,
}: {
  operators: PlatformOperator[];
  roles: PlatformRoleOption[];
  canManage: boolean;
}) {
  const columns = useMemo<ColumnDef<PlatformOperator>[]>(() => [
    {
      accessorKey: "name",
      header: "平台人员",
      cell: ({ row }) => (
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
            <UserRound aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="truncate font-semibold">{row.original.name || "未命名人员"}</div>
            <div className="truncate text-xs tabular-nums text-muted-foreground">
              {row.original.id}
            </div>
          </div>
        </div>
      ),
      meta: {
        headerClassName: IDENTITY_COLUMN_CLASS_NAME,
        cellClassName: IDENTITY_COLUMN_CLASS_NAME,
      },
    },
    {
      accessorKey: "phone",
      header: "手机号",
      cell: ({ row }) => (
        <span className="tabular-nums">{row.original.phone_masked || row.original.phone || "-"}</span>
      ),
      meta: {
        headerClassName: PHONE_COLUMN_CLASS_NAME,
        cellClassName: PHONE_COLUMN_CLASS_NAME,
      },
    },
    {
      accessorKey: "status",
      header: "状态",
      cell: ({ row }) => {
        const meta = getStatusMeta(row.original.status);
        return <Badge variant={meta.variant}>{meta.label}</Badge>;
      },
      meta: {
        headerClassName: STATUS_COLUMN_CLASS_NAME,
        cellClassName: STATUS_COLUMN_CLASS_NAME,
      },
    },
    {
      id: "roles",
      header: "角色",
      cell: ({ row }) => <RolesCell roles={row.original.roles} />,
      meta: {
        headerClassName: ROLES_COLUMN_CLASS_NAME,
        cellClassName: ROLES_COLUMN_CLASS_NAME,
      },
    },
    {
      accessorKey: "last_login_time",
      header: "最近登录",
      cell: ({ row }) => (
        <span className="tabular-nums text-muted-foreground">
          {formatPlatformOperatorDate(row.original.last_login_time)}
        </span>
      ),
      meta: {
        headerClassName: LOGIN_COLUMN_CLASS_NAME,
        cellClassName: LOGIN_COLUMN_CLASS_NAME,
      },
    },
    {
      accessorKey: "updated_at",
      header: "更新时间",
      cell: ({ row }) => (
        <span className="tabular-nums text-muted-foreground">
          {formatPlatformOperatorDate(row.original.updated_at)}
        </span>
      ),
      meta: {
        headerClassName: UPDATED_COLUMN_CLASS_NAME,
        cellClassName: UPDATED_COLUMN_CLASS_NAME,
      },
    },
    {
      id: "actions",
      header: () => <div className="text-right">操作</div>,
      cell: ({ row }) => (
        <PlatformOperatorRowActions
          operator={row.original}
          roles={roles}
          canManage={canManage}
        />
      ),
      meta: {
        headerClassName: ACTION_COLUMN_CLASS_NAME,
        cellClassName: ACTION_COLUMN_CLASS_NAME,
      },
    },
  ], [canManage, roles]);

  return (
    <DataTable
      columns={columns}
      data={operators}
      emptyText="当前筛选条件下没有平台人员"
      minWidth="min-w-[1080px]"
      tableClassName="border-t-0 table-fixed"
      rowClassName={() => PLATFORM_LIST_TABLE_ROW_HEIGHT_CLASS_NAME}
    />
  );
}
