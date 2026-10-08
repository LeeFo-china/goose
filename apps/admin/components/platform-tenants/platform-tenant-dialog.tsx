"use client";

import { type FormEvent, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { PLATFORM_SERVICE_TRIAL_FULL_SCOPE, type PlatformServiceTrialCapability } from "@gooes/domain";
import { createTrialIdempotencyIntent } from "@/components/platform-service-trials/platform-service-trial-idempotency";
import { useRouter } from "next/navigation";
import { Building2, Loader2, RefreshCcw } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PlatformTenantAddressPicker } from "@/components/platform-tenants/platform-tenant-address-picker";
import type { PlatformTenantRecord } from "@/components/platform-tenants/platform-tenant-types";
import { requestPlatformTenantJson } from "@/components/platform-tenants/platform-tenant-requests";
import { refreshAfterDialogClose } from "@/lib/deferred-refresh";
import { PlatformTenantTrialFields } from "./platform-tenant-trial-fields";

export type TenantDialogMode = "create" | "edit";

function generateTenantSlug() {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let suffix = "";

  for (let index = 0; index < 8; index += 1) {
    suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  }

  return `tenant-${suffix}`;
}

function optionalString(formData: FormData, key: string) {
  const value = String(formData.get(key) || "").trim();
  return value || undefined;
}

function optionalNumber(formData: FormData, key: string) {
  const value = String(formData.get(key) || "").trim();
  if (!value) return undefined;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : undefined;
}

