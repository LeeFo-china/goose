"use client";

import type { ChangeEvent, FormEvent } from "react";
import { useState } from "react";
import type { OcrWarning } from "@gooes/domain";
import { AlertCircle, CheckCircle2, Loader2, UploadCloud } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
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
import { requestBackendJson } from "@/lib/backend-client";
import { uploadDirectToCos, validateUploadFile } from "@/lib/cos-direct-upload";

import {
  newIdempotencyKey,
  supplierTypeOptions,
  type SupplierType,
} from "./platform-supplier-types";
import {
  checkSupplierIdentity,
  recognizeSupplierLicense,
  type IdentityCheckResult,
} from "./platform-supplier-onboarding-api";
import {
  buildSupplierOnboardingPayload,
  emptySupplierOnboardingForm,
  mapBusinessLicenseOcrFields,
  normalizeCreditCode,
  validateSupplierOnboardingForm,
  type OnboardingFormState,
} from "./platform-supplier-onboarding-rules";
import { SupplierOnboardingTextField } from "./platform-supplier-onboarding-text-field";

const ACCEPTED_LICENSE_TYPES = new Set(["image/jpeg", "image/png"]);
const MAX_LICENSE_SIZE_BYTES = 5 * 1024 * 1024;

export function PlatformSupplierOnboardingFormButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<OnboardingFormState>(
    emptySupplierOnboardingForm,
  );
  const [licenseName, setLicenseName] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [warnings, setWarnings] = useState<readonly OcrWarning[]>([]);
  const [duplicate, setDuplicate] = useState<IdentityCheckResult | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setForm(emptySupplierOnboardingForm);
    setLicenseName("");
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl("");
    setWarnings([]);
    setDuplicate(null);
    setFieldErrors({});
    setUploading(false);
    setSubmitting(false);
  }

  function patchForm(patch: Partial<OnboardingFormState>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  async function handleLicenseUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setUploading(true);
    setWarnings([]);
    setDuplicate(null);
    setFieldErrors((current) => ({ ...current, licenseFileId: "" }));
    try {
      validateUploadFile(file, {
        allowedTypes: ACCEPTED_LICENSE_TYPES,
        maxSizeBytes: MAX_LICENSE_SIZE_BYTES,
        typeMessage: "营业执照仅支持 JPG 或 PNG",
        sizeMessage: "营业执照图片不能超过 5MB",
      });
      const uploaded = await uploadDirectToCos(file, {
        scene: "supplier_business_license",
        initFallbackMessage: "初始化营业执照上传失败",
        completeFallbackMessage: "登记营业执照上传结果失败",
        missingStorageMessage: "营业执照上传成功但未返回文件 ID",
      });
      if (!uploaded.fileId) throw new Error("营业执照上传成功但未返回文件 ID");

      const recognition = await recognizeSupplierLicense(uploaded.fileId);
      const patch = mapBusinessLicenseOcrFields(recognition.fields);
      patchForm({
        licenseFileId: uploaded.fileId,
        ocrRecognitionId: recognition.id,
        name: patch.name || form.name,
        legalName: patch.legalName || form.legalName,
        creditCode: patch.creditCode || form.creditCode,
        legalRepresentativeName: patch.legalRepresentativeName ||
          form.legalRepresentativeName,
        registeredAddressText: patch.registeredAddressText ||
          form.registeredAddressText,
        licenseValidFrom: patch.licenseValidFrom || form.licenseValidFrom,
        licenseValidUntil: patch.licenseValidUntil || form.licenseValidUntil,
      });
      setLicenseName(file.name);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(file));
      setWarnings(recognition.warnings);
      if (patch.creditCode) await runIdentityCheck(patch.creditCode);
      toast.success("营业执照已识别，请核对后提交");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "营业执照识别失败");
    } finally {
      setUploading(false);
    }
  }

  async function runIdentityCheck(value = form.creditCode) {
    const code = normalizeCreditCode(value);
    if (!code || code.length !== 18) {
      setDuplicate(null);
      return;
    }
    try {
      const result = await checkSupplierIdentity(code);
      setDuplicate(result.exists ? result : null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "供应商查重失败");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors = validateSupplierOnboardingForm(form, duplicate);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      await requestBackendJson("/platform/suppliers/onboarding", {
        method: "POST",
        headers: {
          "Idempotency-Key": newIdempotencyKey("supplier-onboarding"),
        },
        body: JSON.stringify(buildSupplierOnboardingPayload(form)),
        fallbackMessage: "新增供应商准入失败",
      });
      toast.success("供应商已创建，营业执照资质已生成");
      setOpen(false);
      reset();
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "新增供应商准入失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      if (!nextOpen && (uploading || submitting)) return;
      if (!nextOpen) reset();
      setOpen(nextOpen);
    }}>
      <DialogTrigger asChild>
        <Button type="button" size="sm">
          <UploadCloud data-icon="inline-start" />
          新增供应商
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[88vh] flex-col overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>新增供应商准入</DialogTitle>
          <DialogDescription>
            先上传营业执照识别主体信息，再核对资料并补充主要联系人。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <FieldGroup>
              <LicenseUploadField
                licenseName={licenseName}
                previewUrl={previewUrl}
                uploaded={Boolean(form.licenseFileId)}
                uploading={uploading}
                submitting={submitting}
                error={fieldErrors.licenseFileId}
                onUpload={handleLicenseUpload}
              />
              <RecognitionWarnings warnings={warnings} />
              <DuplicateWarning duplicate={duplicate} />
              <SupplierIdentityFields
                form={form}
                errors={fieldErrors}
                patchForm={patchForm}
                runIdentityCheck={runIdentityCheck}
              />
              <Field>
                <FieldLabel htmlFor="supplier-onboarding-address">
                  注册地址
                </FieldLabel>
                <Textarea
                  id="supplier-onboarding-address"
                  value={form.registeredAddressText}
                  maxLength={300}
                  rows={3}
                  onChange={(event) =>
                    patchForm({ registeredAddressText: event.target.value })
                  }
                />
              </Field>
              <PrimaryContactFields
                form={form}
                errors={fieldErrors}
                patchForm={patchForm}
              />
            </FieldGroup>
          </div>
          <DialogFooter className="mt-5">
            <Button
              type="button"
              variant="outline"
              disabled={uploading || submitting}
              onClick={() => setOpen(false)}
            >
              取消
            </Button>
            <Button
              type="submit"
              disabled={uploading || submitting || Boolean(duplicate)}
            >
              {submitting ? "正在创建" : "创建供应商"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LicenseUploadField({
  licenseName,
  previewUrl,
  uploaded,
  uploading,
  submitting,
  error,
  onUpload,
}: {
  licenseName: string;
  previewUrl: string;
  uploaded: boolean;
  uploading: boolean;
  submitting: boolean;
  error?: string;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor="supplier-license-file">营业执照</FieldLabel>
      <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/20 p-3">
        <Input
          id="supplier-license-file"
          className="sr-only !size-px"
          type="file"
          accept="image/jpeg,image/png"
          disabled={uploading || submitting}
          onChange={onUpload}
        />
        <Button
          type="button"
          variant="outline"
          disabled={uploading || submitting}
          onClick={() => document.getElementById("supplier-license-file")?.click()}
        >
          {uploading ? (
            <Loader2 className="animate-spin" data-icon="inline-start" />
          ) : (
            <UploadCloud data-icon="inline-start" />
          )}
          {uploading ? "正在识别" : "上传并识别"}
        </Button>
        <div className="min-w-0 flex-1 text-sm">
          <div className="truncate">{licenseName || "支持 JPG/PNG，最大 5MB"}</div>
          <div className="text-xs text-muted-foreground">
            OCR 结果仅用于回填，提交前仍需人工核对。
          </div>
        </div>
        {uploaded ? (
          <Badge variant="success">
            <CheckCircle2 aria-hidden="true" />
            已上传
          </Badge>
        ) : null}
      </div>
      {previewUrl ? (
        <img
          src={previewUrl}
          alt="营业执照预览"
          className="max-h-48 rounded-md border object-contain"
        />
      ) : null}
      <FieldError>{error}</FieldError>
    </Field>
  );
}

function RecognitionWarnings({ warnings }: { warnings: readonly OcrWarning[] }) {
  if (warnings.length === 0) return null;
  return (
    <Alert>
      <AlertCircle aria-hidden="true" />
      <AlertTitle>识别结果需要核对</AlertTitle>
      <AlertDescription className="flex flex-col gap-1">
        {warnings.map((warning) => (
          <p key={warning.code}>{warning.message}</p>
        ))}
      </AlertDescription>
    </Alert>
  );
}

function DuplicateWarning({
  duplicate,
}: {
  duplicate: IdentityCheckResult | null;
}) {
  if (!duplicate?.supplier) return null;
  return (
    <Alert variant="destructive">
      <AlertCircle aria-hidden="true" />
      <AlertTitle>统一社会信用代码已存在</AlertTitle>
      <AlertDescription>
        已匹配供应商 {duplicate.supplier.name}（{duplicate.supplier.code}），
        请核对后更换证照或打开现有供应商。
      </AlertDescription>
    </Alert>
  );
}

function SupplierIdentityFields({
  form,
  errors,
  patchForm,
  runIdentityCheck,
}: {
  form: OnboardingFormState;
  errors: Record<string, string>;
  patchForm: (patch: Partial<OnboardingFormState>) => void;
  runIdentityCheck: () => void;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <SupplierOnboardingTextField
        id="supplier-onboarding-name"
        label="供应商名称"
        value={form.name}
        error={errors.name}
        maxLength={120}
        onChange={(value) => patchForm({ name: value })}
      />
      <Field>
        <FieldLabel htmlFor="supplier-onboarding-type">供应商类型</FieldLabel>
        <Select
          value={form.supplierType}
          onValueChange={(value) =>
            patchForm({ supplierType: value as SupplierType })
          }
        >
          <SelectTrigger id="supplier-onboarding-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {supplierTypeOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      <SupplierOnboardingTextField
        id="supplier-onboarding-legal-name"
        label="法定名称"
        value={form.legalName}
        error={errors.legalName}
        maxLength={160}
        onChange={(value) => patchForm({ legalName: value })}
      />
      <SupplierOnboardingTextField
        id="supplier-onboarding-credit-code"
        label="统一社会信用代码"
        value={form.creditCode}
        error={errors.creditCode}
        maxLength={18}
        onBlur={() => runIdentityCheck()}
        onChange={(value) => patchForm({ creditCode: normalizeCreditCode(value) })}
      />
      <SupplierOnboardingTextField
        id="supplier-onboarding-legal-person"
        label="法定代表人"
        value={form.legalRepresentativeName}
        maxLength={80}
        onChange={(value) => patchForm({ legalRepresentativeName: value })}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <SupplierOnboardingTextField
          id="supplier-license-valid-from"
          label="营业期限开始"
          type="date"
          value={form.licenseValidFrom}
          onChange={(value) => patchForm({ licenseValidFrom: value })}
        />
        <SupplierOnboardingTextField
          id="supplier-license-valid-until"
          label="营业期限结束"
          type="date"
          value={form.licenseValidUntil}
          onChange={(value) => patchForm({ licenseValidUntil: value })}
        />
      </div>
    </div>
  );
}

function PrimaryContactFields({
  form,
  errors,
  patchForm,
}: {
  form: OnboardingFormState;
  errors: Record<string, string>;
  patchForm: (patch: Partial<OnboardingFormState>) => void;
}) {
  return (
    <FieldGroup className="rounded-md border bg-muted/20 p-3">
      <div>
        <h3 className="text-sm font-medium">主要联系人</h3>
        <p className="text-xs text-muted-foreground">
          创建后作为供应商首个主联系人，便于平台和装修公司沟通。
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <SupplierOnboardingTextField
          id="supplier-contact-name"
          label="联系人姓名"
          value={form.contactName}
          error={errors.contactName}
          maxLength={80}
          onChange={(value) => patchForm({ contactName: value })}
        />
        <SupplierOnboardingTextField
          id="supplier-contact-phone"
          label="联系方式"
          value={form.contactPhone}
          error={errors.contactPhone}
          maxLength={40}
          onChange={(value) => patchForm({ contactPhone: value })}
        />
        <SupplierOnboardingTextField
          id="supplier-contact-email"
          label="联系邮箱"
          type="email"
          value={form.contactEmail}
          maxLength={120}
          onChange={(value) => patchForm({ contactEmail: value })}
        />
      </div>
    </FieldGroup>
  );
}
