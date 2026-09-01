import Link from "next/link";
import { redirect } from "next/navigation";
import type { DouyinMaterialNoteTenantList } from "@gooes/domain";
import { Plus } from "lucide-react";

import { StatusAlert } from "@/components/admin/status-alert";
import {
  buildMaterialNoteListQuery,
  getMaterialNotePermissions,
  normalizeMaterialNoteFilters,
  parseMaterialNoteList,
} from "@/components/douyin-miniapp/material-note-contract";
import {
  MaterialNoteFilters,
  MaterialNotePagination,
  MaterialNoteTable,
} from "@/components/douyin-miniapp/material-note-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { getAdminSession, getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

type SearchParams = Promise<Partial<Record<
  "page" | "pageSize" | "status" | "keyword",
  string | string[] | undefined
>>>;

export default async function TenantMaterialNotesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const [session, token, rawFilters] = await Promise.all([
    getAdminSession(),
    getAdminToken(),
    searchParams,
  ]);
  if (!session) redirect("/login");

  const permissions = getMaterialNotePermissions(
    session.permissions.map((permission) => permission.code),
  );
  if (session.tenant === null || !permissions.canRead) {
    return <StatusAlert>当前账号缺少 douyin_material_note.read 权限</StatusAlert>;
  }

  const filters = normalizeMaterialNoteFilters(rawFilters);
  const fallback: DouyinMaterialNoteTenantList = {
    list: [],
    pagination: {
      page: filters.page,
      pageSize: filters.pageSize,
      total: 0,
      totalPages: 0,
    },
  };
  let data = fallback;
  let error: string | null = null;
  if (!token) {
    error = "缺少登录凭证，请重新登录后重试";
  } else {
    try {
      const response = await fetch(
        buildBackendUrl(
          `/tenant/douyin-material-notes?${buildMaterialNoteListQuery(filters)}`,
        ),
        { headers: { authorization: `Bearer ${token}` }, cache: "no-store" },
      );
      const payload = await parseBackendJson<unknown>(response);
      data = parseMaterialNoteList(payload.data);
      if (
        data.pagination.page !== filters.page
        || data.pagination.pageSize !== filters.pageSize
      ) {
        data = fallback;
        error = "资料列表分页响应与请求不一致，请刷新后重试";
      }
    } catch (loadError) {
      error = loadError instanceof Error ? loadError.message : "资料列表加载失败";
    }
  }

  return (
    <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-5 overflow-hidden">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div><h1 className="text-xl font-semibold tracking-normal">资料笔记</h1>
          <p className="mt-1 text-sm text-muted-foreground">创建结构化文本资料，以不可变版本发布给抖音小程序访客领取。</p>
        </div>
        {permissions.canManage ? <Button asChild><Link href="/douyin-miniapp/materials/new">
          <Plus data-icon="inline-start" />新建资料
        </Link></Button> : null}
      </div>
      {!permissions.canManage ? <StatusAlert tone="warning" title="只读模式">
        当前账号可以查看资料，但新建和创建版本需要 douyin_material_note.manage 权限。
      </StatusAlert> : null}
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-none">
        <CardHeader className="shrink-0 border-b bg-muted/20 p-3">
          <MaterialNoteFilters filters={filters} />
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col p-0">
          <div className="min-h-0 flex-1 overflow-auto">
            <MaterialNoteTable items={data.list} initialError={error} />
          </div>
          <MaterialNotePagination pagination={data.pagination} />
        </CardContent>
      </Card>
    </div>
  );
}
