"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, Save, Send } from "lucide-react";

import { StatusAlert } from "@/components/admin/status-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  ServiceProviderAddressMap,
  ServiceProviderAddressPicker,
  type ServiceProviderAddressValue,
} from "./service-provider-address-picker";
import { ServiceProviderAreaSection } from "./service-provider-area-section";
import {
  ServiceProviderRegionPicker,
  type ServiceProviderRegionValue,
} from "./service-provider-region-picker";
import {
  fetchServiceProviderAreas,
  fetchServiceProviderProfile,
  submitServiceProviderProfile,
  updateServiceProviderProfile,
} from "./service-provider-actions";
import {
  profileStatusMeta,
  type ListData,
  type ServiceProviderArea,
  type ServiceProviderMutationResult,
  type ServiceProviderProfile,
} from "./service-provider-types";

type ProfileForm = {
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

type RequestError = Error & { code?: string; status?: number };

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

function toProfileForm(profile: ServiceProviderProfile | null): ProfileForm {
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
  return trimmed ? trimmed : null;
}

function nullableNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const next = Number(trimmed);
  return Number.isFinite(next) ? next : null;
}

function toRequestError(error: unknown, fallback: string): RequestError {
  return error instanceof Error ? error as RequestError : new Error(fallback) as RequestError;
}

function isConflict(error: RequestError | null) {
  return error?.status === 409 || error?.code === "SERVICE_PROVIDER_STATE_CONFLICT";
}

