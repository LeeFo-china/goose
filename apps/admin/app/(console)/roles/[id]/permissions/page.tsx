import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, KeyRound } from "lucide-react";
import { RoleStatusConfig, type RoleStatus } from "@gooes/domain";
import { StatusAlert } from "@/components/admin/status-alert";
import { getTenantBusinessAccessDenied } from "@/components/layout/platform-mode-access-denied";
import { RolePermissionsEditor } from "@/components/roles/role-permissions-editor";
import type { RoleDetail } from "@/components/roles/role-mutation-shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

type RouteParams = {
  id: string;
};

function isStatus(value: string | undefined): value is RoleStatus {
  return value === "active" || value === "inactive";
}

async function getRole(id: string) {
  const token = await getAdminToken();
  if (!token) {
    return {
      role: null,
      error: "缺少登录凭证",
    };
  }

  try {
    const response = await fetch(buildBackendUrl(`/roles/${id}`), {
      headers: {
        authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
    const payload = await parseBackendJson<RoleDetail>(response);
    return {
      role: payload.data || null,
      error: null,
    };
  } catch (error) {
    const status = error instanceof Error && "status" in error
      ? (error as Error & { status?: number }).status
      : undefined;
    if (status === 404) {
      return {
        role: null,
        error: null,
      };
    }

    return {
      role: null,
      error: error instanceof Error ? error.message : "角色权限加载失败",
    };
  }
}

export default async function RolePermissionsPage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const accessDenied = await getTenantBusinessAccessDenied();
  if (accessDenied) return accessDenied;

  const { id } = await params;
  const { role, error } = await getRole(id);

  if (!role && !error) {
    notFound();
  }

  const normalizedStatus = isStatus(role?.status) ? role.status : undefined;
  const statusMeta = normalizedStatus ? RoleStatusConfig[normalizedStatus] : null;

  return (
    <div className="flex h-[calc(100vh-7.5rem)] min-h-[620px] flex-col gap-4">
      <div className="shrink-0">
        <Button asChild variant="ghost" className="mb-2 px-0">
          <Link href="/roles">
            <ArrowLeft data-icon="inline-start" />
            返回角色列表
          </Link>
        </Button>
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
          <div className="flex items-start gap-3">
            <div className="mt-1 flex size-10 items-center justify-center rounded-md bg-accent text-accent-foreground">
              <KeyRound className="size-5" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-normal">配置角色权限</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {role
                  ? `${role.name}，当前已分配 ${role.permission_count ?? role.permissions.length} 个权限点。`
                  : "读取角色权限配置失败。"}
              </p>
            </div>
          </div>
          {statusMeta ? <Badge variant="outline">{statusMeta.label}</Badge> : null}
        </div>
      </div>

      {error ? <StatusAlert>{error}</StatusAlert> : null}

      {role ? (
        <RolePermissionsEditor role={role} initialRoleDetail={role} />
      ) : null}
    </div>
  );
}
