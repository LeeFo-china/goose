import type { ProfilePatch } from "./service-provider-actions";
import type { ServiceProviderProfile } from "./service-provider-types";

export type ProfileForm = {
  public_name: string;
  public_phone: string;
  introduction: string;
  address_province: string;
  address_city: string;
  address_district: string;
  address_region_code: string;
  address: string;
  address_latitude: string;
  address_longitude: string;
};

const emptyProfileForm: ProfileForm = {
  public_name: "",
  public_phone: "",
  introduction: "",
  address_province: "",
  address_city: "",
  address_district: "",
  address_region_code: "",
  address: "",
  address_latitude: "",
  address_longitude: "",
};

export function toProfileForm(profile: ServiceProviderProfile | null): ProfileForm {
  if (!profile) return emptyProfileForm;
  return {
    public_name: profile.public_name || "",
    public_phone: profile.public_phone || "",
    introduction: profile.introduction || "",
    address_province: profile.address_province || "",
    address_city: profile.address_city || "",
    address_district: profile.address_district || "",
    address_region_code: profile.address_region_code || "",
    address: profile.address || "",
    address_latitude: profile.address_latitude == null ? "" : String(profile.address_latitude),
    address_longitude: profile.address_longitude == null ? "" : String(profile.address_longitude),
  };
}

function nullableText(value: string) {
  const trimmed = value.trim();
  return trimmed || null;
}

function nullableNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const next = Number(trimmed);
  return Number.isFinite(next) ? next : null;
}

export function toProfilePatch(form: ProfileForm, profile: ServiceProviderProfile): ProfilePatch {
  const patch: ProfilePatch = { version: profile.version };
  if (nullableText(form.public_name) !== profile.public_name) patch.public_name = nullableText(form.public_name);
  if (nullableText(form.public_phone) !== profile.public_phone) patch.public_phone = nullableText(form.public_phone);
  if (nullableText(form.introduction) !== profile.introduction) patch.introduction = nullableText(form.introduction);
  if (nullableText(form.address_province) !== profile.address_province) patch.address_province = nullableText(form.address_province);
  if (nullableText(form.address_city) !== profile.address_city) patch.address_city = nullableText(form.address_city);
  if (nullableText(form.address_district) !== profile.address_district) patch.address_district = nullableText(form.address_district);
  if (nullableText(form.address_region_code) !== profile.address_region_code) patch.address_region_code = nullableText(form.address_region_code);
  if (nullableText(form.address) !== profile.address) patch.address = nullableText(form.address);
  if (nullableNumber(form.address_latitude) !== profile.address_latitude) patch.address_latitude = nullableNumber(form.address_latitude);
  if (nullableNumber(form.address_longitude) !== profile.address_longitude) patch.address_longitude = nullableNumber(form.address_longitude);
  return patch;
}

export function hasUnsavedProfileChanges(form: ProfileForm, profile: ServiceProviderProfile): boolean {
  return Object.keys(toProfilePatch(form, profile)).length > 1;
}

export function reconcileProfileFormAfterRefresh(
  form: ProfileForm,
  previousProfile: ServiceProviderProfile | null,
  nextProfile: ServiceProviderProfile,
): ProfileForm {
  return previousProfile && hasUnsavedProfileChanges(form, previousProfile)
    ? form
    : toProfileForm(nextProfile);
}
