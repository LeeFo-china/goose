"use client";

import { type FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, Loader2 } from "lucide-react";
import type {
  TenantRechargeOrderCreateResult,
  TenantRechargeProduct,
} from "@/components/billing/billing-types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { requestBackendJson } from "@/lib/backend-client";
import { refreshAfterDialogClose } from "@/lib/deferred-refresh";

export function TenantRechargeOrderButton({
  product,
}: {
  product: TenantRechargeProduct;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [result, setResult] = useState<TenantRechargeOrderCreateResult | null>(
    null,
  );

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setResult(null);
    const formData = new FormData(event.currentTarget);
    const payerOpenid = stringField(formData, "payer_openid");
    if (!payerOpenid) {
      setError("请填写付款微信标识");
      return;
    }

    startTransition(async () => {
      try {
        const data = await requestBackendJson<TenantRechargeOrderCreateResult>(
          "/billing/recharge-orders",
          {
            method: "POST",
            body: JSON.stringify({
              package_code: product.code,
              payer_openid: payerOpenid,
              idempotency_key: crypto.randomUUID(),
            }),
            fallbackMessage: "创建充值订单失败",
          },
        );
        setResult(data);
        refreshAfterDialogClose(router);
      } catch (submitError) {
        setError(
          submitError instanceof Error
            ? submitError.message
            : "创建充值订单失败",
        );
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <CreditCard data-icon="inline-start" />
          创建支付订单
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>创建积分充值订单</DialogTitle>
          <DialogDescription>
            {product.title}，到账 {formatCredits(product.credits + product.bonus_credits)} 积分。
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={onSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`payer-openid-${product.code}`}>
                付款微信标识
              </FieldLabel>
              <Input
                id={`payer-openid-${product.code}`}
                name="payer_openid"
                placeholder="员工小程序 openid"
                autoComplete="off"
              />
              <FieldDescription>
                用于生成小程序微信支付参数。
              </FieldDescription>
            </Field>
          </FieldGroup>
          {result ? (
            <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm">
              <div className="font-medium">订单 {result.order.order_no}</div>
              <div className="mt-1 text-muted-foreground">
                状态 {orderStatusLabel(result.order.status)}
                {result.payment_request ? "，支付参数已生成" : ""}
              </div>
            </div>
          ) : null}
          <FieldError>{error}</FieldError>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              关闭
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? (
                <Loader2 className="animate-spin" data-icon="inline-start" />
              ) : null}
              创建订单
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function stringField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function formatCredits(value: number) {
  return Number(value || 0).toLocaleString("zh-CN");
}

function orderStatusLabel(status: string) {
  if (status === "pending") return "待支付";
  if (status === "paid") return "已支付";
  if (status === "closed") return "已关闭";
  if (status === "refunded") return "已退款";
  return status;
}
