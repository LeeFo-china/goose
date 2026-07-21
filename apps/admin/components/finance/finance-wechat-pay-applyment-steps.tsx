"use client";

import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { WechatPayApplymentRecord } from "./finance-wechat-pay-applyment-shared";
import {
  PeriodEndField,
  SelectField,
  TextareaField,
  TextField,
} from "./finance-wechat-pay-applyment-form-fields";

export const APPLYMENT_STEP_KEYS = [
  "subject",
  "contact",
  "settlement",
  "review",
] as const;

export type ApplymentStepKey = (typeof APPLYMENT_STEP_KEYS)[number];

const STEP_LABELS: Record<ApplymentStepKey, string> = {
  subject: "主体与证照",
  contact: "法人和超级管理员",
  settlement: "经营及结算",
  review: "附件与复核",
};

const SUBJECT_TYPE_OPTIONS = [
  { value: "SUBJECT_TYPE_ENTERPRISE", label: "企业" },
  { value: "SUBJECT_TYPE_INDIVIDUAL", label: "个体工商户" },
];
const CONTACT_TYPE_OPTIONS = [
  { value: "LEGAL", label: "法人本人" },
  { value: "SUPER", label: "经办人" },
];
const SETTLEMENT_ACCOUNT_TYPE_OPTIONS = [
  { value: "BANK_ACCOUNT_TYPE_CORPORATE", label: "对公银行账户" },
  { value: "BANK_ACCOUNT_TYPE_PERSONAL", label: "经营者个人银行卡" },
];

type StepsProps = {
  applyment: WechatPayApplymentRecord | null;
  activeStep: ApplymentStepKey;
  subjectType: string;
  contactType: string;
  editable: boolean;
  disabled: boolean;
  attachmentsContent: ReactNode;
  reviewContent: ReactNode;
  onStepChange: (step: ApplymentStepKey) => void;
  onSubjectTypeChange: (value: string) => void;
  onContactTypeChange: (value: string) => void;
};

