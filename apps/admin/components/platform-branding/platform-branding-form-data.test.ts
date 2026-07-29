import { describe, expect, test } from "bun:test";
import {
  buildPlatformBrandingDraft,
  canPublishPlatformBranding,
  createPlatformBrandingFormValues,
  getPlatformBrandingStatus,
  hasPlatformBrandingFormChanges,
  PlatformBrandingFormValidationError,
} from "./platform-branding-form-data";
import type {
  EffectiveBranding,
  PlatformBrandProfile,
  PlatformBrandingFormValues,
} from "./platform-branding-types";

const FILE_ID = "11111111-1111-4111-8111-111111111111";

const effective: EffectiveBranding = {
  source: "platform",
  tenant_id: null,
  display_name: "Gooes",
  logo_url: "https://example.com/effective-logo.png",
  support_text: "Gooes",
  version: 3,
  updated_at: "2026-07-29T10:00:00.000Z",
};

const profile: PlatformBrandProfile = {
  display_name: "Gooes",
  logo_file_id: FILE_ID,
  logo_url: "https://example.com/draft-logo.png",
  status: "published",
  version: 4,
  published_version: 3,
  has_unpublished_changes: true,
  published_at: "2026-07-29T09:00:00.000Z",
  updated_at: "2026-07-29T10:00:00.000Z",
};

describe("platform branding form data", () => {
  test("uses effective branding as a first-config preview without reusing its file id", () => {
    expect(createPlatformBrandingFormValues(null, effective)).toEqual({
      displayName: "Gooes",
      logoFileId: "",
      logoUrl: "https://example.com/effective-logo.png",
    });
  });

  test("uses the existing draft as the editable baseline", () => {
    expect(createPlatformBrandingFormValues(profile, effective)).toEqual({
      displayName: "Gooes",
      logoFileId: FILE_ID,
      logoUrl: "https://example.com/draft-logo.png",
    });
  });

  test("builds a trimmed draft with version zero for first configuration", () => {
    expect(
      buildPlatformBrandingDraft(null, {
        displayName: "  Gooes 平台  ",
        logoFileId: FILE_ID,
        logoUrl: "blob:preview",
      }),
    ).toEqual({
      display_name: "Gooes 平台",
      logo_file_id: FILE_ID,
      version: 0,
    });
  });

  test("uses Unicode code points for the two-to-forty character name limit", () => {
    const validName = `品牌${"😀".repeat(38)}`;
    expect(
      buildPlatformBrandingDraft(profile, {
        displayName: validName,
        logoFileId: FILE_ID,
        logoUrl: profile.logo_url || "",
      }).display_name,
    ).toBe(validName);

    for (const [displayName, message] of [
      ["品", "平台品牌名称不能少于 2 个字符"],
      [`品牌${"😀".repeat(39)}`, "平台品牌名称不能超过 40 个字符"],
    ] as const) {
      expect(() =>
        buildPlatformBrandingDraft(profile, {
          displayName,
          logoFileId: FILE_ID,
          logoUrl: profile.logo_url || "",
        })
      ).toThrow(message);
    }
  });

  test("requires a trusted uploaded logo file id", () => {
    try {
      buildPlatformBrandingDraft(null, {
        displayName: "Gooes",
        logoFileId: "",
        logoUrl: effective.logo_url,
      });
      throw new Error("expected validation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(PlatformBrandingFormValidationError);
      expect((error as PlatformBrandingFormValidationError).field).toBe(
        "logo",
      );
      expect((error as Error).message).toBe("请上传平台品牌 Logo");
    }
  });

  test("detects unsaved edits without treating an unchanged baseline as dirty", () => {
    const baseline = createPlatformBrandingFormValues(profile, effective);
    expect(hasPlatformBrandingFormChanges(baseline, baseline)).toBe(false);
    expect(
      hasPlatformBrandingFormChanges(baseline, {
        ...baseline,
        displayName: "新平台品牌",
      }),
    ).toBe(true);
  });

  test("publishes only a complete saved profile with unpublished changes", () => {
    const baseline = createPlatformBrandingFormValues(profile, effective);
    expect(canPublishPlatformBranding(profile, baseline, baseline)).toBe(true);
    expect(
      canPublishPlatformBranding(profile, baseline, {
        ...baseline,
        displayName: "未保存名称",
      }),
    ).toBe(false);
    expect(
      canPublishPlatformBranding(
        { ...profile, has_unpublished_changes: false },
        baseline,
        baseline,
      ),
    ).toBe(false);
    expect(canPublishPlatformBranding(null, baseline, baseline)).toBe(false);
  });

  test("derives explicit statuses for unsaved, unpublished, published, and empty states", () => {
    const baseline = createPlatformBrandingFormValues(profile, effective);
    const edited: PlatformBrandingFormValues = {
      ...baseline,
      displayName: "未保存名称",
    };

    expect(getPlatformBrandingStatus(profile, baseline, edited)).toEqual({
      label: "待保存",
      variant: "warning",
    });
    expect(getPlatformBrandingStatus(profile, baseline, baseline)).toEqual({
      label: "待发布",
      variant: "warning",
    });
    expect(
      getPlatformBrandingStatus(
        { ...profile, has_unpublished_changes: false },
        baseline,
        baseline,
      ),
    ).toEqual({
      label: "已发布",
      variant: "success",
    });
    expect(getPlatformBrandingStatus(null, baseline, baseline)).toEqual({
      label: "未配置",
      variant: "secondary",
    });
  });
});
