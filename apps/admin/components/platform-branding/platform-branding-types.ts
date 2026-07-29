export type PlatformBrandProfileStatus = "draft" | "published" | "disabled";

export interface PlatformBrandProfile {
  display_name: string;
  logo_file_id: string;
  logo_url: string | null;
  status: PlatformBrandProfileStatus;
  version: number;
  published_version: number | null;
  has_unpublished_changes: boolean;
  published_at: string | null;
  updated_at: string;
}

export interface EffectiveBranding {
  source: "platform" | "tenant";
  tenant_id: string | null;
  display_name: string;
  logo_url: string;
  support_text: string;
  version: number;
  updated_at: string;
}

export interface PlatformBrandingResult {
  profile: PlatformBrandProfile | null;
  effective: EffectiveBranding;
}

export interface PlatformBrandingFormValues {
  displayName: string;
  logoFileId: string;
  logoUrl: string;
}

export interface PlatformBrandingDraftPayload {
  display_name: string;
  logo_file_id: string;
  version: number;
}

export interface PlatformBrandingStatus {
  label: "未配置" | "待保存" | "草稿" | "待发布" | "已发布";
  variant: "secondary" | "warning" | "success";
}