export function FinanceWechatPayApplymentSteps(props: StepsProps) {
  const stepIndex = APPLYMENT_STEP_KEYS.indexOf(props.activeStep);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Tabs
        value={props.activeStep}
        onValueChange={(value) => props.onStepChange(value as ApplymentStepKey)}
      >
        <div>
          <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:h-10 sm:grid-cols-4">
            {APPLYMENT_STEP_KEYS.map((step) => (
              <TabsTrigger
                key={step}
                value={step}
                className="min-h-9 whitespace-normal px-2"
              >
                {STEP_LABELS[step]}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <StepContent value="subject">
          <SubjectFields {...props} />
        </StepContent>
        <StepContent value="contact">
          <ContactFields {...props} />
        </StepContent>
        <StepContent value="settlement">
          <SettlementFields {...props} />
        </StepContent>
        <StepContent value="review">
          <div className="flex flex-col gap-5">
            {props.attachmentsContent}
            {props.reviewContent}
          </div>
        </StepContent>
      </Tabs>

      <div className="flex items-center justify-between gap-3 border-t pt-4">
        <Button
          type="button"
          variant="outline"
          disabled={stepIndex === 0}
          onClick={() => props.onStepChange(APPLYMENT_STEP_KEYS[stepIndex - 1])}
        >
          <ChevronLeft data-icon="inline-start" />
          上一步
        </Button>
        <span className="text-xs tabular-nums text-muted-foreground">
          {stepIndex + 1} / {APPLYMENT_STEP_KEYS.length}
        </span>
        <Button
          type="button"
          variant="outline"
          disabled={stepIndex === APPLYMENT_STEP_KEYS.length - 1}
          onClick={() => props.onStepChange(APPLYMENT_STEP_KEYS[stepIndex + 1])}
        >
          下一步
          <ChevronRight data-icon="inline-end" />
        </Button>
      </div>
    </div>
  );
}

function SubjectFields({
  applyment,
  subjectType,
  disabled,
  onSubjectTypeChange,
}: StepsProps) {
  return (
    <FieldGroup className="grid gap-4 md:grid-cols-2">
      <SelectField
        label="主体类型"
        name="subject_type"
        defaultValue={subjectType}
        options={SUBJECT_TYPE_OPTIONS}
        requirement="required"
        disabled={disabled}
        onValueChange={onSubjectTypeChange}
      />
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
        label="营业执照主体名称"
        name="license_name"
        defaultValue={applyment?.license_name || ""}
        requirement="required"
        required
        maxLength={100}
        disabled={disabled}
      />
      <TextField
        label="统一社会信用代码"
        name="license_code"
        defaultValue={applyment?.license_code || ""}
        requirement="required"
        required
        maxLength={64}
        disabled={disabled}
      />
      <TextField
        label="营业执照注册地址"
        name="license_address"
        defaultValue={applyment?.license_address || ""}
        requirement="optional"
        maxLength={128}
        disabled={disabled}
      />
      <TextField
        label="营业执照有效期开始"
        name="license_period_begin"
        type="date"
        defaultValue={applyment?.license_period_begin || ""}
        disabled={disabled}
      />
      <PeriodEndField
        label="营业执照有效期结束"
        name="license_period_end"
        defaultValue={applyment?.license_period_end}
        requirement="optional"
        disabled={disabled}
      />
    </FieldGroup>
  );
}

function ContactFields({
  applyment,
  contactType,
  subjectType,
  disabled,
  onContactTypeChange,
}: StepsProps) {
  const hasSensitivePayload = Boolean(applyment?.has_sensitive_payload);
  const sensitivePlaceholder = hasSensitivePayload
    ? "已安全保存，留空保留原值"
    : "请输入完整信息";
  const identityAddressRequired = subjectType === "SUBJECT_TYPE_ENTERPRISE";

  return (
    <FieldGroup className="grid gap-4 md:grid-cols-2">
      <TextField
        label="法人姓名"
        name="legal_representative_name"
        defaultValue={applyment?.legal_representative_name || ""}
        requirement="required"
        required
        maxLength={50}
        disabled={disabled}
      />
      <TextField
        label="证件类型"
        name="identity_doc_type_display"
        defaultValue="中国大陆居民身份证"
        requirement="required"
        disabled
      />
      <TextField
        label="身份证姓名"
        name="identity_name"
        placeholder={sensitivePlaceholder}
        requirement="required"
        required={!hasSensitivePayload}
        maxLength={100}
        disabled={disabled}
        stored={hasSensitivePayload}
      />
      <TextField
        label="身份证号码"
        name="identity_number"
        placeholder={sensitivePlaceholder}
        requirement="required"
        required={!hasSensitivePayload}
        pattern="\d{17}[\dXx]"
        maxLength={18}
        disabled={disabled}
        stored={hasSensitivePayload}
      />
      <TextField
        label="身份证居住地址"
        name="identity_address"
        placeholder={applyment?.identity_address_masked || sensitivePlaceholder}
        requirement={identityAddressRequired ? "required" : "optional"}
        required={identityAddressRequired && !hasSensitivePayload}
        maxLength={128}
        disabled={disabled}
        stored={hasSensitivePayload}
      />
      <TextField
        label="身份证有效期开始"
        name="identity_period_begin"
        type="date"
        defaultValue={applyment?.identity_period_begin || ""}
        requirement="required"
        required
        disabled={disabled}
      />
      <PeriodEndField
        label="身份证有效期结束"
        name="identity_period_end"
        defaultValue={applyment?.identity_period_end}
        disabled={disabled}
      />
      <SelectField
        label="超级管理员身份"
        name="contact_type"
        defaultValue={contactType}
        options={CONTACT_TYPE_OPTIONS}
        requirement="required"
        disabled={disabled}
        onValueChange={onContactTypeChange}
      />
      <TextField
        label="超级管理员姓名"
        name="super_admin_name"
        defaultValue={applyment?.super_admin_name || ""}
        requirement="required"
        required
        maxLength={50}
        disabled={disabled}
      />
      <TextField
        label="超级管理员手机号"
        name="super_admin_phone"
        placeholder={applyment?.super_admin_phone_masked || sensitivePlaceholder}
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
      {contactType === "SUPER" ? (
        <AgentIdentityFields
          applyment={applyment}
          disabled={disabled}
          hasSensitivePayload={hasSensitivePayload}
          placeholder={sensitivePlaceholder}
        />
      ) : null}
    </FieldGroup>
  );
}

function AgentIdentityFields({
  applyment,
  disabled,
  hasSensitivePayload,
  placeholder,
}: {
  applyment: WechatPayApplymentRecord | null;
  disabled: boolean;
  hasSensitivePayload: boolean;
  placeholder: string;
}) {
  return (
    <>
      <TextField
        label="经办人身份证号码"
        name="contact_identity_number"
        placeholder={placeholder}
        requirement="required"
        required={!hasSensitivePayload}
        pattern="\d{17}[\dXx]"
        maxLength={18}
        disabled={disabled}
        stored={hasSensitivePayload}
      />
      <TextField
        label="经办人身份证地址"
        name="contact_identity_address"
        placeholder={placeholder}
        requirement="required"
        required={!hasSensitivePayload}
        maxLength={128}
        disabled={disabled}
        stored={hasSensitivePayload}
      />
      <TextField
        label="经办人证件有效期开始"
        name="contact_identity_period_begin"
        type="date"
        defaultValue={applyment?.contact_identity_period_begin || ""}
        requirement="required"
        required
        disabled={disabled}
      />
      <PeriodEndField
        label="经办人证件有效期结束"
        name="contact_identity_period_end"
        defaultValue={applyment?.contact_identity_period_end}
        disabled={disabled}
      />
    </>
  );
}

function SettlementFields({ applyment, subjectType, disabled }: StepsProps) {
  const hasBankAccount = Boolean(applyment?.settlement_account_number_masked);
  const accountType = subjectType === "SUBJECT_TYPE_ENTERPRISE"
    ? "BANK_ACCOUNT_TYPE_CORPORATE"
    : applyment?.settlement_account_type || "BANK_ACCOUNT_TYPE_PERSONAL";

  return (
    <FieldGroup className="grid gap-4 md:grid-cols-2">
      <TextField label="客服电话" name="service_phone" defaultValue={applyment?.service_phone || ""} requirement="required" required maxLength={20} inputMode="tel" disabled={disabled} />
      <SelectField label="结算账户类型" name="settlement_account_type" defaultValue={accountType} options={SETTLEMENT_ACCOUNT_TYPE_OPTIONS} requirement="required" disabled={disabled || subjectType === "SUBJECT_TYPE_ENTERPRISE"} description={subjectType === "SUBJECT_TYPE_ENTERPRISE" ? "企业主体固定使用对公银行账户。" : undefined} />
      <TextField label="结算账户开户名" name="settlement_account_name" defaultValue={applyment?.settlement_account_name || ""} requirement="required" required maxLength={100} disabled={disabled} />
      <TextField label="开户银行" name="settlement_bank_name" defaultValue={applyment?.settlement_bank_name || ""} description="填写银行基础名称，如中国工商银行。" requirement="required" required maxLength={100} disabled={disabled} />
      <TextField label="银行账号" name="settlement_account_number" placeholder={applyment?.settlement_account_number_masked || "请输入银行账号"} description="新填写内容会加密存储，保存后只记录掩码。" requirement="required" required={!hasBankAccount} pattern="\d{8,32}" maxLength={32} inputMode="numeric" disabled={disabled} stored={hasBankAccount} />
      <TextField label="开户银行全称（含支行）" name="settlement_bank_full_name" defaultValue={applyment?.settlement_bank_full_name || ""} maxLength={128} disabled={disabled} />
      <TextField label="开户银行联行号" name="settlement_bank_branch_id" defaultValue={applyment?.settlement_bank_branch_id || ""} maxLength={128} disabled={disabled} />
      <TextField label="结算规则 ID" name="settlement_id" defaultValue={applyment?.settlement_id || ""} requirement="required" required maxLength={32} disabled={disabled} />
      <TextField label="所属行业" name="qualification_type" defaultValue={applyment?.qualification_type || ""} requirement="required" required maxLength={200} disabled={disabled} />
      <TextareaField label="经营场景说明" name="business_scene_description" defaultValue={applyment?.business_scene_description || ""} requirement="required" required disabled={disabled} />
      <TextareaField label="经营联系地址" name="contact_address" defaultValue={applyment?.contact_address || ""} requirement="required" required disabled={disabled} />
      <TextareaField label="备注" name="remark" defaultValue={applyment?.remark || ""} disabled={disabled} />
    </FieldGroup>
  );
}

function StepContent({ value, children }: { value: string; children: ReactNode }) {
  return (
    <TabsContent
      value={value}
      forceMount
      data-applyment-step={value}
      className="min-h-[30rem] data-[state=inactive]:hidden"
    >
      {children}
    </TabsContent>
  );
}
