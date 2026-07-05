import Link from "next/link";
import { FileCheck2 } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { FinanceModuleTabs } from "@/components/finance/finance-module-tabs";
import { FinanceWechatPayApplymentPanel } from "@/components/finance/finance-wechat-pay-applyment-panel";
import { fetchWechatPayApplymentCurrent } from "@/components/finance/finance-wechat-pay-applyment-requests";
import { getTenantBusinessAccessDenied } from "@/components/layout/platform-mode-access-denied";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function FinanceWechatPayApplymentPage() {
  const accessDenied = await getTenantBusinessAccessDenied();
  if (accessDenied) return accessDenied;

  const data = await fetchWechatPayApplymentCurrent();

  return (
    <div className="flex min-h-0 flex-col gap-5 overflow-visible lg:h-[calc(100vh-6.5625rem)] lg:overflow-hidden">
      <div className="shrink-0 flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground">
            <FileCheck2 aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-normal">微信支付开通</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              提交租户特约商户资料，查看平台审核、人工进件和 AppID 绑定进度。
            </p>
          </div>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/finance/wechat-pay">商户配置</Link>
        </Button>
      </div>

      <FinanceModuleTabs activeTab="wechat-pay-applyment" />

      <div className="min-h-0 flex-1 overflow-auto">
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>开通申请</CardTitle>
            <CardDescription>
              申请通过并完成平台激活后，项目收款才会使用租户子商户号。
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.error && !data.applyment ? (
              <StatusAlert>{data.error}</StatusAlert>
            ) : (
              <FinanceWechatPayApplymentPanel data={data} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
