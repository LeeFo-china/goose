"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CreditCard, Loader2, Save } from "lucide-react";
import { adminTabsListClassName, adminTabsTriggerWithBadgeClassName } from "@/components/admin/admin-tabs";
import { StatusAlert } from "@/components/admin/status-alert";
import { PaymentProfileReadinessSection } from "@/components/settings/platform-payment-readiness-section";
import {
  createLatestRequestCoordinator,
  type LatestRequestCoordinator,
} from "@/components/settings/platform-payment-readiness-request-coordinator";
import { SecretBundleForm } from "@/components/settings/platform-payment-secret-form";
import { PlatformVirtualPaymentSettings } from "@/components/settings/platform-virtual-payment-settings";
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
  PlatformWechatPayReadinessResult,
} from "@/components/settings/platform-payment-settings-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requestBackendJson } from "@/lib/backend-client";
import type { BrandingVirtualPaymentEnvironment } from "@gooes/domain";

type PaymentSection = "ordinary" | "virtual";

export function PlatformPaymentSettingsPanel({
  paymentProfiles,
}: {
  paymentProfiles: PlatformWechatPayProfileListResult;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const section: PaymentSection = searchParams.get("section") === "virtual"
    ? "virtual"
    : "ordinary";
  const environment: BrandingVirtualPaymentEnvironment =
    searchParams.get("environment") === "production"
      ? "production"
      : "sandbox";

  function updateSection(section: PaymentSection) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("group", "payment");
    params.set("section", section);
    if (section === "virtual") params.set("environment", environment);
    else params.delete("environment");
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  function updateEnvironment(environment: BrandingVirtualPaymentEnvironment) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("group", "payment");
    params.set("section", "virtual");
    params.set("environment", environment);
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="flex min-h-0 flex-col gap-4 p-4">
      <Tabs
        value={section}
        onValueChange={(value) => updateSection(value as PaymentSection)}
        className="flex min-h-0 flex-col gap-4"
      >
        <div className="-mx-4 overflow-x-auto overflow-y-hidden px-4">
          <TabsList className={adminTabsListClassName}>
            <TabsTrigger value="ordinary">普通微信支付</TabsTrigger>
            <TabsTrigger value="virtual">数字权益虚拟支付</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="ordinary" className="m-0 data-[state=inactive]:hidden">
          <OrdinaryPaymentSettingsPanel paymentProfiles={paymentProfiles} />
        </TabsContent>
        <TabsContent value="virtual" className="m-0 data-[state=inactive]:hidden">
          <PlatformVirtualPaymentSettings
            environment={environment}
            onEnvironmentChange={updateEnvironment}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function OrdinaryPaymentSettingsPanel({
  paymentProfiles,
}: {
  paymentProfiles: PlatformWechatPayProfileListResult;
}) {
  const [activeProfile, setActiveProfile] = useState<PlatformPaymentProfileCode>(
    "platform_direct_recharge",
  );
  const [readiness, setReadiness] =
    useState<PlatformWechatPayReadinessResult | null>(null);
  const [readinessError, setReadinessError] = useState("");
  const [readinessPending, setReadinessPending] = useState(true);
  const requestCoordinatorRef = useRef<LatestRequestCoordinator | null>(null);
  requestCoordinatorRef.current ??= createLatestRequestCoordinator();
  const profiles = profileDefinitions.map((definition) =>
    paymentProfiles.profiles.find((profile) =>
      profile.profile_code === definition.profile_code
    ) || emptyProfile(definition)
  );

  const refreshReadiness = useCallback(async () => {
    const coordinator = requestCoordinatorRef.current;
    if (!coordinator) return;
    const requestToken = coordinator.begin();
    setReadiness(null);
    setReadinessError("");
    setReadinessPending(true);
    try {
      const result = await requestBackendJson<PlatformWechatPayReadinessResult>(
        "/platform/payment/wechat-pay/readiness",
        { fallbackMessage: "支付就绪状态加载失败" },
      );
      if (!coordinator.isCurrent(requestToken)) return;
      setReadiness(result);
    } catch {
      if (!coordinator.isCurrent(requestToken)) return;
      setReadinessError("支付就绪状态加载失败，请稍后重试。");
    } finally {
      if (coordinator.isCurrent(requestToken)) {
        setReadinessPending(false);
      }
    }
  }, []);

  const handleMutationComplete = useCallback(async () => {
    await refreshReadiness();
  }, [refreshReadiness]);

  useEffect(() => {
    const coordinator = requestCoordinatorRef.current;
    if (!coordinator) return;
    void refreshReadiness();
    return () => {
      coordinator.invalidate();
    };
  }, [refreshReadiness]);

  return (
    <div className="flex min-h-0 flex-col gap-4">
      {paymentProfiles.error ? (
        <StatusAlert>{paymentProfiles.error}</StatusAlert>
      ) : null}
      {readinessError ? <StatusAlert>{readinessError}</StatusAlert> : null}
      {!paymentProfiles.can_manage ? (
        <StatusAlert tone="warning">
          当前账号只有查看权限，不能修改配置、上传密钥或执行验证。
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
          <TabsList className={adminTabsListClassName}>
            {profiles.map((profile) => (
              <TabsTrigger
                key={profile.profile_code}
                value={profile.profile_code}
                className={adminTabsTriggerWithBadgeClassName}
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
              readiness={readiness?.profiles.find((item) =>
                item.profile_code === profile.profile_code
              ) || null}
              readinessPending={readinessPending}
              refreshReadiness={refreshReadiness}
              onMutationComplete={handleMutationComplete}
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
  readiness,
  readinessPending,
  refreshReadiness,
  onMutationComplete,
}: {
  profile: PlatformWechatPayProfileView;
  readonly: boolean;
  readiness: PlatformWechatPayReadinessResult["profiles"][number] | null;
  readinessPending: boolean;
  refreshReadiness: () => Promise<void>;
  onMutationComplete: () => Promise<void>;
}) {
  const definition = definitionFor(profile.profile_code);
  const hasStoredSecret = Boolean(
    profile.config?.has_encrypted_config_ref &&
      profile.config.has_secret_bundle_revision,
  );

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
            variant={hasStoredSecret ? "success" : "warning"}
          >
            {hasStoredSecret ? "密钥已安全保存" : "尚未上传"}
          </Badge>
        </div>
      </div>

      <PaymentProfileReadinessSection
        profile={profile}
        readiness={readiness}
        readonly={readonly}
        loading={readinessPending}
        refreshReadiness={refreshReadiness}
      />

      <div className="grid gap-5 p-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
        <ProfileConfigForm
          profile={profile}
          definition={definition}
          readonly={readonly}
          onMutationComplete={onMutationComplete}
        />
        <SecretBundleForm
          profile={profile}
          definition={definition}
          readonly={readonly}
          onMutationComplete={onMutationComplete}
        />
      </div>
    </div>
  );
}

function ProfileConfigForm({
  profile,
  definition,
  readonly,
  onMutationComplete,
}: {
  profile: PlatformWechatPayProfileView;
  definition: ProfileDefinition;
  readonly: boolean;
  onMutationComplete: () => Promise<void>;
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
        await onMutationComplete();
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
