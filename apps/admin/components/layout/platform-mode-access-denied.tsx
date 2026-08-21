import Link from "next/link";
import { Building2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getAdminSession } from "@/lib/auth";
import { isPlatformOnlySession } from "@/lib/session-mode";

export function PlatformModeAccessDenied() {
  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center">
      <Card className="w-full max-w-2xl border-border bg-card shadow-none">
        <CardHeader className="gap-4">
          <div className="flex size-12 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ShieldAlert className="size-6" />
          </div>
          <div>
            <CardTitle className="text-xl">当前为平台管理模式</CardTitle>
            <CardDescription className="mt-2 leading-6">
              平台超管不能直接访问客户、项目、费用、营销等租户业务页面。请先从平台租户中选择目标公司，再进入明确的租户视角。
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Link href="/dashboard">
              <Building2 data-icon="inline-start" />
              返回平台工作台
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/platform/tenants">查看平台租户</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export async function getTenantBusinessAccessDenied() {
  const session = await getAdminSession();
  return isPlatformOnlySession(session) ? <PlatformModeAccessDenied /> : null;
}
