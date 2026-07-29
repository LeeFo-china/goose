"use client";

import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { RefreshCw, Save, Upload, UploadCloud } from "lucide-react";
import { useRouter } from "next/navigation";

import { StatusAlert } from "@/components/admin/status-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { requestBackendJson } from "@/lib/backend-client";
import {
  uploadDirectToCos,
  validateUploadFile,
} from "@/lib/cos-direct-upload";
import {
  buildPlatformBrandingDraft,
  canPublishPlatformBranding,
  createPlatformBrandingFormValues,
  getPlatformBrandingStatus,
  hasPlatformBrandingFormChanges,
  PlatformBrandingFormValidationError,
  type PlatformBrandingFormField,
} from "./platform-branding-form-data";
import { PlatformBrandingPreview } from "./platform-branding-preview";
import type {
  PlatformBrandingFormValues,
  PlatformBrandingResult,
} from "./platform-branding-types";

const BRANDING_PROFILE_VERSION_CONFLICT =
  "BRANDING_PROFILE_VERSION_CONFLICT";
const LOGO_ALLOWED_TYPES = new Set(["image/jpeg", "image/png"]);
const LOGO_MAX_SIZE_BYTES = 2 * 1024 * 1024;

type PendingAction = "upload" | "save" | "publish" | null;

function formatDate(value: string | null) {
  if (!value) return "尚未发布";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("zh-CN");
}