function optionalNullableIsoDate(formData: FormData, key: string) {
  const value = String(formData.get(key) || "").trim();
  if (!value) return null;

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

export function buildAddressPayload(formData: FormData) {
  const address = optionalString(formData, "address");
  const source = optionalString(formData, "address_source");
  if (!address) {
    return {
      address: null,
      address_title: null,
      address_poi_id: null,
      address_province: null,
      address_city: null,
      address_district: null,
      address_adcode: null,
      address_latitude: null,
      address_longitude: null,
      address_source: null,
      address_confidence: null,
      address_confirmed_at: null,
    };
  }

  if (source === "manual") {
    return {
      address,
      address_title: null,
      address_poi_id: null,
      address_province: null,
      address_city: null,
      address_district: null,
      address_adcode: null,
      address_latitude: null,
      address_longitude: null,
      address_source: "manual",
      address_confidence: null,
      address_confirmed_at: null,
    };
  }

  return {
    address,
    address_title: optionalString(formData, "address_title"),
    address_poi_id: optionalString(formData, "address_poi_id"),
    address_province: optionalString(formData, "address_province"),
    address_city: optionalString(formData, "address_city"),
    address_district: optionalString(formData, "address_district"),
    address_adcode: optionalString(formData, "address_adcode"),
    address_latitude: optionalNumber(formData, "address_latitude"),
    address_longitude: optionalNumber(formData, "address_longitude"),
    address_source: source,
    address_confidence: optionalNumber(formData, "address_confidence"),
    address_confirmed_at: source === "manual" ? null : optionalNullableIsoDate(formData, "address_confirmed_at"),
  };
}

export function TenantDialog({
  mode,
  tenant,
  open,
  onOpenChange,
  trialCreation,
}: {
  mode: TenantDialogMode;
  tenant?: PlatformTenantRecord;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trialCreation?: { enabled: boolean; disabled_reason: string | null };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const submitLock = useRef(false);
  const [error, setError] = useState("");
  const [trialEnabled, setTrialEnabled] = useState(false);
  const trialIntent = useRef(createTrialIdempotencyIntent()).current;
  const [trialScope, setTrialScope] = useState<PlatformServiceTrialCapability[]>([...PLATFORM_SERVICE_TRIAL_FULL_SCOPE.capabilities]);
  const defaults = useMemo(() => ({
    name: tenant?.name || "",
    slug: tenant?.slug || "",
    contact_name: tenant?.contact_name || "",
    contact_phone: tenant?.contact_phone || "",
  }), [tenant]);
  const [slugValue, setSlugValue] = useState(defaults.slug);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);

  useEffect(() => {
    if (!open) return;

    setError("");
    setTrialEnabled(Boolean(trialCreation?.enabled));
    trialIntent.beginNew();
    setTrialScope([...PLATFORM_SERVICE_TRIAL_FULL_SCOPE.capabilities]);
    setSlugManuallyEdited(false);
    setSlugValue(mode === "create" ? generateTenantSlug() : defaults.slug);
  }, [defaults.slug, mode, open, trialCreation?.enabled, trialIntent]);

  function close() {
    if (submitLock.current) return;
    setError("");
    onOpenChange(false);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitLock.current) return;
    if (trialEnabled && trialScope.length === 0) {
      setError("请至少选择一项试用范围");
      return;
    }
    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") || "").trim();
    const slug = String(formData.get("slug") || "").trim();
    const contactName = String(formData.get("contact_name") || "").trim();
    const contactPhone = String(formData.get("contact_phone") || "").trim();
    const adminName = String(formData.get("admin_name") || "").trim();
    const adminPhone = String(formData.get("admin_phone") || "").trim();
    const addressPayload = buildAddressPayload(formData);

    setError("");
    submitLock.current = true;
    startTransition(async () => {
      try {
        const body = mode === "create"
          ? {
            name,
            slug,
            trial: trialEnabled ? {
              enabled: true,
              trial_days: Number(formData.get("trial_days")),
              reason: String(formData.get("trial_reason") || "").trim(),
              scope: { version: 1, capabilities: trialScope },
            } : { enabled: false },
            ...addressPayload,
            contact_name: contactName || undefined,
            contact_phone: contactPhone || undefined,
            admin: {
              name: adminName,
              phone: adminPhone,
            },
          }
          : {
            name,
            ...addressPayload,
            contact_name: contactName || undefined,
            contact_phone: contactPhone || undefined,
          };

        const requestBody = "trial" in body && body.trial.enabled
          ? { ...body, trial: { ...body.trial, idempotency_key: trialIntent.forPayload(body) } }
          : body;
        await requestPlatformTenantJson(
          mode === "create" ? "/api/backend/platform/tenants" : `/api/backend/platform/tenants/${tenant?.id}`,
          {
            method: mode === "create" ? "POST" : "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(requestBody),
          },
        );
        onOpenChange(false);
        refreshAfterDialogClose(router);
      } catch (err) {
        setError(err instanceof Error ? err.message : "保存租户失败");
      } finally {
        submitLock.current = false;
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? onOpenChange(true) : close())}>
      <DialogContent className="max-h-[88vh] max-w-[620px] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-md bg-accent text-accent-foreground">
              <Building2 />
            </div>
            <div>
              <DialogTitle>{mode === "create" ? "新建租户" : "编辑租户"}</DialogTitle>
              <DialogDescription>
                {mode === "create" ? "创建装修公司租户，并初始化默认组织、岗位、角色和管理员。" : "仅更新租户基础信息，不修改 slug 和管理员。"}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form className="flex flex-col gap-4" onSubmit={submit}>
          <FieldGroup>
            {mode === "create" ? <PlatformTenantTrialFields
              scope={trialScope} setScope={setTrialScope}
              enabled={trialEnabled} onEnabledChange={setTrialEnabled} disabled={pending}
              disabledReason={trialCreation?.enabled ? null
                : trialCreation?.disabled_reason || "当前无法开通试用"}
            /> : null}
            <div className="flex flex-col gap-3">
              <div className="text-sm font-medium">公司信息</div>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor={`${mode}-tenant-name`}>公司名称</FieldLabel>
                  <Input
                    id={`${mode}-tenant-name`}
                    name="name"
                    defaultValue={defaults.name}
                    maxLength={100}
                    required
                    disabled={pending}
                    onChange={() => {
                      if (mode === "create" && !slugManuallyEdited && !slugValue) {
                        setSlugValue(generateTenantSlug());
                      }
                    }}
                  />
                </Field>
                <Field data-disabled={mode === "edit" ? true : undefined}>
                  <FieldLabel htmlFor={`${mode}-tenant-slug`}>slug</FieldLabel>
                  <div className="flex gap-2">
                    <Input
                      id={`${mode}-tenant-slug`}
                      name="slug"
                      value={slugValue}
                      onChange={(event) => {
                        setSlugManuallyEdited(true);
                        setSlugValue(event.target.value);
                      }}
                      placeholder="tenant-k8f3x2q9"
                      pattern="[a-z0-9][a-z0-9_-]*[a-z0-9]"
                      minLength={2}
                      maxLength={64}
                      required={mode === "create"}
                      disabled={pending || mode === "edit"}
                    />
                    {mode === "create" ? (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={pending}
                        onClick={() => {
                          setSlugManuallyEdited(false);
                          setSlugValue(generateTenantSlug());
                        }}
                      >
                        <RefreshCcw data-icon="inline-start" />
                        重新生成
                      </Button>
                    ) : null}
                  </div>
                  <FieldDescription>创建后不建议修改，用于 H5、小程序和分享链路识别租户。</FieldDescription>
                </Field>
                <div className="grid gap-3 md:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor={`${mode}-tenant-contact-name`}>联系人</FieldLabel>
                    <Input
                      id={`${mode}-tenant-contact-name`}
                      name="contact_name"
                      defaultValue={defaults.contact_name}
                      maxLength={80}
                      disabled={pending}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`${mode}-tenant-contact-phone`}>联系电话</FieldLabel>
                    <Input
                      id={`${mode}-tenant-contact-phone`}
                      name="contact_phone"
                      defaultValue={defaults.contact_phone}
                      maxLength={30}
                      disabled={pending}
                    />
                  </Field>
                </div>
                <PlatformTenantAddressPicker mode={mode} tenant={tenant} disabled={pending} active={open} />
              </FieldGroup>
            </div>

            {mode === "create" ? (
              <div className="flex flex-col gap-3">
                <div className="text-sm font-medium">管理员账号</div>
                <FieldGroup>
                  <div className="grid gap-3 md:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor="create-tenant-admin-name">管理员姓名</FieldLabel>
                      <Input
                        id="create-tenant-admin-name"
                        name="admin_name"
                        maxLength={50}
                        required
                        disabled={pending}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="create-tenant-admin-phone">管理员手机号</FieldLabel>
                      <Input
                        id="create-tenant-admin-phone"
                        name="admin_phone"
                        inputMode="tel"
                        maxLength={11}
                        pattern="1[3-9][0-9]{9}"
                        placeholder="请输入 11 位手机号"
                        required
                        disabled={pending}
                      />
                    </Field>
                  </div>
                  <FieldDescription>
                    管理员将绑定系统管理员角色。当前后台登录要求管理员手机号不能已绑定其他员工。
                  </FieldDescription>
                </FieldGroup>
              </div>
            ) : null}
          </FieldGroup>

          {error ? <StatusAlert>{error}</StatusAlert> : null}

          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={close}>
              取消
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              {mode === "create" ? "创建租户" : "保存修改"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
