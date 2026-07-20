"use client";

import { type FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, Upload } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import {
  FileField,
  fileValue,
  type ProfileDefinition,
  readFileAsText,
  SectionTitle,
  TextField,
  textValue,
} from "@/components/settings/platform-payment-settings-shared";
import type { PlatformWechatPayProfileView } from "@/components/settings/platform-payment-settings-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldError, FieldGroup } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import { requestBackendJson } from "@/lib/backend-client";

export function SecretBundleForm({
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
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const hasStoredSecret = Boolean(
    profile.config?.has_encrypted_config_ref &&
      profile.config.has_secret_bundle_revision,
  );

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readonly) return;

    setError("");
    setSaved(false);
    const form = event.currentTarget;
    const formData = new FormData(form);
    const privateKeyFile = fileValue(formData, "private_key_file");
    const publicKeyFile = fileValue(formData, "wechat_pay_public_key_file");
    const apiV3Key = textValue(formData, "api_v3_key");
    if (!privateKeyFile || !apiV3Key) {
      setError("请上传商户接口私钥文件，并填写接口 v3 密钥。");
      return;
    }

    startTransition(async () => {
      try {
        const [privateKeyPem, publicKeyPem] = await Promise.all([
          readFileAsText(privateKeyFile),
          publicKeyFile ? readFileAsText(publicKeyFile) : Promise.resolve(null),
        ]);
        await requestBackendJson<PlatformWechatPayProfileView>(
          `/platform/payment/wechat-pay/profiles/${definition.profile_code}/secret-bundle`,
          {
            method: "PUT",
            body: JSON.stringify({
              private_key_pem: privateKeyPem,
              api_v3_key: apiV3Key,
              wechat_pay_public_key_id: textValue(
                formData,
                "wechat_pay_public_key_id",
              ),
              wechat_pay_public_key_pem: publicKeyPem,
              base_url: textValue(formData, "base_url"),
            }),
            fallbackMessage: "微信支付密钥上传失败",
          },
        );
        form.reset();
        setSaved(true);
        router.refresh();
        await onMutationComplete();
      } catch (submitError) {
        setError(submitError instanceof Error
          ? submitError.message
          : "微信支付密钥上传失败");
      }
    });
  }

  return (
    <form className="flex min-w-0 flex-col gap-4" onSubmit={submit}>
      <SectionTitle
        icon={<KeyRound className="size-4" />}
        title="证书与密钥"
        description="文件只用于本次上传，保存后页面不回显私钥或接口 v3 密钥。"
      />
      <Badge
        variant={hasStoredSecret ? "success" : "warning"}
        className="w-fit"
      >
        {hasStoredSecret ? "密钥已安全保存" : "尚未上传"}
      </Badge>
      {error ? <FieldError>{error}</FieldError> : null}
      {saved ? <StatusAlert tone="success">证书与密钥已上传。</StatusAlert> : null}

      <FieldGroup>
        <FileField
          label="商户接口私钥文件"
          name="private_key_file"
          disabled={pending || readonly}
          required
        />
        <TextField
          label="接口 v3 密钥"
          name="api_v3_key"
          type="password"
          disabled={pending || readonly}
          required
        />
        <TextField
          label="微信支付公钥编号"
          name="wechat_pay_public_key_id"
          disabled={pending || readonly}
        />
        <FileField
          label="微信支付公钥文件"
          name="wechat_pay_public_key_file"
          disabled={pending || readonly}
        />
        <TextField
          label="微信支付接口地址"
          name="base_url"
          type="url"
          placeholder="https://api.mch.weixin.qq.com"
          disabled={pending || readonly}
        />
      </FieldGroup>

      <Separator />
      <Button type="submit" variant="outline" disabled={pending || readonly}>
        {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Upload data-icon="inline-start" />}
        上传证书与密钥
      </Button>
    </form>
  );
}
