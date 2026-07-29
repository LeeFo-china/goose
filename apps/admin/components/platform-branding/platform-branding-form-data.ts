import type {
  EffectiveBranding,
  PlatformBrandProfile,
  PlatformBrandingDraftPayload,
  PlatformBrandingFormValues,
  PlatformBrandingStatus,
} from "./platform-branding-types";

export type PlatformBrandingFormField = "displayName" | "logo";

export class PlatformBrandingFormValidationError extends Error {
  constructor(
    readonly field: PlatformBrandingFormField,
    message: string,
  ) {
    super(message);
    this.name = "PlatformBrandingFormValidationError";
  }
}

export function createPlatformBrandingFormValues(
  profile: PlatformBrandProfile | null,
  effective: EffectiveBranding,
): PlatformBrandingFormValues {
  if (profile) {
    return {
      displayName: profile.display_name,
      logoFileId: profile.logo_file_id,
      logoUrl: profile.logo_url || effective.logo_url,
    };
  }

  return {
    displayName: effective.display_name,
    logoFileId: "",
    logoUrl: effective.logo_url,
  };
}

export function buildPlatformBrandingDraft(
  profile: PlatformBrandProfile | null,
  values: PlatformBrandingFormValues,
): PlatformBrandingDraftPayload {
  const displayName = values.displayName.trim();
  const displayNameLength = Array.from(displayName).length;
  if (displayNameLength < 2) {
    throw new PlatformBrandingFormValidationError(
      "displayName",
      "平台品牌名称不能少于 2 个字符",
    );
  }
  if (displayNameLength > 40) {
    throw new PlatformBrandingFormValidationError(
      "displayName",
      "平台品牌名称不能超过 40 个字符",
    );
  }

  const logoFileId = values.logoFileId.trim();
  if (!logoFileId) {
    throw new PlatformBrandingFormValidationError(
      "logo",
      "请上传平台品牌 Logo",
    );
  }

  return {
    display_name: displayName,
    logo_file_id: logoFileId,
    version: profile?.version ?? 0,
  };
}

export function hasPlatformBrandingFormChanges(
  baseline: PlatformBrandingFormValues,
  values: PlatformBrandingFormValues,
) {
  return baseline.displayName !== values.displayName ||
    baseline.logoFileId !== values.logoFileId;
}

export function canPublishPlatformBranding(
  profile: PlatformBrandProfile | null,
  baseline: PlatformBrandingFormValues,
  values: PlatformBrandingFormValues,
) {
  return Boolean(
    profile?.display_name.trim() &&
      profile.logo_file_id &&
      profile.has_unpublished_changes &&
      !hasPlatformBrandingFormChanges(baseline, values),
  );
}

export function getPlatformBrandingStatus(
  profile: PlatformBrandProfile | null,
  baseline: PlatformBrandingFormValues,
  values: PlatformBrandingFormValues,
): PlatformBrandingStatus {
  if (hasPlatformBrandingFormChanges(baseline, values)) {
    return { label: "待保存", variant: "warning" };
  }
  if (!profile) {
    return { label: "未配置", variant: "secondary" };
  }
  if (profile.has_unpublished_changes) {
    return { label: "待发布", variant: "warning" };
  }
  if (profile.status === "published") {
    return { label: "已发布", variant: "success" };
  }
  return { label: "草稿", variant: "secondary" };
}