export function PlatformBrandingForm({
  initialBranding,
}: {
  initialBranding: PlatformBrandingResult;
}) {
  const router = useRouter();
  const initialValues = createPlatformBrandingFormValues(
    initialBranding.profile,
    initialBranding.effective,
  );
  const [profile, setProfile] = useState(initialBranding.profile);
  const [effective, setEffective] = useState(initialBranding.effective);
  const [baseline, setBaseline] = useState(initialValues);
  const [values, setValues] = useState(initialValues);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<PlatformBrandingFormField, string>>
  >({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [hasVersionConflict, setHasVersionConflict] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const localPreviewUrlRef = useRef("");

  useEffect(() => {
    return () => {
      if (localPreviewUrlRef.current) {
        URL.revokeObjectURL(localPreviewUrlRef.current);
      }
    };
  }, []);

  const hasUnsavedChanges = hasPlatformBrandingFormChanges(baseline, values);
  const canPublish = canPublishPlatformBranding(profile, baseline, values);
  const status = getPlatformBrandingStatus(profile, baseline, values);
  const isPending = pendingAction !== null;

  function clearFeedback() {
    setError("");
    setSuccess("");
    setHasVersionConflict(false);
  }

  function editValues(patch: Partial<PlatformBrandingFormValues>) {
    setValues((current) => ({ ...current, ...patch }));
    setFieldErrors({});
    clearFeedback();
  }

  function applyBrandingResult(
    result: PlatformBrandingResult,
    message: string,
  ) {
    const nextValues = createPlatformBrandingFormValues(
      result.profile,
      result.effective,
    );
    if (localPreviewUrlRef.current) {
      URL.revokeObjectURL(localPreviewUrlRef.current);
      localPreviewUrlRef.current = "";
    }
    setProfile(result.profile);
    setEffective(result.effective);
    setBaseline(nextValues);
    setValues(nextValues);
    setFieldErrors({});
    setError("");
    setHasVersionConflict(false);
    setSuccess(message);
  }

  function handleRequestError(requestError: unknown, fallback: string) {
    const code = requestError && typeof requestError === "object" &&
        "code" in requestError
      ? requestError.code
      : null;
    if (code === BRANDING_PROFILE_VERSION_CONFLICT) {
      setHasVersionConflict(true);
      setError("平台品牌资料已被其他管理员修改，请重新加载后再操作。");
      return;
    }
    setError(
      requestError instanceof Error ? requestError.message : fallback,
    );
  }

  async function handleLogoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    clearFeedback();
    setFieldErrors((current) => ({ ...current, logo: undefined }));
    setPendingAction("upload");
    try {
      validateUploadFile(file, {
        allowedTypes: LOGO_ALLOWED_TYPES,
        maxSizeBytes: LOGO_MAX_SIZE_BYTES,
        typeMessage: "平台品牌 Logo 仅支持 JPEG 或 PNG",
        sizeMessage: "平台品牌 Logo 不能超过 2MB",
      });
      const uploaded = await uploadDirectToCos(file, {
        scene: "brand_logo",
        uploadErrorLabel: "平台品牌 Logo",
        missingStorageMessage: "Logo 上传成功但未返回文件信息",
      });
      if (!uploaded.fileId) {
        throw new Error("Logo 上传成功但未返回文件 ID");
      }

      if (localPreviewUrlRef.current) {
        URL.revokeObjectURL(localPreviewUrlRef.current);
      }
      const localPreviewUrl = URL.createObjectURL(file);
      localPreviewUrlRef.current = localPreviewUrl;
      editValues({
        logoFileId: uploaded.fileId,
        logoUrl: localPreviewUrl,
      });
    } catch (uploadError) {
      setFieldErrors((current) => ({
        ...current,
        logo: uploadError instanceof Error
          ? uploadError.message
          : "平台品牌 Logo 上传失败",
      }));
    } finally {
      setPendingAction(null);
    }
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearFeedback();
    setFieldErrors({});

    let payload;
    try {
      payload = buildPlatformBrandingDraft(profile, values);
    } catch (validationError) {
      if (validationError instanceof PlatformBrandingFormValidationError) {
        setFieldErrors({
          [validationError.field]: validationError.message,
        });
        return;
      }
      setError("请检查平台品牌资料");
      return;
    }

    setPendingAction("save");
    try {
      const result = await requestBackendJson<PlatformBrandingResult>(
        "/platform/branding",
        {
          method: "PATCH",
          body: JSON.stringify(payload),
          fallbackMessage: "平台品牌草稿保存失败",
        },
      );
      applyBrandingResult(result, "平台品牌草稿已保存，发布后才会影响线上展示。");
    } catch (requestError) {
      handleRequestError(requestError, "平台品牌草稿保存失败");
    } finally {
      setPendingAction(null);
    }
  }

  async function handlePublish() {
    clearFeedback();
    if (hasUnsavedChanges) {
      setError("请先保存当前修改，再发布平台品牌。");
      return;
    }
    if (!profile || !canPublish) return;

    setPendingAction("publish");
    try {
      const result = await requestBackendJson<PlatformBrandingResult>(
        "/platform/branding/publish",
        {
          method: "POST",
          body: JSON.stringify({ version: profile.version }),
          fallbackMessage: "平台品牌发布失败",
        },
      );
      applyBrandingResult(result, "平台品牌已发布并开始作为默认品牌生效。");
    } catch (requestError) {
      handleRequestError(requestError, "平台品牌发布失败");
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <form onSubmit={handleSave} className="flex min-h-0 flex-1 flex-col">
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-none">
        <CardHeader className="shrink-0 flex-row items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1.5">
            <CardTitle>默认品牌资料</CardTitle>
            <CardDescription>
              草稿保存后仍需发布；租户自定义品牌有效时会优先展示租户品牌。
            </CardDescription>
          </div>
          <Badge variant={status.variant}>{status.label}</Badge>
        </CardHeader>

        <CardContent className="min-h-0 flex-1 overflow-auto">
          <div className="flex flex-col gap-5">
            <dl className="grid gap-3 rounded-lg border bg-muted/20 p-4 text-sm sm:grid-cols-3">
              <div className="flex min-w-0 flex-col gap-1">
                <dt className="text-xs text-muted-foreground">草稿版本</dt>
                <dd className="font-medium tabular-nums">
                  {profile?.version ?? 0}
                </dd>
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                <dt className="text-xs text-muted-foreground">已发布版本</dt>
                <dd className="font-medium tabular-nums">
                  {profile?.published_version ?? "-"}
                </dd>
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                <dt className="text-xs text-muted-foreground">最近发布时间</dt>
                <dd className="truncate font-medium tabular-nums">
                  {formatDate(profile?.published_at ?? null)}
                </dd>
              </div>
            </dl>

            {error ? (
              <StatusAlert
                title={hasVersionConflict ? "配置版本冲突" : "操作失败"}
              >
                {error}
              </StatusAlert>
            ) : null}
            {success ? (
              <StatusAlert tone="success" title="操作成功">
                {success}
              </StatusAlert>
            ) : null}

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(19rem,0.8fr)]">
              <FieldGroup>
                <Field data-invalid={Boolean(fieldErrors.displayName)}>
                  <FieldLabel htmlFor="platform-branding-display-name">
                    平台品牌名称
                  </FieldLabel>
                  <Input
                    id="platform-branding-display-name"
                    value={values.displayName}
                    onChange={(event) =>
                      editValues({ displayName: event.target.value })}
                    maxLength={80}
                    disabled={isPending}
                    aria-invalid={Boolean(fieldErrors.displayName)}
                    required
                  />
                  <FieldDescription>
                    2–40 个字符，客户端会原样展示这段文本。
                  </FieldDescription>
                  <FieldError>{fieldErrors.displayName}</FieldError>
                </Field>

                <Field data-invalid={Boolean(fieldErrors.logo)}>
                  <FieldLabel htmlFor="platform-branding-logo">
                    平台品牌 Logo
                  </FieldLabel>
                  <input
                    ref={fileInputRef}
                    id="platform-branding-logo"
                    type="file"
                    accept="image/jpeg,image/png"
                    className="sr-only"
                    disabled={isPending}
                    onChange={handleLogoChange}
                  />
                  <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-background p-4">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isPending}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {pendingAction === "upload" ? (
                        <Spinner data-icon="inline-start" />
                      ) : (
                        <Upload data-icon="inline-start" />
                      )}
                      {pendingAction === "upload"
                        ? "上传中"
                        : values.logoFileId
                          ? "替换 Logo"
                          : "上传 Logo"}
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      JPEG 或 PNG，最大 2MB，建议使用方形图片。
                    </span>
                  </div>
                  <FieldDescription>
                    {values.logoFileId
                      ? hasUnsavedChanges
                        ? "新 Logo 已上传，保存草稿后纳入品牌资料。"
                        : "当前 Logo 已保存到平台品牌资料。"
                      : "首次配置必须重新上传可信 Logo 文件。"}
                  </FieldDescription>
                  <FieldError>{fieldErrors.logo}</FieldError>
                </Field>
              </FieldGroup>

              <PlatformBrandingPreview
                values={values}
                effective={effective}
              />
            </div>
          </div>
        </CardContent>

        <CardFooter className="shrink-0 flex-wrap justify-end gap-2 border-t pt-5">
          {hasVersionConflict ? (
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => router.refresh()}
            >
              <RefreshCw data-icon="inline-start" />
              重新加载
            </Button>
          ) : null}
          <Button type="button" variant="outline" disabled={!canPublish || isPending} onClick={handlePublish}>
            {pendingAction === "publish" ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <UploadCloud data-icon="inline-start" />
            )}
            {pendingAction === "publish" ? "发布中" : "发布品牌"}
          </Button>
          <Button type="submit" disabled={!hasUnsavedChanges || isPending}>
            {pendingAction === "save" ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <Save data-icon="inline-start" />
            )}
            {pendingAction === "save" ? "保存中" : "保存草稿"}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
