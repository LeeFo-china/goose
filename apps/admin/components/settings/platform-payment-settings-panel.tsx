"use client";

import { type FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, Loader2, Save } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { SecretBundleForm } from "@/components/settings/platform-payment-secret-form";
import {
  definitionFor,
  emptyProfile,
  formatDateTime,
  merchantModeLabel,
  paymentChannelLabel,
  profileDefinitions,
  type ProfileDefinition,
  ReadonlyField,
  SectionTitle,
  SelectField,
  statusLabel,
  statusVariant,
  TextField,
  textValue,
  validationLabel,
  validationVariant,
} from "@/components/settings/platform-payment-settings-shared";
import type {
  PlatformPaymentProfileCode,
  PlatformWechatPayProfileListResult,
  PlatformWechatPayProfileView,
} from "@/components/settings/platform-payment-settings-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requestBackendJson } from "@/lib/backend-client";

export function PlatformPaymentSettingsPanel({
  paymentProfiles,
}: {
  paymentProfiles: PlatformWechatPayProfileListResult;
}) {
  const [activeProfile, setActiveProfile] = useState<PlatformPaymentProfileCode>(
    "platform_direct_recharge",
  );
  const profiles = profileDefinitions.map((definition) =>
    paymentProfiles.profiles.find((profile) =>
      profile.profile_code === definition.profile_code
    ) || emptyProfile(definition)
  );

  return (
    <div className="flex min-h-0 flex-col gap-4 p-4">
      {paymentProfiles.error ? (
        <StatusAlert>{paymentProfiles.error}</StatusAlert>
      ) : null}
      {!paymentProfiles.can_manage ? (
        <StatusAlert tone="warning">
          当前账号只有查看权限，不能修改平台微信支付配置或上传密钥。
        </StatusAlert>
      ) : null}

      <Tabs
        value={activeProfile}
        onValueChange={(value) =>
          setActiveProfile(value as PlatformPaymentProfileCode)
        }
        className="flex min-h-0 flex-col gap-4"
      >
        <div className="-mx-4 overflow-x-auto overflow-y-hidden px-4">
          <TabsList className="h-auto min-w-max justify-start rounded-none border-0 border-b bg-transparent p-0 text-muted-foreground">
            {profiles.map((profile) => (
              <TabsTrigger
                key={profile.profile_code}
                value={profile.profile_code}
                className="gap-2 rounded-none border-x-0 border-t-0 border-b-2 border-transparent bg-transparent px-3 py-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground"
              >
                <span>{profile.label}</span>
                <Badge variant={profile.configured ? "success" : "warning"}>
                  {profile.configured ? "已建档" : "未建档"}
                </Badge>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {profiles.map((profile) => (
          <TabsContent
            key={profile.profile_code}
            value={profile.profile_code}
            className="m-0 data-[state=inactive]:hidden"
          >
            <PaymentProfileSection
              profile={profile}
              readonly={!paymentProfiles.can_manage}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function PaymentProfileSection({
  profile,
  readonly,
}: {
  profile: PlatformWechatPayProfileView;
  readonly: boolean;
}) {
  const definition = definitionFor(profile.profile_code);

  return (
    <div className="rounded-md border bg-background">
      <div className="flex flex-col gap-3 border-b px-4 py-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium">
            <CreditCard className="size-4 text-muted-foreground" />
            {profile.label}
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {profile.description}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={statusVariant(profile.config?.status)}>
            {statusLabel(profile.config?.status)}
          </Badge>
          <Badge variant={validationVariant(profile.config?.validation_status)}>
            {validationLabel(profile.config?.validation_status)}
          </Badge>
          <Badge
            variant={profile.config?.has_encrypted_config_ref ? "success" : "warning"}
          >
            {profile.config?.has_encrypted_config_ref ? "密钥已绑定" : "未上传密钥"}
          </Badge>
        </div>
      </div>

      <div className="grid gap-5 p-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
        <ProfileConfigForm
          profile={profile}
          definition={definition}
          readonly={readonly}
        />
        <SecretBundleForm
          profile={profile}
          definition={definition}
          readonly={readonly}
        />
      </div>
    </div>
  );
}

function ProfileConfigForm({
  profile,
  definition,
  readonly,
}: {
  profile: PlatformWechatPayProfileView;
  definition: ProfileDefinition;
  readonly: boolean;
}) {
  const router = useRouter();
  const config = profile.config;
  const [status, setStatus] = useState(config?.status || "pending");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readonly) return;

    setError("");
    setSaved(false);
    const formData = new FormData(event.currentTarget);
    const serialNo = textValue(formData, "serial_no");
    const payload: Record<string, unknown> = {
      merchant_mode: definition.merchant_mode,
      merchant_name: textValue(formData, "merchant_name"),
      merchant_id: textValue(formData, "merchant_id"),
      app_id: textValue(formData, "app_id"),
      notify_url: textValue(formData, "notify_url"),
      enabled_channels: definition.enabled_channels,
      status,
    };
    if (definition.profile_code === "tenant_service_provider") {
      payload.sub_merchant_id = textValue(formData, "sub_merchant_id");
      payload.sub_app_id = textValue(formData, "sub_app_id");
    }
    if (serialNo) {
      payload.serial_no = serialNo;
    }

    startTransition(async () => {
      try {
        await requestBackendJson<PlatformWechatPayProfileView>(
          `/platform/payment/wechat-pay/profiles/${definition.profile_code}/config`,
          {
            method: "PUT",
            body: JSON.stringify(payload),
            fallbackMessage: "平台微信支付配置保存失败",
          },
        );
        setSaved(true);
        router.refresh();
      } catch (submitError) {
        setError(submitError instanceof Error
          ? submitError.message
          : "平台微信支付配置保存失败");
      }
    });
  }

  return (
    <form className="flex min-w-0 flex-col gap-4" onSubmit={submit}>
      <SectionTitle
        icon={<CreditCard className="size-4" />}
        title="商户资料"
        description="保存后会重置校验状态；证书序列号留空时保留当前脱敏序列号。"
      />
      {error ? <StatusAlert>{error}</StatusAlert> : null}
      {saved ? <StatusAlert tone="success">商户配置已保存。</StatusAlert> : null}

      <FieldGroup className="grid gap-4 md:grid-cols-2">
        <ReadonlyField label="商户模式" value={merchantModeLabel(definition.merchant_mode)} />
        <SelectField
          label="配置状态"
          value={status}
          onValueChange={setStatus}
          disabled={pending || readonly}
        />
        <TextField
          label="商户名称"
          name="merchant_name"
          defaultValue={config?.merchant_name}
          disabled={pending || readonly}
        />
        <TextField
          label={definition.profile_code === "tenant_service_provider" ? "服务商商户号" : "商户号"}
          name="merchant_id"
          defaultValue={config?.merchant_id}
          disabled={pending || readonly}
          required
        />
        <TextField
          label={definition.profile_code === "tenant_service_provider" ? "服务商应用编号" : "小程序应用编号"}
          name="app_id"
          defaultValue={config?.app_id}
          disabled={pending || readonly}
          required
        />
        <TextField
          label="证书序列号"
          name="serial_no"
          placeholder={config?.serial_no_masked ? `当前 ${config.serial_no_masked}` : "填写商户接口证书序列号"}
          disabled={pending || readonly}
        />
        {definition.profile_code === "tenant_service_provider" ? (
          <>
            <TextField
              label="默认子商户号"
              name="sub_merchant_id"
              defaultValue={config?.sub_merchant_id}
              disabled={pending || readonly}
              description="平台服务商配置一般不预填，租户开通后记录在租户支付配置。"
            />
            <TextField
              label="默认子商户应用编号"
              name="sub_app_id"
              defaultValue={config?.sub_app_id}
              disabled={pending || readonly}
              description="使用服务商小程序发起支付时可为空。"
            />
          </>
        ) : null}
        <TextField
          label="回调地址"
          name="notify_url"
          type="url"
          defaultValue={config?.notify_url}
          disabled={pending || readonly}
          required
          className="md:col-span-2"
        />
        <ReadonlyField
          label="密钥引用"
          value={config?.encrypted_config_ref || `setting://${definition.secret_setting_key}`}
          className="md:col-span-2"
        />
      </FieldGroup>

      <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs text-muted-foreground">
          启用渠道：{definition.enabled_channels.map(paymentChannelLabel).join(" / ")}
          {config?.updated_at ? `；更新时间：${formatDateTime(config.updated_at)}` : ""}
        </div>
        <Button type="submit" disabled={pending || readonly}>
          {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Save data-icon="inline-start" />}
          保存商户资料
        </Button>
      </div>
    </form>
  );
}
