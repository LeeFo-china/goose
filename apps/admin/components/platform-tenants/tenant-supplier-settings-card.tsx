"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";

import {
  formatDate,
  newIdempotencyKey,
  type TenantSupplierSettings,
} from "../suppliers/supplier-types";
import {
  loadPlatformTenantSupplierSettings,
  type PlatformModuleIntent,
  updatePlatformTenantSupplierModule,
} from "../suppliers/supplier-settings-api";

type PendingModuleIntent = PlatformModuleIntent & {
  idempotencyKey: string;
};

const defaultSettings = (tenantId: string): TenantSupplierSettings => ({
  tenant_id: tenantId,
  module_enabled: false,
  require_active_contract_for_new_order: false,
  enabled_by_employee_id: null,
  enabled_at: null,
  version: 0,
  created_at: "",
  updated_at: "",
});

export function TenantSupplierSettingsCard({
  tenantId,
  initialSettings,
  initialError,
  canManage,
}: {
  tenantId: string;
  initialSettings: TenantSupplierSettings | null;
  initialError?: string | null;
  canManage: boolean;
}) {
  const [settings, setSettings] = useState(
    initialSettings ?? defaultSettings(tenantId),
  );
  const [disableReason, setDisableReason] = useState("");
  const [reasonError, setReasonError] = useState(false);
  const [pending, setPending] = useState(false);
  const [pendingIntent, setPendingIntent] =
    useState<PendingModuleIntent | null>(null);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState(initialError ?? null);

  async function loadLatest() {
    try {
      const latest = await loadPlatformTenantSupplierSettings(tenantId);
      const normalized = latest ?? defaultSettings(tenantId);
      setSettings(normalized);
      setError(null);
      return normalized;
    } catch (requestError) {
      const message = requestError instanceof Error
        ? requestError.message
        : "供应商模块配置刷新失败";
      setError(message);
      return null;
    }
  }

  async function save(
    intent: PendingModuleIntent,
    current = settings,
  ) {
    setPending(true);
    setPendingIntent(intent);
    setConflict(false);
    try {
      const updated = await updatePlatformTenantSupplierModule({
        tenantId,
        current,
        intent,
        idempotencyKey: intent.idempotencyKey,
      });
      setSettings(updated);
      setDisableReason("");
      setReasonError(false);
      setPendingIntent(null);
      setError(null);
      toast.success(intent.moduleEnabled ? "供应商模块已启用" : "供应商模块已停用");
    } catch (requestError) {
      if ((requestError as { status?: number }).status === 409) {
        setConflict(true);
        await loadLatest();
      } else {
        const message = requestError instanceof Error
          ? requestError.message
          : "供应商模块配置保存失败";
        setError(message);
        toast.error(message);
      }
    } finally {
      setPending(false);
    }
  }

  function startModuleMutation() {
    const moduleEnabled = !settings.module_enabled;
    const reason = disableReason.trim();
    if (!moduleEnabled && !reason) {
      setReasonError(true);
      return;
    }
    void save({
      moduleEnabled,
      ...(reason ? { reason } : {}),
      idempotencyKey: newIdempotencyKey("tenant-supplier-settings"),
    });
  }

  async function retry() {
    if (!pendingIntent) return;
    const latest = await loadLatest();
    if (latest) await save(pendingIntent, latest);
  }

  return (
    <Card className="shadow-none">
      <CardHeader>
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>供应商模块</CardTitle>
              <Badge variant={settings.module_enabled ? "success" : "secondary"}>
                {settings.module_enabled ? "已启用" : "未启用"}
              </Badge>
            </div>
            <CardDescription className="mt-1">
              控制该租户是否可建立供应商合作关系。合同策略由租户自行维护。
            </CardDescription>
          </div>
          {canManage ? (
            <Button
              type="button"
              variant={settings.module_enabled ? "destructive" : "default"}
              disabled={pending || Boolean(error)}
              onClick={startModuleMutation}
            >
              {pending
                ? "正在保存"
                : settings.module_enabled
                  ? "停用供应商模块"
                  : "启用供应商模块"}
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>供应商模块配置异常</AlertTitle>
            <AlertDescription className="flex flex-col gap-3">
              <p>{error}</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="self-start"
                disabled={pending}
                onClick={() => void loadLatest()}
              >
                重新加载
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}
        <div className="grid gap-3 md:grid-cols-2">
          <InfoRow label="模块启用时间" value={formatDate(settings.enabled_at)} />
          <InfoRow
            label="新订单合同策略"
            value={
              settings.require_active_contract_for_new_order
                ? "必须存在生效合同"
                : "不强制要求生效合同"
            }
          />
        </div>
        <FieldGroup>
          {settings.module_enabled && canManage ? (
            <Field data-invalid={reasonError}>
              <FieldLabel htmlFor="tenant-supplier-disable-reason">
                停用原因
              </FieldLabel>
              <Textarea
                id="tenant-supplier-disable-reason"
                value={disableReason}
                rows={3}
                maxLength={500}
                aria-invalid={reasonError}
                placeholder="停用前必须填写，便于运营复核"
                onChange={(event) => {
                  setDisableReason(event.target.value);
                  if (event.target.value.trim()) setReasonError(false);
                }}
              />
              {reasonError ? <FieldError>请填写停用原因。</FieldError> : null}
            </Field>
          ) : null}
        </FieldGroup>
        {!canManage ? (
          <p className="text-sm text-muted-foreground">
            当前账号没有 platform.supplier.manage 权限，仅可查看配置。
          </p>
        ) : null}
        {conflict ? (
          <Alert variant="destructive">
            <AlertTitle>数据版本已变化</AlertTitle>
            <AlertDescription className="flex flex-col gap-3">
              <p>其他管理员已修改供应商模块配置，请刷新后重试。</p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => void loadLatest()}>
                  刷新最新数据
                </Button>
                <Button type="button" size="sm" disabled={pending} onClick={() => void retry()}>
                  重试本次操作
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}
