"use client";

import { Loader2, Send } from "lucide-react";
import { type FormEvent, useState, useTransition } from "react";
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
import { Textarea } from "@/components/ui/textarea";

type SubmissionState =
  | { status: "idle"; message: "" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

type PartnerApplicationResponse = {
  success?: boolean;
  data?: {
    application_no?: string;
  };
  message?: string;
  error?: string;
  code?: string;
};

const subjectTypeOptions = [
  { value: "company", label: "企业" },
  { value: "individual_business", label: "个体工商户" },
  { value: "personal", label: "个人" },
] as const;

export function PartnerApplicationForm() {
  const [subjectType, setSubjectType] = useState("company");
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [state, setState] = useState<SubmissionState>({
    status: "idle",
    message: "",
  });
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ status: "idle", message: "" });

    if (!agreePrivacy) {
      setState({
        status: "error",
        message: "请先同意隐私政策和合作申请规则",
      });
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    startTransition(async () => {
      try {
        const payload = buildPayload(formData, subjectType, agreePrivacy);
        const response = await fetch("/api/public/partner-applications", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        const result = await response.json().catch(() => ({})) as PartnerApplicationResponse;
        if (!response.ok || result.success === false) {
          throw new Error(getPayloadMessage(result, "申请提交失败，请稍后再试"));
        }

        form.reset();
        setSubjectType("company");
        setAgreePrivacy(false);
        setState({
          status: "success",
          message: result.data?.application_no
            ? `申请已提交，编号 ${result.data.application_no}。平台运营会人工联系你核实信息。`
            : "申请已提交。平台运营会人工联系你核实信息。",
        });
      } catch (error) {
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "申请提交失败，请稍后再试",
        });
      }
    });
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
      <FieldGroup className="grid gap-4 md:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="applicant_name">申请主体</FieldLabel>
          <Input
            id="applicant_name"
            name="applicant_name"
            placeholder="公司、个体户或个人名称"
            required
            maxLength={120}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="subject_type">主体类型</FieldLabel>
          <input type="hidden" name="subject_type" value={subjectType} />
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
        <Field>
          <FieldLabel htmlFor="contact_name">联系人</FieldLabel>
          <Input
            id="contact_name"
            name="contact_name"
            placeholder="你的姓名"
            required
            maxLength={60}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="phone">联系电话</FieldLabel>
          <Input
            id="phone"
            name="phone"
            placeholder="11 位手机号"
            required
            inputMode="numeric"
            maxLength={11}
            pattern="1[3-9][0-9]{9}"
          />
        </Field>
        <Field className="md:col-span-2">
          <FieldLabel htmlFor="region_name">意向代理城市</FieldLabel>
          <Input
            id="region_name"
            name="region_name"
            placeholder="例如：河南信阳、江苏苏州"
            required
            maxLength={120}
          />
          <FieldDescription>
            第一阶段由平台人工确认区域保护和开通边界。
          </FieldDescription>
        </Field>
        <Field className="md:col-span-2">
          <FieldLabel htmlFor="business_description">本地业务基础</FieldLabel>
          <Textarea
            id="business_description"
            name="business_description"
            placeholder="你所在地区的装修公司资源、团队能力或运营经验"
            rows={4}
            maxLength={1000}
          />
        </Field>
        <Field className="md:col-span-2">
          <FieldLabel htmlFor="resource_description">渠道资源说明</FieldLabel>
          <Textarea
            id="resource_description"
            name="resource_description"
            placeholder="已有装企关系、建材渠道、楼盘资源、线上投放能力等"
            rows={4}
            maxLength={1000}
          />
        </Field>
        <Field className="md:col-span-2">
          <FieldLabel htmlFor="message">补充说明</FieldLabel>
          <Textarea
            id="message"
            name="message"
            placeholder="你希望平台优先了解的合作诉求"
            rows={3}
            maxLength={1000}
          />
        </Field>
      </FieldGroup>

      <Field>
        <label className="flex items-start gap-3 text-sm leading-6">
          <Checkbox
            checked={agreePrivacy}
            onCheckedChange={(checked) => setAgreePrivacy(checked === true)}
            aria-label="同意隐私政策和合作申请规则"
          />
          <input
            type="hidden"
            name="agree_privacy"
            value={agreePrivacy ? "true" : ""}
          />
          <span>
            我确认填写信息真实，并同意平台用于城市合伙人申请审核、人工沟通和后续合作开通。
          </span>
        </label>
      </Field>

      {state.status === "success" ? (
        <Alert>
          <AlertTitle>提交成功</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
      {state.status === "error" ? (
        <FieldError>{state.message}</FieldError>
      ) : null}

      <Button type="submit" className="h-11 w-full md:w-fit" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Send data-icon="inline-start" />}
        提交合作申请
      </Button>
    </form>
  );
}

function buildPayload(
  formData: FormData,
  subjectType: string,
  agreePrivacy: boolean,
) {
  const sourceUrl = typeof window === "undefined" ? "" : window.location.href;
  const params = typeof window === "undefined"
    ? new URLSearchParams()
    : new URLSearchParams(window.location.search);

  return cleanPayload({
    applicant_name: stringField(formData, "applicant_name"),
    subject_type: subjectType,
    contact_name: stringField(formData, "contact_name"),
    phone: stringField(formData, "phone"),
    region_name: stringField(formData, "region_name"),
    region_codes: [],
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

function stringField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function optionalString(formData: FormData, key: string) {
  return stringField(formData, key) || undefined;
}

function optionalParam(params: URLSearchParams, key: string) {
  return params.get(key)?.trim() || undefined;
}

function cleanPayload(payload: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined && value !== ""),
  );
}

function getPayloadMessage(payload: PartnerApplicationResponse, fallback: string) {
  return payload.message || payload.error || fallback;
}