export function ServiceProviderWorkspace({
  profile,
  areas,
  canRead,
  canManage,
  loadError,
}: {
  profile: ServiceProviderProfile | null;
  areas: ListData<ServiceProviderArea>;
  canRead: boolean;
  canManage: boolean;
  loadError?: string | null;
}) {
  const router = useRouter();
  const [currentProfile, setCurrentProfile] = useState(profile);
  const [currentAreas, setCurrentAreas] = useState(areas);
  const [form, setForm] = useState(() => toProfileForm(profile));
  const [areaPage, setAreaPage] = useState(areas.pagination.page || 1);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<RequestError | null>(null);
  const [pending, startTransition] = useTransition();

  const status = currentProfile?.status || "draft";
  const statusMeta = profileStatusMeta[status];
  const version = currentProfile?.version || 0;

  function updateForm(field: keyof ProfileForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function patchForm(patch: Partial<ProfileForm>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  function applyMutation(result: ServiceProviderMutationResult) {
    setCurrentProfile(result.profile);
    setForm(toProfileForm(result.profile));
    const mutatedArea = result.area;
    if (mutatedArea) {
      setCurrentAreas((current) => ({
        ...current,
        list: current.list.some((area) => area.id === mutatedArea.id)
          ? current.list.map((area) => area.id === mutatedArea.id ? mutatedArea : area)
          : [mutatedArea, ...current.list],
      }));
    }
    router.refresh();
  }

  function saveProfile() {
    if (!currentProfile || !canManage || pending) return;
    setError(null);
    setMessage("");
    startTransition(async () => {
      try {
        const result = await updateServiceProviderProfile({
          version,
          public_name: nullableText(form.public_name),
          public_phone: nullableText(form.public_phone),
          introduction: nullableText(form.introduction),
          address_province: nullableText(form.address_province),
          address_city: nullableText(form.address_city),
          address_district: nullableText(form.address_district),
          address_region_code: nullableText(form.address_region_code),
          address: nullableText(form.address),
          address_latitude: nullableNumber(form.address_latitude),
          address_longitude: nullableNumber(form.address_longitude),
        });
        applyMutation(result);
        setMessage("服务商资料已保存，公开展示仍需平台发布审核。");
      } catch (caught) {
        setError(toRequestError(caught, "保存服务商资料失败"));
      }
    });
  }

  function submitReview() {
    if (!currentProfile || !canManage || pending) return;
    setError(null);
    setMessage("");
    startTransition(async () => {
      try {
        const result = await submitServiceProviderProfile(version);
        applyMutation(result);
        setMessage("已提交平台发布审核，平台发布前不会出现在访客结果中。");
      } catch (caught) {
        setError(toRequestError(caught, "提交平台发布审核失败"));
      }
    });
  }

  async function refreshCurrent() {
    setError(null);
    setMessage("");
    try {
      const [nextProfile, nextAreas] = await Promise.all([
        fetchServiceProviderProfile(),
        fetchServiceProviderAreas(areaPage),
      ]);
      setCurrentProfile(nextProfile);
      setCurrentAreas(nextAreas);
      setMessage("已刷新当前版本，未覆盖正在编辑的表单内容。");
      router.refresh();
    } catch (caught) {
      setError(toRequestError(caught, "刷新服务商资料失败"));
    }
  }

  async function loadAreaPage(page: number) {
    setError(null);
    try {
      const next = await fetchServiceProviderAreas(page);
      setCurrentAreas(next);
      setAreaPage(next.pagination.page);
    } catch (caught) {
      setError(toRequestError(caught, "服务区域加载失败"));
    }
  }

  if (!canRead) {
    return (
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle>无权访问服务商资料</CardTitle>
          <CardDescription>当前账号缺少服务商资料查看权限。</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-none">
      <CardHeader className="shrink-0 border-b">
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
            <Badge variant="outline" className="tabular-nums">版本 {version || "-"}</Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={!canManage || pending || !currentProfile} onClick={saveProfile}>
              <Save data-icon="inline-start" />
              保存资料
            </Button>
            <Button type="button" variant="outline" disabled={pending} onClick={() => void refreshCurrent()}>
              <RefreshCw data-icon="inline-start" />
              刷新资料
            </Button>
            <Button type="button" disabled={!canManage || pending || !currentProfile} onClick={submitReview}>
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Send data-icon="inline-start" />}
              提交平台发布审核
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
        <div className="flex flex-col gap-5">
          {loadError ? <StatusAlert>{loadError}</StatusAlert> : null}
          {message ? <StatusAlert tone="success">{message}</StatusAlert> : null}
          {error ? (
            <StatusAlert>
              {error.code ? `${error.message}（${error.code}）` : error.message}
              {isConflict(error) ? (
                <Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => void refreshCurrent()}>
                  <RefreshCw data-icon="inline-start" />
                  刷新后重试
                </Button>
              ) : null}
            </StatusAlert>
          ) : null}
          {!currentProfile ? (
            <StatusAlert>未加载到服务商资料，请确认租户已通过入驻审核。</StatusAlert>
          ) : (
            <>
              <ProfileFormSection
                form={form}
                disabled={!canManage || pending}
                onChange={updateForm}
                onPatch={patchForm}
              />
              <Separator />
              <ServiceProviderAreaSection
                areas={currentAreas}
                profileVersion={version}
                canManage={canManage}
                pending={pending}
                onMutated={applyMutation}
                onError={setError}
                onMessage={setMessage}
                onLoadPage={loadAreaPage}
              />
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ProfileFormSection({
  form,
  disabled,
  onChange,
  onPatch,
}: {
  form: ProfileForm;
  disabled: boolean;
  onChange: (field: keyof ProfileForm, value: string) => void;
  onPatch: (patch: Partial<ProfileForm>) => void;
}) {
  const regionValue: ServiceProviderRegionValue = {
    address_province: form.address_province,
    address_city: form.address_city,
    address_district: form.address_district,
    address_region_code: form.address_region_code,
  };
  const addressValue: ServiceProviderAddressValue = {
    address: form.address,
    address_province: form.address_province,
    address_city: form.address_city,
    address_district: form.address_district,
    address_region_code: form.address_region_code,
    address_latitude: form.address_latitude,
    address_longitude: form.address_longitude,
  };

  return (
    <section className="flex flex-col gap-4" aria-label="服务商公开资料">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(340px,420px)] lg:items-start">
        <FieldGroup className="grid gap-4 md:grid-cols-2">
          <TextField id="service-provider-public-name" label="公开名称" value={form.public_name} disabled={disabled} onChange={(value) => onChange("public_name", value)} />
          <TextField id="service-provider-public-phone" label="公开电话" value={form.public_phone} disabled={disabled} onChange={(value) => onChange("public_phone", value)} />
          <ServiceProviderRegionPicker
            value={regionValue}
            disabled={disabled}
            onChange={onPatch}
          />
          <ServiceProviderAddressPicker
            value={addressValue}
            disabled={disabled}
            onChange={onPatch}
          />
          <Field className="md:col-span-2">
            <FieldLabel htmlFor="service-provider-introduction">公司简介</FieldLabel>
            <Textarea
              id="service-provider-introduction"
              rows={5}
              maxLength={2000}
              value={form.introduction}
              disabled={disabled}
              onChange={(event) => onChange("introduction", event.target.value)}
            />
          </Field>
        </FieldGroup>
        <div className="lg:sticky lg:top-0">
          <ServiceProviderAddressMap
            value={addressValue}
            disabled={disabled}
            onChange={onPatch}
          />
        </div>
      </div>
    </section>
  );
}

function TextField({
  id,
  label,
  value,
  disabled,
  type = "text",
  className,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  disabled: boolean;
  type?: "text" | "number";
  className?: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field className={className}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        type={type}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}
