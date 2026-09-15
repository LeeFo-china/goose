import { describe, expect, test } from "bun:test";

import {
  hasUnsavedProfileChanges,
  reconcileProfileFormAfterRefresh,
  toProfilePatch,
  toProfileForm,
} from "./service-provider-profile-form";
import type { ServiceProviderProfile } from "./service-provider-types";

const profile: ServiceProviderProfile = {
  id: "profile-id",
  tenant_id: "tenant-id",
  public_name: "示例服务商",
  public_phone: "13800000000",
  introduction: "公司介绍",
  address_province: "四川省",
  address_city: "成都市",
  address_district: "锦江区",
  address_region_code: "510104",
  address: "示例地址",
  address_latitude: 30.6,
  address_longitude: 104.1,
  status: "draft",
  version: 3,
  submitted_at: null,
  reviewed_by_employee_id: null,
  reviewed_at: null,
  review_remark: null,
  published_at: null,
  suspended_at: null,
  created_at: "2026-09-15T00:00:00Z",
  updated_at: "2026-09-15T00:00:00Z",
};

describe("service provider profile edit state", () => {
  test("recognizes edits that must be saved before review submission", () => {
    const form = toProfileForm(profile);

    expect(hasUnsavedProfileChanges(form, profile)).toBe(false);
    expect(hasUnsavedProfileChanges({ ...form, public_name: "更新名称" }, profile)).toBe(true);
    expect(hasUnsavedProfileChanges({ ...form, address_latitude: "31.1" }, profile)).toBe(true);
  });

  test("ignores whitespace that the save request trims", () => {
    const form = toProfileForm(profile);

    expect(hasUnsavedProfileChanges({ ...form, introduction: " 公司介绍 " }, profile)).toBe(false);
  });

  test("sends only edited fields so introduction edits do not restart publication review", () => {
    const form = toProfileForm(profile);

    expect(toProfilePatch({ ...form, introduction: "更新介绍" }, { ...profile, status: "published" })).toEqual({
      version: 3,
      introduction: "更新介绍",
    });
    expect(toProfilePatch({ ...form, public_phone: "" }, profile)).toEqual({
      version: 3,
      public_phone: null,
    });
  });

  test("loads refreshed values unless the current form has unsaved edits", () => {
    const nextProfile = { ...profile, public_name: "服务端新名称", version: 4 };
    const cleanForm = toProfileForm(profile);
    const editedForm = { ...cleanForm, introduction: "本地新介绍" };

    expect(reconcileProfileFormAfterRefresh(cleanForm, profile, nextProfile)).toEqual(toProfileForm(nextProfile));
    expect(reconcileProfileFormAfterRefresh(editedForm, profile, nextProfile)).toEqual(editedForm);
  });
});
