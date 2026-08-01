"use client";

import { ShieldCheck } from "lucide-react";
import Link from "next/link";

import { StatusAlert } from "@/components/admin/status-alert";
import { virtualPaymentModeLabels } from "@/components/settings/platform-virtual-payment-settings-data";
import type { PlatformVirtualPaymentSettingsView } from "@/components/settings/platform-virtual-payment-settings-types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import type { BrandingPurchaseMode } from "@gooes/domain";

export function VirtualPaymentModeCard({
  snapshot,
  modePending,
  modeError,
  onChangeMode,
}: {
  snapshot: PlatformVirtualPaymentSettingsView;
  modePending: boolean;
  modeError: string;
  onChangeMode: (mode: BrandingPurchaseMode) => Promise<void>;
}) {
  const mode = snapshot.product.purchase_mode;
  return (
    <Card className="shadow-none">
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <CardTitle>数字权益购买通道</CardTitle>
          <CardDescription>
            普通支付商户号继续保留，虚拟支付只承接平台数字权益。
          </CardDescription>
        </div>
        <Badge variant={mode === "wechat_virtual" ? "success" : "secondary"}>
          {virtualPaymentModeLabels[mode]}
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {modeError ? <StatusAlert>{modeError}</StatusAlert> : null}
        {snapshot.readiness.ready ? (
          <StatusAlert tone="success" title="生产配置已就绪">
            可以启用微信虚拟支付。
          </StatusAlert>
        ) : (
          <StatusAlert tone="warning" title="启用前需完成">
            <ul className="flex list-disc flex-col gap-1 pl-4">
              {snapshot.readiness.blockers.map((blocker) => (
                <li key={blocker.code}>
                  {blocker.message}
                  {blocker.settings_href ? (
                    <Link
                      className="ml-1 underline underline-offset-4"
                      href={blocker.settings_href}
                    >
                      前往配置
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          </StatusAlert>
        )}
      </CardContent>
      <CardFooter className="justify-end gap-2 border-t pt-5">
        {mode === "direct_legacy" ? (
          <Button
            type="button"
            variant="outline"
            disabled={!snapshot.can_manage || modePending}
            onClick={() => void onChangeMode("maintenance")}
          >
            {modePending ? <Spinner data-icon="inline-start" /> : null}
            进入维护模式
          </Button>
        ) : null}
        {mode === "wechat_virtual" ? (
          <Button
            type="button"
            variant="outline"
            disabled={!snapshot.can_manage || modePending}
            onClick={() => void onChangeMode("maintenance")}
          >
            {modePending ? <Spinner data-icon="inline-start" /> : null}
            暂停虚拟支付
          </Button>
        ) : null}
        {mode === "maintenance" ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                disabled={!snapshot.readiness.ready || !snapshot.can_manage || modePending}
              >
                {modePending
                  ? <Spinner data-icon="inline-start" />
                  : <ShieldCheck data-icon="inline-start" />}
                启用生产虚拟支付
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>确认启用生产虚拟支付</AlertDialogTitle>
                <AlertDialogDescription>
                  启用后数字权益订单将使用微信虚拟支付，并且不会自动回退普通支付。请确认生产映射、AppKey 和消息配置均已核对。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => void onChangeMode("wechat_virtual")}
                >
                  确认启用
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
      </CardFooter>
    </Card>
  );
}
