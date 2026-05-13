import { redirect } from "next/navigation";
import { IdentityDiagnosticsResult } from "@/components/platform-identity-diagnostics/identity-diagnostics-result";
import { IdentityDiagnosticsSearch } from "@/components/platform-identity-diagnostics/identity-diagnostics-search";
import type { IdentityDiagnosticData } from "@/components/platform-identity-diagnostics/identity-diagnostics-types";
import { StatusAlert } from "@/components/admin/status-alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { getAdminSession, getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

type SearchParams = Promise<{
  keyword?: string;
}>;

async function getDiagnostics(keyword: string) {
  const token = await getAdminToken();
  if (!token) {
    return {
      data: null,
      error: "缺少登录凭证",
    };
  }

  try {
    const query = new URLSearchParams({ keyword });
    const response = await fetch(buildBackendUrl(`/platform/identity-diagnostics?${query.toString()}`), {
      headers: {
        authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
    const payload = await parseBackendJson<IdentityDiagnosticData>(response);
    return {
      data: payload.data ?? null,
      error: null,
    };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : "身份排障数据加载失败",
    };
  }
}

export default async function PlatformIdentityDiagnosticsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await getAdminSession();
  if (!session) {
    redirect("/login");
  }

  const hasPlatformAccess = session.roles.includes("platform_admin");
  const params = await searchParams;
  const keyword = (params.keyword || "").trim().slice(0, 160);
  const result = hasPlatformAccess && keyword
    ? await getDiagnostics(keyword)
    : { data: null, error: hasPlatformAccess ? null : "当前账号不是平台超管，无法访问身份排障" };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">身份排障</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          按手机号、openid 或 user_id 聚合查看登录凭证、业务身份、旧字段和身份事件。
        </p>
      </div>

      {result.error ? <StatusAlert>{result.error}</StatusAlert> : null}

      <Card>
        <CardHeader>
          <CardTitle>查询条件</CardTitle>
          <CardDescription>
            用于灰度 membership 登录模型时快速定位微信解绑、手机号恢复和业务身份不一致问题。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <IdentityDiagnosticsSearch keyword={keyword} />
        </CardContent>
      </Card>

      {!keyword ? (
        <Empty className="min-h-[260px]">
          <EmptyHeader>
            <EmptyTitle>输入关键词开始排查</EmptyTitle>
            <EmptyDescription>
              支持 11 位手机号、微信 openid、auth user_id，也可以输入客户或员工档案 ID。
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      {result.data ? <IdentityDiagnosticsResult data={result.data} /> : null}
    </div>
  );
}
