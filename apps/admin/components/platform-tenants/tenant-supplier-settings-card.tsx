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
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
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
import {
  canToggleSupplierRolloutFlag,
  hasEnabledSupplierRolloutFlags,
  type SupplierRolloutFlag,
} from "./tenant-supplier-settings-rules";

type PendingModuleIntent = PlatformModuleIntent & {
  idempotencyKey: string;
  successMessage: string;
};

const rolloutFields: ReadonlyArray<{
  flag: SupplierRolloutFlag;
  label: string;
  description: string;
  intentKey:
    | "ownershipReadsEnabled"
    | "privateSupplierWritesEnabled"
    | "privateCatalogWritesEnabled"
    | "procurementSnapshotV1Enabled";
}> = [
  {
    flag: "ownership_reads_enabled",
    label: "所有权读取",
    description: "先启用归属读取，为平台共享和租户私有数据提供识别基础。",
    intentKey: "ownershipReadsEnabled",
  },
  {
    flag: "private_supplier_writes_enabled",
    label: "私有供应商写入",
    description: "需先启用所有权读取，再允许租户维护私有供应商主档。",
    intentKey: "privateSupplierWritesEnabled",
  },
  {
    flag: "private_catalog_writes_enabled",
    label: "私有目录写入",
    description: "需先启用私有供应商写入，再开放私有分类、品牌和商品目录。",
    intentKey: "privateCatalogWritesEnabled",
  },
  {
    flag: "procurement_snapshot_v1_enabled",
    label: "采购单快照 V1",
    description: "需先启用私有目录写入，再固化供应商、商品、规格和单位快照。",
    intentKey: "procurementSnapshotV1Enabled",
  },
];

const defaultSettings = (tenantId: string): TenantSupplierSettings => ({
  tenant_id: tenantId,
  module_enabled: false,
  require_active_contract_for_new_order: false,
  ownership_reads_enabled: false,
  private_supplier_writes_enabled: false,
  private_catalog_writes_enabled: false,
  procurement_snapshot_v1_enabled: false,
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
      toast.success(intent.successMessage);
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
      successMessage: moduleEnabled ? "供应商模块已启用" : "供应商模块已停用",
    });
  }

  function startRolloutMutation(
    flag: SupplierRolloutFlag,
    checked: boolean,
  ) {
    const field = rolloutFields.find((candidate) => candidate.flag === flag);
    if (!field || !canToggleSupplierRolloutFlag(settings, flag)) return;
    void save({
      moduleEnabled: settings.module_enabled,
      [field.intentKey]: checked,
      idempotencyKey: newIdempotencyKey(`tenant-supplier-${flag}`),
      successMessage: `${field.label}已${checked ? "启用" : "停用"}`,
    });
  }

  async function retry() {
    if (!pendingIntent) return;
    const latest = await loadLatest();
    if (latest) await save(pendingIntent, latest);
  }

  async function refreshAfterConflict() {
    const latest = await loadLatest();
    if (!latest) return;
    setConflict(false);
    setPendingIntent(null);
  }

  const hasEnabledChildFlags = hasEnabledSupplierRolloutFlags(settings);
  const controlsLocked = pending || Boolean(error) || conflict || !canManage;

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
              disabled={controlsLocked || hasEnabledChildFlags}
              onClick={startModuleMutation}
            >
              {pending ? (
                <>
                  <Spinner data-icon="inline-start" />
                  正在保存
                </>
              )
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
        {settings.module_enabled && hasEnabledChildFlags ? (
          <Alert>
            <AlertTitle>请先逆序关闭子开关</AlertTitle>
            <AlertDescription>
              必须依次关闭采购单快照、私有目录、私有供应商和所有权读取，
              才能停用供应商模块。
            </AlertDescription>
          </Alert>
        ) : null}
        <Alert>
          <AlertTitle>分阶段能力预配置</AlertTitle>
          <AlertDescription>
            以下开关仅用于预配置；对应后续阶段交付后才会生效。
            启用开关不会让尚未交付的租户端能力提前上线。
          </AlertDescription>
        </Alert>
        <FieldGroup className="gap-3">
          {rolloutFields.map((field) => {
            const disabled = controlsLocked ||
              !canToggleSupplierRolloutFlag(settings, field.flag);
            const id = `tenant-supplier-${field.flag}`;
            return (
              <Field
                key={field.flag}
                orientation="horizontal"
                data-disabled={disabled || undefined}
                className="justify-between gap-4 px-1 py-2"
              >
                <div className="flex flex-col gap-1">
                  <FieldLabel htmlFor={id}>{field.label}</FieldLabel>
                  <FieldDescription>{field.description}</FieldDescription>
                </div>
                <Switch
                  id={id}
                  aria-label={field.label}
                  checked={settings[field.flag]}
                  disabled={disabled}
                  onCheckedChange={(checked) =>
                    startRolloutMutation(field.flag, checked)}
                />
              </Field>
            );
          })}
          {settings.module_enabled && canManage && !hasEnabledChildFlags ? (
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
                <Button type="button" size="sm" variant="outline" onClick={() => void refreshAfterConflict()}>
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
