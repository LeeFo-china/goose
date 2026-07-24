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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { requestBackendJson } from "@/lib/backend-client";

import {
  formatDate,
  newIdempotencyKey,
  type TenantSupplierSettings,
} from "../suppliers/supplier-types";

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
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState(initialError ?? null);

  async function loadLatest() {
    try {
      const latest = await requestBackendJson<TenantSupplierSettings | null>(
        `/platform/tenant-supplier-settings/${tenantId}`,
        { fallbackMessage: "供应商模块配置刷新失败" },
      );
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
    next: {
      module_enabled: boolean;
      require_active_contract_for_new_order: boolean;
    },
    expectedVersion = settings.version,
  ) {
    if (!next.module_enabled && settings.module_enabled && !disableReason.trim()) {
      setReasonError(true);
      return;
    }
    setPending(true);
    setConflict(false);
    try {
      const updated = await requestBackendJson<TenantSupplierSettings>(
        `/platform/tenant-supplier-settings/${tenantId}`,
        {
          method: "PATCH",
          headers: {
            "Idempotency-Key": newIdempotencyKey("tenant-supplier-settings"),
          },
          body: JSON.stringify({
            module_enabled: next.module_enabled,
            require_active_contract_for_new_order:
              next.require_active_contract_for_new_order,
            expected_version: expectedVersion,
            ...(!next.module_enabled && settings.module_enabled
              ? { reason: disableReason.trim() }
              : {}),
          }),
          fallbackMessage: "供应商模块配置保存失败",
        },
      );
      setSettings(updated);
      setDisableReason("");
      setReasonError(false);
      setError(null);
      toast.success(next.module_enabled ? "供应商模块已启用" : "供应商模块已停用");
    } catch (requestError) {
      if ((requestError as { status?: number }).status === 409) {
        setConflict(true);
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

  async function retry(
    next: {
      module_enabled: boolean;
      require_active_contract_for_new_order: boolean;
    },
  ) {
    const latest = await loadLatest();
    if (latest) await save(next, latest.version);
  }

  const nextModuleState = {
    module_enabled: !settings.module_enabled,
    require_active_contract_for_new_order:
      settings.require_active_contract_for_new_order,
  };

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
              控制该租户是否可建立供应商合作关系，并设置新订单合同门槛。
            </CardDescription>
          </div>
          {canManage ? (
            <Button
              type="button"
              variant={settings.module_enabled ? "destructive" : "default"}
              disabled={pending || Boolean(error)}
              onClick={() => void save(nextModuleState)}
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
            <AlertDescription>{error}</AlertDescription>
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
          <Field className="flex-row items-center gap-4">
            <div className="flex-1">
              <FieldLabel htmlFor="tenant-supplier-contract-policy">
                创建新订单前要求生效合同
              </FieldLabel>
              <p className="text-xs text-muted-foreground">
                开启后，无生效合同的合作供应商不能创建新订单。
              </p>
            </div>
            <Switch
              id="tenant-supplier-contract-policy"
              checked={settings.require_active_contract_for_new_order}
              disabled={
                !canManage ||
                pending ||
                Boolean(error) ||
                !settings.module_enabled
              }
              onCheckedChange={(checked) => {
                void save({
                  module_enabled: settings.module_enabled,
                  require_active_contract_for_new_order: checked,
                });
              }}
            />
          </Field>
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
                <Button type="button" size="sm" disabled={pending} onClick={() => void retry(nextModuleState)}>
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
