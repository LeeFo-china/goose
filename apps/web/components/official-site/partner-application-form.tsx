"use client";

import { type FormEvent, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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

interface PublicApplicationResponse {
  readonly code?: string;
  readonly data?: {
    readonly application_no?: string;
    readonly expires_in?: number;
  };
  readonly error?: string;
  readonly message?: string;
  readonly success?: boolean;
}

interface FormErrors {
  readonly applicant_name?: string;
  readonly contact_name?: string;
  readonly phone?: string;
  readonly privacy?: string;
  readonly region_name?: string;
  readonly sms_code?: string;
}

type SubmissionState =
  | { readonly status: "idle"; readonly message: "" }
  | { readonly status: "submitting"; readonly message: "" }
  | { readonly status: "success"; readonly message: string }
  | { readonly status: "error"; readonly message: string };

const subjectTypeOptions = [
  { value: "company", label: "企业" },
  { value: "individual_business", label: "个体工商户" },
  { value: "personal", label: "个人" },
] as const;

export function PartnerApplicationForm(): React.JSX.Element {
  const [subjectType, setSubjectType] = useState("company");
  const [phone, setPhone] = useState("");
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submission, setSubmission] = useState<SubmissionState>({
    status: "idle",
    message: "",
  });
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [codeMessage, setCodeMessage] = useState("");
  const pending = submission.status === "submitting";

  async function handleSendCode(): Promise<void> {
    const phoneError = validatePhone(phone);
    if (phoneError) {
      setErrors((current) => ({ ...current, phone: phoneError }));
      return;
    }

    setErrors((current) => ({ ...current, phone: undefined }));
    setCodeMessage("");
    setIsSendingCode(true);
    try {
      const response = await fetch(
        "/api/public/partner-applications/send-code",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ phone: phone.trim() }),
        },
      );
      const result = await readResponse(response);
      if (!response.ok || result.success === false) {
        setErrors((current) => ({
          ...current,
          phone: getResponseMessage(result, "验证码发送失败，请稍后再试"),
        }));
        return;
      }

      setCodeMessage("验证码已发送。官网申请不强制填写验证码，可直接提交申请。");
    } catch {
      setErrors((current) => ({
        ...current,
        phone: "验证码发送失败，请稍后再试",
      }));
    } finally {
      setIsSendingCode(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const nextErrors = validateForm(formData, agreePrivacy);
    setErrors(nextErrors);
    setSubmission({ status: "idle", message: "" });
    if (Object.keys(nextErrors).length > 0) return;

    setSubmission({ status: "submitting", message: "" });
    try {
      const response = await fetch("/api/public/partner-applications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          buildPayload(formData, subjectType, agreePrivacy),
        ),
      });
      const result = await readResponse(response);
      if (!response.ok || result.success === false) {
        setSubmission({
          status: "error",
          message: getResponseMessage(result, "申请提交失败，请稍后再试"),
        });
        return;
      }

      form.reset();
      setPhone("");
      setSubjectType("company");
      setAgreePrivacy(false);
      setCodeMessage("");
      setSubmission({
        status: "success",
        message: result.data?.application_no
          ? `申请已提交，编号 ${result.data.application_no}。平台运营会联系你核实信息。`
          : "申请已提交。平台运营会联系你核实信息。",
      });
    } catch {
      setSubmission({
        status: "error",
        message: "申请提交失败，请稍后再试",
      });
    }
  }

  return (
    <form className="flex flex-col gap-6" noValidate onSubmit={handleSubmit}>
      <FieldGroup className="grid gap-5 md:grid-cols-2">
          <Field data-invalid={Boolean(errors.applicant_name)}>
            <FieldLabel htmlFor="applicant_name">申请主体</FieldLabel>
            <Input
              aria-invalid={Boolean(errors.applicant_name)}
              autoComplete="organization"
              id="applicant_name"
              maxLength={120}
              name="applicant_name"
              placeholder="公司、个体户或个人名称"
            />
            <FieldError>{errors.applicant_name}</FieldError>
          </Field>

          <Field>
            <FieldLabel htmlFor="subject_type">主体类型</FieldLabel>
            <input name="subject_type" type="hidden" value={subjectType} />
            <Select value={subjectType} onValueChange={setSubjectType}>
              <SelectTrigger id="subject_type">
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
              aria-invalid={Boolean(errors.contact_name)}
              autoComplete="name"
              id="contact_name"
              maxLength={60}
              name="contact_name"
              placeholder="你的姓名"
            />
            <FieldError>{errors.contact_name}</FieldError>
          </Field>

          <Field data-invalid={Boolean(errors.phone)}>
            <FieldLabel htmlFor="phone">联系电话</FieldLabel>
            <Input
              aria-invalid={Boolean(errors.phone)}
              autoComplete="tel"
              id="phone"
              inputMode="numeric"
              maxLength={11}
              name="phone"
              onChange={(event) => setPhone(event.target.value)}
              placeholder="11 位手机号"
              value={phone}
            />
            <FieldError>{errors.phone}</FieldError>
          </Field>

          <Field className="md:col-span-2" data-invalid={Boolean(errors.sms_code)}>
            <FieldLabel htmlFor="sms_code">短信验证码（选填）</FieldLabel>
            <div className="flex flex-col items-start gap-3 sm:flex-row">
              <Input
                aria-invalid={Boolean(errors.sms_code)}
                className="sm:max-w-xs"
                id="sms_code"
                inputMode="numeric"
                maxLength={6}
                name="sms_code"
                placeholder="4-6 位验证码"
              />
              <Button
                aria-busy={isSendingCode}
                disabled={isSendingCode || pending}
                onClick={handleSendCode}
                type="button"
                variant="outline"
              >
                {isSendingCode ? <Spinner data-icon="inline-start" /> : null}
                {isSendingCode ? "发送中" : "发送验证码"}
              </Button>
            </div>
            <FieldDescription>
              验证码用于增强联系方式可信度，不是官网提交的必填项。
            </FieldDescription>
            {codeMessage ? (
              <p aria-live="polite" className="text-sm text-success">
                {codeMessage}
              </p>
            ) : null}
            <FieldError>{errors.sms_code}</FieldError>
          </Field>

          <Field className="md:col-span-2" data-invalid={Boolean(errors.region_name)}>
            <FieldLabel htmlFor="region_name">意向代理城市</FieldLabel>
            <Input
              aria-invalid={Boolean(errors.region_name)}
              id="region_name"
              maxLength={120}
              name="region_name"
              placeholder="例如：河南信阳、江苏苏州"
            />
            <FieldDescription>
              平台会人工确认区域保护和开通边界。
            </FieldDescription>
            <FieldError>{errors.region_name}</FieldError>
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
            aria-invalid={Boolean(errors.privacy)}
            checked={agreePrivacy}
            id="agree_privacy"
            onCheckedChange={(checked) => setAgreePrivacy(checked === true)}
          />
          <span className="font-normal leading-6">
            我确认填写信息真实，并同意平台将信息用于申请审核、人工沟通和后续合作开通。
          </span>
        </FieldLabel>
        <FieldError>{errors.privacy}</FieldError>
      </Field>

      {submission.status === "success" ? (
        <Alert>
          <AlertTitle>提交成功</AlertTitle>
          <AlertDescription>{submission.message}</AlertDescription>
        </Alert>
      ) : null}
      {submission.status === "error" ? (
        <FieldError>{submission.message}</FieldError>
      ) : null}

      <Button
        aria-busy={pending}
        className="h-11 w-full sm:w-fit"
        disabled={pending}
        type="submit"
      >
        {pending ? <Spinner data-icon="inline-start" /> : null}
        {pending ? "提交中" : "提交合作申请"}
      </Button>
    </form>
  );
}

