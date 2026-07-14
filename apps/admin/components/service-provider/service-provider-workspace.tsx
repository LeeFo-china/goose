"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Edit3, Loader2, Plus, RefreshCw, Save, Send } from "lucide-react";

import { StatusAlert } from "@/components/admin/status-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ServiceProviderAreaDialog } from "./service-provider-area-dialog";
import {
  fetchServiceProviderAreas,
  fetchServiceProviderProfile,
  submitServiceProviderProfile,
  updateServiceProviderProfile,
} from "./service-provider-actions";
import {
  areaStatusMeta,
  formatAreaRegion,
  formatDateTime,
  profileStatusMeta,
  type ListData,
  type ServiceProviderArea,
  type ServiceProviderMutationResult,
  type ServiceProviderProfile,
  type ServiceProviderPublicationStatus,
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
const statusNotice: Record<ServiceProviderPublicationStatus, string> = {
  draft: "资料仍是草稿，可继续编辑并提交平台发布审核。",
  pending_review: "平台发布审核中；再次编辑会取消当前审核并回到草稿，修改后需要重新提交。",
  published: "当前资料正在小程序公开展示；保存关键资料或服务区域后会进入待平台审核，并暂时从访客结果移除。",
  suspended: "当前资料未公开展示；编辑关键内容后需重新提交平台审核，其他恢复事宜请联系平台运营。",
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
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>当前资料状态</CardTitle>
              <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
              <Badge variant="outline" className="tabular-nums">版本 {version || "-"}</Badge>
            </div>
            <CardDescription className="mt-2">{statusNotice[status]}</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
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
                status={status}
                updatedAt={currentProfile.updated_at}
                onChange={updateForm}
                onSave={saveProfile}
              />
              <Separator />
              <AreaSection
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
  status,
  updatedAt,
  onChange,
  onSave,
}: {
  form: ProfileForm;
  disabled: boolean;
  status: ServiceProviderPublicationStatus;
  updatedAt: string;
  onChange: (field: keyof ProfileForm, value: string) => void;
  onSave: () => void;
}) {
  return (
    <section className="flex flex-col gap-4" aria-labelledby="service-provider-profile-heading">
      <div className="flex flex-col justify-between gap-2 md:flex-row md:items-start">
        <div>
          <h2 id="service-provider-profile-heading" className="text-base font-semibold">公开资料</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            小程序仅展示平台发布后的资料，最近更新 {formatDateTime(updatedAt)}。
          </p>
        </div>
        <Button type="button" variant="outline" disabled={disabled} onClick={onSave}>
          <Save data-icon="inline-start" />
          保存资料
        </Button>
      </div>
      <FieldGroup className="grid gap-4 md:grid-cols-2">
        <TextField id="service-provider-public-name" label="公开名称" value={form.public_name} disabled={disabled} onChange={(value) => onChange("public_name", value)} />
        <TextField id="service-provider-public-phone" label="公开电话" value={form.public_phone} disabled={disabled} onChange={(value) => onChange("public_phone", value)} />
        <TextField id="service-provider-address-province" label="省份" value={form.address_province} disabled={disabled} onChange={(value) => onChange("address_province", value)} />
        <TextField id="service-provider-address-city" label="城市" value={form.address_city} disabled={disabled} onChange={(value) => onChange("address_city", value)} />
        <TextField id="service-provider-address-district" label="区县" value={form.address_district} disabled={disabled} onChange={(value) => onChange("address_district", value)} />
        <TextField id="service-provider-address-region-code" label="地址区域代码" value={form.address_region_code} disabled={disabled} onChange={(value) => onChange("address_region_code", value)} />
        <TextField id="service-provider-address" label="详细地址" value={form.address} disabled={disabled} className="md:col-span-2" onChange={(value) => onChange("address", value)} />
        <TextField id="service-provider-address-latitude" label="地址纬度" value={form.address_latitude} disabled={disabled} type="number" onChange={(value) => onChange("address_latitude", value)} />
        <TextField id="service-provider-address-longitude" label="地址经度" value={form.address_longitude} disabled={disabled} type="number" onChange={(value) => onChange("address_longitude", value)} />
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
          <FieldDescription>
            {status === "published" ? "修改公开简介后，需要平台重新发布后才恢复展示。" : "建议说明服务范围、工期能力和售后方式。"}
          </FieldDescription>
        </Field>
      </FieldGroup>
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

function AreaSection({
  areas,
  profileVersion,
  canManage,
  pending,
  onMutated,
  onError,
  onMessage,
  onLoadPage,
}: {
  areas: ListData<ServiceProviderArea>;
  profileVersion: number;
  canManage: boolean;
  pending: boolean;
  onMutated: (result: ServiceProviderMutationResult) => void;
  onError: (error: RequestError | null) => void;
  onMessage: (message: string) => void;
  onLoadPage: (page: number) => Promise<void>;
}) {
  const [editing, setEditing] = useState<ServiceProviderArea | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const currentPage = areas.pagination.page || 1;
  const totalPages = areas.pagination.totalPages || 0;

  function openDialog(area: ServiceProviderArea | null) {
    setEditing(area);
    setDialogOpen(true);
    onError(null);
    onMessage("");
  }

  return (
    <section className="flex flex-col gap-4" aria-labelledby="service-provider-areas-heading">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <h2 id="service-provider-areas-heading" className="text-base font-semibold">服务区域</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            区域需平台发布后才会展示，租户侧新增或修改默认保持未展示。
          </p>
        </div>
        <Button type="button" disabled={!canManage || pending || !profileVersion} onClick={() => openDialog(null)}>
          <Plus data-icon="inline-start" />
          新增区域
        </Button>
      </div>
      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>区域</TableHead>
              <TableHead>行政区划代码</TableHead>
              <TableHead>优先级</TableHead>
              <TableHead>展示状态</TableHead>
              <TableHead className="w-24 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {areas.list.length ? areas.list.map((area) => {
              const meta = areaStatusMeta[area.status];
              return (
                <TableRow key={area.id}>
                  <TableCell className="font-medium">{formatAreaRegion(area) || "-"}</TableCell>
                  <TableCell className="tabular-nums">{area.adcode}</TableCell>
                  <TableCell className="tabular-nums">{area.priority}</TableCell>
                  <TableCell><Badge variant={meta.variant}>{meta.label}</Badge></TableCell>
                  <TableCell className="text-right">
                    <Button type="button" size="sm" variant="ghost" disabled={!canManage || pending} onClick={() => openDialog(area)}>
                      <Edit3 data-icon="inline-start" />
                      编辑
                    </Button>
                  </TableCell>
                </TableRow>
              );
            }) : (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  暂无服务区域，未发布区域前不会出现在访客本地服务商列表。
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-col justify-between gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center">
        <span className="tabular-nums">当前显示 {areas.list.length} 个，共 {areas.pagination.total} 个</span>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" disabled={pending || currentPage <= 1} onClick={() => void onLoadPage(currentPage - 1)}>上一页</Button>
          <Badge variant="outline" className="tabular-nums">第 {currentPage} / {Math.max(totalPages, 1)} 页</Badge>
          <Button type="button" size="sm" variant="outline" disabled={pending || !totalPages || currentPage >= totalPages} onClick={() => void onLoadPage(currentPage + 1)}>下一页</Button>
        </div>
      </div>
      <ServiceProviderAreaDialog
        open={dialogOpen}
        editing={editing}
        profileVersion={profileVersion}
        onOpenChange={setDialogOpen}
        onMutated={onMutated}
        onError={onError}
        onMessage={onMessage}
      />
    </section>
  );
}
