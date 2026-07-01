import Link from "next/link";
import { WalletCards } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { FinanceModuleTabs } from "@/components/finance/finance-module-tabs";
import { FinanceWechatPayConfigForm } from "@/components/finance/finance-wechat-pay-config-form";
import { fetchWechatPayConfig } from "@/components/finance/finance-wechat-pay-requests";
import { getTenantBusinessAccessDenied } from "@/components/layout/platform-mode-access-denied";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function FinanceWechatPayPage() {
  const accessDenied = await getTenantBusinessAccessDenied();
  if (accessDenied) return accessDenied;

  const data = await fetchWechatPayConfig();

  return (
    <div className="flex min-h-0 flex-col gap-5 overflow-visible lg:h-[calc(100vh-6.5625rem)] lg:overflow-hidden">
      <div className="shrink-0 flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground">
            <WalletCards aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-normal">微信支付</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              租户微信支付商户配置、回调地址、证书序列号和校验状态
            </p>
          </div>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/finance/wechat-pay/orders">支付订单</Link>
        </Button>
      </div>

      <FinanceModuleTabs activeTab="wechat-pay" />

      <div className="min-h-0 flex-1 overflow-auto">
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>商户配置</CardTitle>
            <CardDescription>
              配置保存后会重置为待校验，真实证书和密钥通过密钥引用管理。
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.error && !data.config ? (
              <StatusAlert>{data.error}</StatusAlert>
            ) : (
              <FinanceWechatPayConfigForm data={data} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
