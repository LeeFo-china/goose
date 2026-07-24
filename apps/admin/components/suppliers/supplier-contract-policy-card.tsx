"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";

import {
  loadTenantSupplierSettings,
  updateTenantSupplierContractPolicy,
} from "./supplier-settings-api";
import type { TenantSupplierSettings } from "./supplier-types";

export function SupplierContractPolicyCard({
  settings,
  canManage,
  onSettingsChange,
}: {
  settings: TenantSupplierSettings;
  canManage: boolean;
  onSettingsChange: (settings: TenantSupplierSettings) => void;
}) {
  const [pending, setPending] = useState(false);
  const [pendingIntent, setPendingIntent] = useState<boolean | null>(null);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refreshLatest() {
    try {
      const latest = await loadTenantSupplierSettings();
      onSettingsChange(latest);
      setError(null);
      return latest;
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "供应商模块配置刷新失败",
      );
      return null;
    }
  }

  async function save(intent: boolean, expectedVersion: number) {
    setPending(true);
    setPendingIntent(intent);
    setConflict(false);
    setError(null);
    try {
      const updated = await updateTenantSupplierContractPolicy({
        requireActiveContract: intent,
        expectedVersion,
      });
      onSettingsChange(updated);
      setPendingIntent(null);
      toast.success("新订单合同策略已更新");
    } catch (requestError) {
      if ((requestError as { status?: number }).status === 409) {
        setConflict(true);
        await refreshLatest();
      } else {
        const message = requestError instanceof Error
          ? requestError.message
          : "新订单合同策略保存失败";
        setError(message);
        toast.error(message);
      }
    } finally {
      setPending(false);
    }
  }

  async function retry() {
    if (pendingIntent === null) return;
    const latest = await refreshLatest();
    if (latest) await save(pendingIntent, latest.version);
  }

  return (
    <Card className="shadow-none">
      <CardContent className="flex flex-col gap-4 p-4">
        <Field className="flex-row items-center gap-4">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div className="rounded-md border bg-muted/30 p-2 text-muted-foreground">
              <ShieldCheck className="size-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <FieldLabel htmlFor="supplier-contract-policy">
                  新订单合同策略
                </FieldLabel>
                <Badge
                  variant={
                    settings.require_active_contract_for_new_order
                      ? "warning"
                      : "secondary"
                  }
                >
                  {settings.require_active_contract_for_new_order
                    ? "要求生效合同"
                    : "不强制"}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                开启后，无生效合同的合作供应商不能创建新订单。
              </p>
            </div>
          </div>
          <Switch
            id="supplier-contract-policy"
            checked={settings.require_active_contract_for_new_order}
            disabled={!canManage || pending || !settings.module_enabled}
            aria-label="创建新订单前要求生效合同"
            onCheckedChange={(checked) => void save(checked, settings.version)}
          />
        </Field>
        {!canManage ? (
          <p className="text-xs text-muted-foreground">
            当前账号没有 supplier.manage 权限，仅可查看合同策略。
          </p>
        ) : null}
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>合同策略更新失败</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {conflict ? (
          <Alert variant="destructive">
            <AlertTitle>数据版本已变化</AlertTitle>
            <AlertDescription className="flex flex-col gap-3">
              <p>已刷新最新设置，可重试刚才的合同策略操作。</p>
              <Button
                type="button"
                size="sm"
                className="self-start"
                disabled={pending}
                onClick={() => void retry()}
              >
                重试本次操作
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}
