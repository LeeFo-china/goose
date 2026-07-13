"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

import type { PartnerApplicationFormErrors } from "./partner-application-form-utils";

interface PartnerApplicationFieldsProps {
  readonly agreePrivacy: boolean;
  readonly codeMessage: string;
  readonly cooldownSeconds: number;
  readonly errors: PartnerApplicationFormErrors;
  readonly isSendingCode: boolean;
  readonly onAgreePrivacyChange: (checked: boolean) => void;
  readonly onPhoneChange: (phone: string) => void;
  readonly onSendCode: () => Promise<void>;
  readonly onSubjectTypeChange: (subjectType: string) => void;
  readonly pending: boolean;
  readonly phone: string;
  readonly subjectType: string;
}

const subjectTypeOptions = [
  { value: "company", label: "企业" },
  { value: "individual_business", label: "个体工商户" },
  { value: "personal", label: "个人" },
] as const;

export function PartnerApplicationFields({
  agreePrivacy,
  codeMessage,
  cooldownSeconds,
  errors,
  isSendingCode,
  onAgreePrivacyChange,
  onPhoneChange,
  onSendCode,
  onSubjectTypeChange,
  pending,
  phone,
  subjectType,
}: PartnerApplicationFieldsProps): React.JSX.Element {
  return (
    <>
      <FieldGroup className="grid gap-5 md:grid-cols-2">
        <Field data-invalid={Boolean(errors.applicant_name)}>
          <FieldLabel htmlFor="applicant_name">申请主体</FieldLabel>
          <Input
            aria-describedby={
              errors.applicant_name ? "applicant-name-error" : undefined
            }
            aria-invalid={Boolean(errors.applicant_name)}
            autoComplete="organization"
            className="h-11"
            id="applicant_name"
            maxLength={120}
            name="applicant_name"
            placeholder="公司、个体户或个人名称"
          />
          <FieldError id="applicant-name-error">
            {errors.applicant_name}
          </FieldError>
        </Field>

        <Field>
          <FieldLabel htmlFor="subject_type">主体类型</FieldLabel>
          <input name="subject_type" type="hidden" value={subjectType} />
          <Select value={subjectType} onValueChange={onSubjectTypeChange}>
            <SelectTrigger className="h-11" id="subject_type">
              <SelectValue placeholder="请选择主体类型" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {subjectTypeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>

        <Field data-invalid={Boolean(errors.contact_name)}>
          <FieldLabel htmlFor="contact_name">联系人</FieldLabel>
          <Input
            aria-describedby={
              errors.contact_name ? "contact-name-error" : undefined
            }
            aria-invalid={Boolean(errors.contact_name)}
            autoComplete="name"
            className="h-11"
            id="contact_name"
            maxLength={60}
            name="contact_name"
            placeholder="你的姓名"
          />
          <FieldError id="contact-name-error">
            {errors.contact_name}
          </FieldError>
        </Field>

        <Field data-invalid={Boolean(errors.phone)}>
          <FieldLabel htmlFor="phone">联系电话</FieldLabel>
          <Input
            aria-describedby={errors.phone ? "phone-error" : undefined}
            aria-invalid={Boolean(errors.phone)}
            autoComplete="tel"
            className="h-11"
            id="phone"
            inputMode="numeric"
            maxLength={11}
            name="phone"
            onChange={(event) => onPhoneChange(event.target.value)}
            placeholder="11 位手机号"
            value={phone}
          />
          <FieldError id="phone-error">{errors.phone}</FieldError>
        </Field>

        <Field className="md:col-span-2" data-invalid={Boolean(errors.sms_code)}>
          <FieldLabel htmlFor="sms_code">短信验证码（选填）</FieldLabel>
          <div className="flex flex-col items-start gap-3 sm:flex-row">
            <Input
              aria-describedby={
                errors.sms_code
                  ? "sms-code-description sms-code-error"
                  : "sms-code-description"
              }
              aria-invalid={Boolean(errors.sms_code)}
              className="h-11 sm:max-w-xs"
              id="sms_code"
              inputMode="numeric"
              maxLength={6}
              name="sms_code"
              placeholder="4-6 位验证码"
            />
            <Button
              aria-busy={isSendingCode}
              className="h-11 w-full sm:w-auto"
              disabled={isSendingCode || pending || cooldownSeconds > 0}
              onClick={onSendCode}
              type="button"
              variant="outline"
            >
              {isSendingCode ? (
                <Spinner aria-hidden="true" data-icon="inline-start" />
              ) : null}
              {isSendingCode
                ? "发送中"
                : cooldownSeconds > 0
                  ? `${cooldownSeconds} 秒后重试`
                  : "发送验证码"}
            </Button>
          </div>
          <FieldDescription id="sms-code-description">
            验证码用于增强联系方式可信度，不是官网提交的必填项。
          </FieldDescription>
          {codeMessage ? (
            <p aria-live="polite" className="text-sm text-success">
              {codeMessage}
            </p>
          ) : null}
          <FieldError id="sms-code-error">{errors.sms_code}</FieldError>
        </Field>

        <Field className="md:col-span-2" data-invalid={Boolean(errors.region_name)}>
          <FieldLabel htmlFor="region_name">意向代理城市</FieldLabel>
          <Input
            aria-describedby={
              errors.region_name
                ? "region-description region-error"
                : "region-description"
            }
            aria-invalid={Boolean(errors.region_name)}
            className="h-11"
            id="region_name"
            maxLength={120}
            name="region_name"
            placeholder="例如：河南信阳、江苏苏州"
          />
          <FieldDescription id="region-description">
            平台会人工确认区域保护和开通边界。
          </FieldDescription>
          <FieldError id="region-error">{errors.region_name}</FieldError>
        </Field>

        <Field className="md:col-span-2">
          <FieldLabel htmlFor="business_description">本地业务基础</FieldLabel>
          <Textarea
            id="business_description"
            maxLength={1000}
            name="business_description"
            placeholder="装修公司资源、团队能力或运营经验"
            rows={4}
          />
        </Field>

        <Field className="md:col-span-2">
          <FieldLabel htmlFor="resource_description">渠道资源说明</FieldLabel>
          <Textarea
            id="resource_description"
            maxLength={1000}
            name="resource_description"
            placeholder="已有装企关系、建材渠道、楼盘资源或投放能力"
            rows={4}
          />
        </Field>

        <Field className="md:col-span-2">
          <FieldLabel htmlFor="message">补充说明</FieldLabel>
          <Textarea
            id="message"
            maxLength={1000}
            name="message"
            placeholder="希望平台优先了解的合作诉求"
            rows={3}
          />
        </Field>
      </FieldGroup>

      <Field data-invalid={Boolean(errors.privacy)}>
        <FieldLabel className="items-start" htmlFor="agree_privacy">
          <Checkbox
            aria-describedby={errors.privacy ? "privacy-error" : undefined}
            aria-invalid={Boolean(errors.privacy)}
            checked={agreePrivacy}
            id="agree_privacy"
            name="agree_privacy"
            onCheckedChange={(checked) =>
              onAgreePrivacyChange(checked === true)
            }
          />
          <span className="font-normal leading-6">
            我确认填写信息真实，并同意平台将信息用于申请审核、人工沟通和后续合作开通。
          </span>
        </FieldLabel>
        <FieldError id="privacy-error">{errors.privacy}</FieldError>
      </Field>
    </>
  );
}
