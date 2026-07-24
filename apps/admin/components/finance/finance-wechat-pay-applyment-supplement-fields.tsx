"use client";

import { FieldGroup } from "@/components/ui/field";

import {
  SelectField,
  TextareaField,
  TextField,
} from "./finance-wechat-pay-applyment-form-fields";
import type { WechatPayApplymentRecord } from "./finance-wechat-pay-applyment-shared";
import { FinanceWechatPaySettlementRuleField } from "./finance-wechat-pay-settlement-rule-field";

export const SUPPLEMENT_FIELD_NAMES = [
  "merchant_short_name",
  "super_admin_phone",
  "super_admin_email",
  "service_phone",
  "settlement_account_type",
  "settlement_account_name",
  "settlement_bank_full_name",
  "settlement_bank_branch_id",
  "settlement_id",
  "qualification_type",
  "business_scene_description",
  "contact_address",
  "remark",
] as const;

const SETTLEMENT_ACCOUNT_TYPE_OPTIONS = [
  { value: "BANK_ACCOUNT_TYPE_CORPORATE", label: "对公银行账户" },
  { value: "BANK_ACCOUNT_TYPE_PERSONAL", label: "经营者个人银行卡" },
];

type CommonFieldsProps = {
  applyment: WechatPayApplymentRecord | null;
  disabled: boolean;
};

type DataChangeProps = {
  onDataChange: (overrides: Record<string, string>) => void;
};

type SettlementFieldsProps = CommonFieldsProps & DataChangeProps & {
  subjectType: string;
};

type SupplementFieldsProps = SettlementFieldsProps & {
  contactType: string;
  navigationDisabled: boolean;
  onReturnToMaterials: () => void;
};

export function FinanceWechatPayApplymentContactFields({
  applyment,
  disabled,
}: CommonFieldsProps) {
  const sensitivePlaceholder = applyment?.super_admin_phone_masked
    ? "已安全保存，留空保留原值"
    : "请输入完整信息";

  return (
    <FieldGroup className="grid gap-4 md:grid-cols-2">
      <TextField
        label="商户简称"
        name="merchant_short_name"
        defaultValue={applyment?.merchant_short_name || ""}
        requirement="required"
        required
        maxLength={64}
        disabled={disabled}
      />
      <TextField
        label="超级管理员手机号"
        name="super_admin_phone"
        placeholder={applyment?.super_admin_phone_masked ||
          sensitivePlaceholder}
        description="用于微信支付开户联系和重要通知。"
        requirement="required"
        required={!applyment?.super_admin_phone_masked}
        pattern="1[3-9]\d{9}"
        maxLength={11}
        inputMode="tel"
        autoComplete="tel"
        disabled={disabled}
        stored={Boolean(applyment?.super_admin_phone_masked)}
      />
      <TextField
        label="超级管理员邮箱"
        name="super_admin_email"
        type="email"
        defaultValue={applyment?.super_admin_email || ""}
        requirement="required"
        required
        maxLength={120}
        autoComplete="email"
        disabled={disabled}
      />
      <TextField
        label="客服电话"
        name="service_phone"
        defaultValue={applyment?.service_phone || ""}
        requirement="required"
        required
        maxLength={20}
        inputMode="tel"
        disabled={disabled}
      />
    </FieldGroup>
  );
}

export function FinanceWechatPayApplymentSettlementFields({
  applyment,
  subjectType,
  disabled,
  onDataChange,
}: SettlementFieldsProps) {
  const accountType = subjectType === "SUBJECT_TYPE_ENTERPRISE"
    ? "BANK_ACCOUNT_TYPE_CORPORATE"
    : applyment?.settlement_account_type || "BANK_ACCOUNT_TYPE_PERSONAL";

  return (
    <FieldGroup className="grid gap-4 md:grid-cols-2">
      <SelectField
        label="结算账户类型"
        name="settlement_account_type"
        defaultValue={accountType}
        options={SETTLEMENT_ACCOUNT_TYPE_OPTIONS}
        requirement="required"
        disabled={disabled || subjectType === "SUBJECT_TYPE_ENTERPRISE"}
        onValueChange={(value) => {
          onDataChange({ settlement_account_type: value });
        }}
        description={subjectType === "SUBJECT_TYPE_ENTERPRISE"
          ? "企业主体固定使用对公银行账户。"
          : undefined}
      />
      <TextField
        label="结算账户开户名"
        name="settlement_account_name"
        defaultValue={applyment?.settlement_account_name || ""}
        requirement="required"
        required
        maxLength={100}
        disabled={disabled}
      />
      <TextField
        label="开户银行全称（含支行）"
        name="settlement_bank_full_name"
        defaultValue={applyment?.settlement_bank_full_name || ""}
        maxLength={128}
        disabled={disabled}
      />
      <TextField
        label="开户银行联行号"
        name="settlement_bank_branch_id"
        defaultValue={applyment?.settlement_bank_branch_id || ""}
        maxLength={128}
        disabled={disabled}
      />
      <FinanceWechatPaySettlementRuleField
        subjectType={subjectType}
        settlementId={applyment?.settlement_id}
        qualificationType={applyment?.qualification_type}
        disabled={disabled}
        onValueChange={(overrides) => onDataChange(overrides)}
      />
    </FieldGroup>
  );
}

export function FinanceWechatPayApplymentBusinessFields({
  applyment,
  disabled,
}: CommonFieldsProps & DataChangeProps) {
  return (
    <FieldGroup className="grid gap-4 md:grid-cols-2">
      <TextareaField
        label="经营场景说明"
        name="business_scene_description"
        defaultValue={applyment?.business_scene_description || ""}
        requirement="required"
        required
        disabled={disabled}
      />
      <TextareaField
        label="经营联系地址"
        name="contact_address"
        defaultValue={applyment?.contact_address || ""}
        requirement="required"
        required
        disabled={disabled}
      />
      <TextareaField
        label="备注"
        name="remark"
        defaultValue={applyment?.remark || ""}
        requirement="optional"
        disabled={disabled}
      />
    </FieldGroup>
  );
}

export function FinanceWechatPayApplymentSupplementFields(
  props: SupplementFieldsProps,
) {
  return (
    <div className="flex flex-col gap-4">
      <FinanceWechatPayApplymentContactFields
        applyment={props.applyment}
        disabled={props.disabled}
      />
      <FinanceWechatPayApplymentSettlementFields
        applyment={props.applyment}
        subjectType={props.subjectType}
        disabled={props.disabled}
        onDataChange={props.onDataChange}
      />
      <FinanceWechatPayApplymentBusinessFields
        applyment={props.applyment}
        disabled={props.disabled}
        onDataChange={props.onDataChange}
      />
    </div>
  );
}