function validateForm(formData: FormData, agreePrivacy: boolean): FormErrors {
  const errors: Record<string, string> = {};
  if (!stringField(formData, "applicant_name")) {
    errors.applicant_name = "请填写申请主体";
  }
  if (!stringField(formData, "contact_name")) {
    errors.contact_name = "请填写联系人";
  }

  const phoneError = validatePhone(stringField(formData, "phone"));
  if (phoneError) errors.phone = phoneError;

  const smsCode = optionalString(formData, "sms_code");
  if (smsCode && !/^\d{4,6}$/.test(smsCode)) {
    errors.sms_code = "请输入 4-6 位数字验证码";
  }
  if (!stringField(formData, "region_name")) {
    errors.region_name = "请填写意向代理城市";
  }
  if (!agreePrivacy) errors.privacy = "请先确认申请信息使用说明";

  return errors;
}

function validatePhone(value: string): string | undefined {
  return /^1[3-9]\d{9}$/.test(value.trim())
    ? undefined
    : "请输入正确的 11 位手机号";
}

function buildPayload(
  formData: FormData,
  subjectType: string,
  agreePrivacy: boolean,
): Record<string, unknown> {
  const sourceUrl = typeof window === "undefined" ? "" : window.location.href;
  const params =
    typeof window === "undefined"
      ? new URLSearchParams()
      : new URLSearchParams(window.location.search);

  return cleanPayload({
    applicant_name: stringField(formData, "applicant_name"),
    subject_type: subjectType,
    contact_name: stringField(formData, "contact_name"),
    phone: stringField(formData, "phone"),
    sms_code: optionalString(formData, "sms_code"),
    region_codes: [],
    region_name: stringField(formData, "region_name"),
    business_description: optionalString(formData, "business_description"),
    resource_description: optionalString(formData, "resource_description"),
    message: optionalString(formData, "message"),
    source_channel: "official_website",
    source_url: sourceUrl,
    utm_source: optionalParam(params, "utm_source"),
    utm_medium: optionalParam(params, "utm_medium"),
    utm_campaign: optionalParam(params, "utm_campaign"),
    agree_privacy: agreePrivacy,
  });
}

function stringField(formData: FormData, key: string): string {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function optionalString(formData: FormData, key: string): string | undefined {
  return stringField(formData, key) || undefined;
}

function optionalParam(
  params: URLSearchParams,
  key: string,
): string | undefined {
  return params.get(key)?.trim() || undefined;
}

function cleanPayload(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(payload).filter(
      ([, value]) => value !== undefined && value !== "",
    ),
  );
}

async function readResponse(response: Response): Promise<PublicApplicationResponse> {
  return response.json().catch(() => ({})) as Promise<PublicApplicationResponse>;
}

function getResponseMessage(
  response: PublicApplicationResponse,
  fallback: string,
): string {
  return response.message || response.error || fallback;
}
