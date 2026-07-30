"use client";

import {
  CheckCircle2,
  Eye,
  Loader2,
  XCircle,
} from "lucide-react";
import { type FormEvent, type ReactNode, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { StatusAlert } from "@/components/admin/status-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import type {
  PlatformPartnerApplicationRecord,
  PlatformPartnerLevel,
} from "@/components/platform-partners/platform-partner-types";
import {
  applicationStatusOptions,
  optionLabel,
} from "@/components/platform-partners/platform-partner-types";
import { PlatformPartnerRegionPicker } from "@/components/platform-partners/platform-partner-region-picker";
import { requestBackendJson } from "@/lib/backend-client";
import { refreshAfterDialogClose } from "@/lib/deferred-refresh";

type Option = { value: string; label: string };
type FieldConfig = {
  name: string;
  label: string;
  type?: "text" | "textarea" | "select";
  placeholder?: string;
  description?: string;
  required?: boolean;
  defaultValue?: string;
  options?: Option[];
};

type ApplicationMutationDialogButtonProps = {
  title: string;
  description: string;
  trigger: ReactNode;
  submitLabel: string;
  fields: FieldConfig[];
  fallbackMessage: string;
  endpoint: string;
  method?: "POST" | "PATCH";
  buildPayload: (formData: FormData) => Record<string, unknown>;
  extraFields?: ReactNode;
  submitDisabled?: boolean;
  onSuccess?: () => void;
};

