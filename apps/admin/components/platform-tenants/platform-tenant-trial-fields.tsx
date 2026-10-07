"use client";

import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

export function PlatformTenantTrialFields({ enabled, onEnabledChange, disabled, disabledReason }: {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  disabled: boolean;
  disabledReason?: string | null;
}) {
  return (
    <FieldGroup>
      <Field>
        <div className="flex items-center justify-between gap-3">
          <FieldLabel htmlFor="create-tenant-trial">立即开通标准试用</FieldLabel>
          <Switch id="create-tenant-trial" checked={enabled} onCheckedChange={onEnabledChange}
            disabled={disabled || Boolean(disabledReason)} />
        </div>
        <FieldDescription>
          {disabledReason || (enabled
            ? "创建成功后立即开始，无需先完成企业核验；试用结束后进入 7 天只读宽限期。"
            : "暂不开通试用。开通试用或正式服务后，租户才能使用业务功能。")}
        </FieldDescription>
      </Field>
      {enabled ? <>
        <Field>
          <FieldLabel htmlFor="create-tenant-trial-days">试用天数</FieldLabel>
          <Input id="create-tenant-trial-days" name="trial_days" type="number"
            defaultValue={30} min={1} max={365} step={1} required disabled={disabled} />
          <FieldDescription>可设 1–365 天，超出平台策略上限需要特批权限。宽限期固定为 7 天。</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="create-tenant-trial-reason">开通原因</FieldLabel>
          <Textarea id="create-tenant-trial-reason" name="trial_reason" required
            maxLength={500} disabled={disabled} placeholder="填写本次试用的业务原因" />
        </Field>
      </> : null}
    </FieldGroup>
  );
}
