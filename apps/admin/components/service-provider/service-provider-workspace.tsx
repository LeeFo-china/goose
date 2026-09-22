"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, Save, Send } from "lucide-react";

import { StatusAlert } from "@/components/admin/status-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
  hasUnsavedProfileChanges,
  reconcileProfileFormAfterRefresh,
  toProfileForm,
  toProfilePatch,
  type ProfileForm,
} from "./service-provider-profile-form";
import {
  formatDateTime,
  profileStatusMeta,
  type ListData,
  type ServiceProviderArea,
  type ServiceProviderMutationResult,
  type ServiceProviderProfile,
} from "./service-provider-types";

type RequestError = Error & { code?: string; status?: number };

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
  const hasUnsavedChanges = currentProfile ? hasUnsavedProfileChanges(form, currentProfile) : false;
  const canSubmitReview = Boolean(currentProfile && canManage && !pending && status === "draft" && !hasUnsavedChanges);

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
    if (!currentProfile || !canManage || pending || !hasUnsavedChanges) return;
    setError(null);
    setMessage("");
    startTransition(async () => {
      try {
        const result = await updateServiceProviderProfile(toProfilePatch(form, currentProfile));
        applyMutation(result);
        setMessage("服务商资料已保存。");
      } catch (caught) {
        setError(toRequestError(caught, "保存服务商资料失败"));
      }
    });
  }

  function submitReview() {
    if (!canSubmitReview) return;
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
      setForm((current) => reconcileProfileFormAfterRefresh(current, currentProfile, nextProfile));
      setMessage(hasUnsavedChanges ? "已刷新当前版本，未覆盖正在编辑的表单内容。" : "已刷新最新资料。");
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
      <main className="h-full overflow-y-auto p-5 lg:p-6">
        <div className="mx-auto max-w-6xl rounded-md bg-card px-5 py-8 sm:px-7">
          <h1 className="text-xl font-semibold">无权访问服务商资料</h1>
          <p className="mt-2 text-sm text-muted-foreground">当前账号缺少服务商资料查看权限。</p>
        </div>
      </main>
    );
  }

  return (
    <main className="h-full overflow-y-auto p-5 [scrollbar-gutter:stable] lg:p-6">
      <header className="mx-auto mb-5 flex w-full max-w-6xl flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">服务商资料</h1>
        <p className="text-sm text-muted-foreground">维护访客可见的公司信息，并申请平台发布。</p>
      </header>
      <div className="mx-auto w-full max-w-6xl rounded-md bg-card px-5 sm:px-7">
        <section aria-labelledby="service-provider-publication-heading" className="border-b py-6">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
            <div className="min-w-0 max-w-2xl">
              <h2 id="service-provider-publication-heading" className="text-base font-semibold">发布状态</h2>
              {currentProfile ? (
                <>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
                    <span className="text-sm text-muted-foreground tabular-nums">版本 {version}</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{profileStatusDescription[status]}</p>
                </>
              ) : <p className="mt-2 text-sm text-muted-foreground">当前状态暂不可用，请刷新资料。</p>}
              {currentProfile?.review_remark ? (
                <p className="mt-2 break-words text-sm leading-6 text-foreground">平台意见：{currentProfile.review_remark}</p>
              ) : null}
              {currentProfile?.submitted_at || currentProfile?.published_at ? (
                <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                  {currentProfile.submitted_at ? <div><dt className="inline">提交时间：</dt><dd className="inline tabular-nums">{formatDateTime(currentProfile.submitted_at)}</dd></div> : null}
                  {currentProfile.published_at ? <div><dt className="inline">发布时间：</dt><dd className="inline tabular-nums">{formatDateTime(currentProfile.published_at)}</dd></div> : null}
                </dl>
              ) : null}
            </div>
            <div className="flex flex-col gap-2 lg:items-end">
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" disabled={!canManage || pending || !currentProfile || !hasUnsavedChanges} onClick={saveProfile}>
                  {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Save data-icon="inline-start" />}
                  保存资料
                </Button>
                <Button type="button" disabled={!canSubmitReview} onClick={submitReview}>
                  <Send data-icon="inline-start" />
                  提交平台发布审核
                </Button>
                <Button type="button" variant="ghost" disabled={pending} onClick={() => void refreshCurrent()}>
                  <RefreshCw data-icon="inline-start" />
                  刷新资料
                </Button>
              </div>
              {!canManage ? <p className="text-sm text-muted-foreground">当前账号只能查看资料。</p> : null}
              {canManage && hasUnsavedChanges && status === "draft" ? <p className="text-sm text-muted-foreground">请先保存资料，再提交审核。</p> : null}
              {canManage && status !== "draft" ? <p className="text-sm text-muted-foreground">当前状态不能重复提交审核。</p> : null}
            </div>
          </div>
        </section>
        <div className="space-y-4 pt-5">
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
        </div>
        {!currentProfile ? (
          <div className="py-6"><StatusAlert>未加载到服务商资料，请确认公司已通过入驻审核。</StatusAlert></div>
        ) : (
          <>
            <ProfileFormSection
              form={form}
              disabled={!canManage || pending}
              onChange={updateForm}
              onPatch={patchForm}
            />
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
    </main>
  );
}

const profileStatusDescription = {
  draft: "填好公开名称、11 位手机号、详细地址、地图坐标及至少一个服务区域后，可提交平台审核。",
  pending_review: "资料正在等待平台审核，发布前不会出现在访客结果中。修改资料会回到草稿。",
  published: "资料已公开展示。修改名称、电话或地址等关键字段后，需要平台重新审核。",
  suspended: "平台已暂停公开展示。修改关键字段后需要平台重新审核。",
} satisfies Record<ServiceProviderProfile["status"], string>;

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
    <section className="border-b py-6" aria-labelledby="service-provider-public-profile-heading">
      <h2 id="service-provider-public-profile-heading" className="text-base font-semibold">公开资料</h2>
      <p className="mt-1 text-sm text-muted-foreground">名称、电话和地址将用于访客查看与联系。</p>
      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(340px,420px)] lg:items-start">
        <div className="space-y-6">
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">公司信息</h3>
            <FieldGroup className="grid gap-4 md:grid-cols-2">
              <TextField id="service-provider-public-name" label="公开名称" value={form.public_name} disabled={disabled} onChange={(value) => onChange("public_name", value)} />
              <TextField id="service-provider-public-phone" label="公开电话" value={form.public_phone} disabled={disabled} onChange={(value) => onChange("public_phone", value)} />
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
          </div>
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">公司地址</h3>
            <FieldGroup className="grid gap-4 md:grid-cols-2">
              <ServiceProviderRegionPicker value={regionValue} disabled={disabled} onChange={onPatch} />
              <ServiceProviderAddressPicker value={addressValue} disabled={disabled} onChange={onPatch} />
            </FieldGroup>
          </div>
        </div>
        <div className="lg:sticky lg:top-5">
          <h3 className="mb-3 text-sm font-semibold">地图位置</h3>
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