export function ApplicationDetailButton({
  application,
}: {
  application: PlatformPartnerApplicationRecord;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="ghost">
          <Eye data-icon="inline-start" />
          详情
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[680px]">
        <DialogHeader>
          <DialogTitle>{application.applicant_name}</DialogTitle>
          <DialogDescription>
            {application.application_no} / {formatDate(application.created_at)}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 text-sm md:grid-cols-2">
          <DetailItem label="状态">
            <Badge variant="outline">
              {optionLabel(applicationStatusOptions, application.status)}
            </Badge>
          </DetailItem>
          <DetailItem label="主体类型">{subjectTypeLabel(application.subject_type)}</DetailItem>
          <DetailItem label="联系人">{application.contact_name}</DetailItem>
          <DetailItem label="联系电话">{application.phone}</DetailItem>
          <DetailItem label="意向区域">
            {application.region_name || application.region_codes.join(" / ") || "-"}
          </DetailItem>
          <DetailItem label="来源">{application.source_channel}</DetailItem>
          <DetailItem label="业务基础" wide>{application.business_description || "-"}</DetailItem>
          <DetailItem label="资源说明" wide>{application.resource_description || "-"}</DetailItem>
          <DetailItem label="补充说明" wide>{application.message || "-"}</DetailItem>
          <DetailItem label="审核备注" wide>{application.review_remark || "-"}</DetailItem>
          <DetailItem label="已转合伙人" wide>
            {application.converted_partner?.name ?? application.converted_partner_id ?? "-"}
          </DetailItem>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ApprovePartnerApplicationButton({
  application,
  levels,
}: {
  application: PlatformPartnerApplicationRecord;
  levels: PlatformPartnerLevel[];
}) {
  const [selectedRegionCodes, setSelectedRegionCodes] = useState(
    application.region_codes,
  );
  const disabled = application.status === "approved" ||
    application.status === "rejected" ||
    levels.length === 0;

  return (
    <ApplicationMutationDialogButton
      title="审核通过"
      description="通过后会创建一个待启用的正式城市合伙人，后续可在合伙人 tab 中完善合同、结算账户并启用。"
      trigger={
        <Button type="button" size="sm" variant="outline" disabled={disabled}>
          <CheckCircle2 data-icon="inline-start" />
          通过
        </Button>
      }
      submitLabel="通过并创建合伙人"
      fallbackMessage="审核通过失败"
      endpoint={`/platform/partner-applications/${application.id}/approve`}
      fields={[
        {
          name: "level_id",
          label: "合伙人等级",
          type: "select",
          required: true,
          options: levels.map((level) => ({ value: level.id, label: level.name })),
        },
        {
          name: "partner_name",
          label: "合伙人名称",
          required: true,
          defaultValue: application.applicant_name,
        },
        {
          name: "review_remark",
          label: "审核备注",
          type: "textarea",
          defaultValue: "官网申请审核通过",
        },
      ]}
      extraFields={
        <PlatformPartnerRegionPicker
          value={selectedRegionCodes}
          initialAreas={application.region_areas}
          onChange={setSelectedRegionCodes}
        />
      }
      submitDisabled={selectedRegionCodes.length === 0}
      onSuccess={() => setSelectedRegionCodes(application.region_codes)}
      buildPayload={(formData) => ({
        level_id: stringField(formData, "level_id"),
        partner_name: optionalString(formData, "partner_name"),
        region_codes: selectedRegionCodes,
        review_remark: optionalString(formData, "review_remark"),
      })}
    />
  );
}

export function RejectPartnerApplicationButton({
  application,
}: {
  application: PlatformPartnerApplicationRecord;
}) {
  const disabled = application.status === "approved" || application.status === "rejected";

  return (
    <ApplicationMutationDialogButton
      title="驳回申请"
      description="驳回后不会创建正式合伙人，可在备注中记录原因，便于后续人工沟通。"
      trigger={
        <Button type="button" size="sm" variant="outline" disabled={disabled}>
          <XCircle data-icon="inline-start" />
          驳回
        </Button>
      }
      submitLabel="确认驳回"
      fallbackMessage="驳回申请失败"
      endpoint={`/platform/partner-applications/${application.id}/status`}
      method="PATCH"
      fields={[
        {
          name: "review_remark",
          label: "驳回原因",
          type: "textarea",
          required: true,
          placeholder: "例如：区域资源不匹配，暂不开放该城市。",
        },
      ]}
      buildPayload={(formData) => ({
        status: "rejected",
        review_remark: stringField(formData, "review_remark"),
      })}
    />
  );
}

function ApplicationMutationDialogButton({
  title,
  description,
  trigger,
  submitLabel,
  fields,
  fallbackMessage,
  endpoint,
  method = "POST",
  buildPayload,
  extraFields,
  submitDisabled = false,
  onSuccess,
}: ApplicationMutationDialogButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      try {
        await requestBackendJson(endpoint, {
          method,
          body: JSON.stringify(cleanPayload(buildPayload(formData))),
          fallbackMessage,
        });
        onSuccess?.();
        setOpen(false);
        refreshAfterDialogClose(router);
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : fallbackMessage);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !pending && setOpen(nextOpen)}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={onSubmit}>
          <FieldGroup className="grid gap-4 md:grid-cols-2">
            {fields.map((field) => (
              <DialogField key={field.name} field={field} />
            ))}
            {extraFields}
          </FieldGroup>
          {error ? <StatusAlert>{error}</StatusAlert> : null}
          <FieldError />
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button type="submit" disabled={pending || submitDisabled}>
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DialogField({ field }: { field: FieldConfig }) {
  const id = `partner-application-${field.name}`;
  if (field.type === "select") {
    return (
      <DialogSelectField
        id={id}
        name={field.name}
        label={field.label}
        options={field.options ?? []}
      />
    );
  }

  return (
    <Field className={field.type === "textarea" ? "md:col-span-2" : undefined}>
      <FieldLabel htmlFor={id}>{field.label}</FieldLabel>
      {field.type === "textarea" ? (
        <Textarea
          id={id}
          name={field.name}
          placeholder={field.placeholder}
          required={field.required}
          defaultValue={field.defaultValue}
        />
      ) : (
        <Input
          id={id}
          name={field.name}
          placeholder={field.placeholder}
          required={field.required}
          defaultValue={field.defaultValue}
        />
      )}
      {field.description ? <FieldDescription>{field.description}</FieldDescription> : null}
    </Field>
  );
}

function DialogSelectField({
  id,
  name,
  label,
  options,
}: {
  id: string;
  name: string;
  label: string;
  options: Option[];
}) {
  const [value, setValue] = useState(options[0]?.value ?? "");
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <input type="hidden" name={name} value={value} />
      <Select value={value} onValueChange={setValue}>
        <SelectTrigger id={id}>
          <SelectValue placeholder="请选择" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}

function DetailItem({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "md:col-span-2" : undefined}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 break-words">{children}</div>
    </div>
  );
}

function stringField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function optionalString(formData: FormData, key: string) {
  const value = stringField(formData, key);
  return value || undefined;
}

function cleanPayload(payload: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined),
  );
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("zh-CN");
}

function subjectTypeLabel(value: string) {
  if (value === "personal") return "个人";
  if (value === "individual_business") return "个体工商户";
  if (value === "company") return "企业";
  return value;
}
