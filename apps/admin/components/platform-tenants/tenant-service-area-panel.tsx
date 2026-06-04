"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Edit3, Loader2, MapPin, Plus } from "lucide-react";
import { FormSelect } from "@/components/admin/form-select";
import { StatusAlert } from "@/components/admin/status-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { refreshAfterDialogClose } from "@/lib/deferred-refresh";
import {
  tenantServiceAreaStatusOptions,
  type TenantServiceAreaRecord,
} from "./platform-tenant-types";
import { requestPlatformTenantJson } from "./platform-tenant-requests";
import { SearchableLocationSelect, type SearchableLocationOption } from "./searchable-location-select";

type FormState = {
  province: string;
  city: string;
  district: string;
  adcode: string;
  center_latitude: string;
  center_longitude: string;
  service_radius_km: string;
  priority: string;
  status: string;
};

type AdministrativeAreaOption = {
  adcode: string;
  name: string;
  level: "province" | "city" | "district";
  parent_adcode: string | null;
  full_name: string;
};

const initialForm: FormState = {
  province: "",
  city: "",
  district: "",
  adcode: "",
  center_latitude: "",
  center_longitude: "",
  service_radius_km: "",
  priority: "100",
  status: "active",
};

function text(value?: string | number | null) {
  if (value === null || value === undefined) return "-";
  const content = String(value).trim();
  return content || "-";
}

function toFormState(area?: TenantServiceAreaRecord | null): FormState {
  if (!area) return initialForm;
  return {
    province: area.province || "",
    city: area.city || "",
    district: area.district || "",
    adcode: area.adcode || "",
    center_latitude: area.center_latitude == null ? "" : String(area.center_latitude),
    center_longitude: area.center_longitude == null ? "" : String(area.center_longitude),
    service_radius_km: area.service_radius_km == null ? "" : String(area.service_radius_km),
    priority: String(area.priority ?? 100),
    status: area.status || "active",
  };
}

function optionalText(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function optionalNumber(value: string) {
  const trimmed = value.trim();
  return trimmed ? Number(trimmed) : undefined;
}

function getStatusMeta(status: string | null | undefined) {
  if (status === "active") return { label: "启用", variant: "success" as const };
  if (status === "inactive") return { label: "停用", variant: "secondary" as const };
  return { label: status || "未知", variant: "outline" as const };
}

async function fetchAdministrativeAreas(query: Record<string, string>) {
  const params = new URLSearchParams(query);
  const data = await requestPlatformTenantJson<{ list: AdministrativeAreaOption[] }>(
    `/api/backend/platform/administrative-areas?${params.toString()}`,
    { fallbackMessage: "行政区划加载失败" },
  );
  return data.list || [];
}

function toUniqueOptions(values: Array<SearchableLocationOption | null | undefined>) {
  const map = new Map<string, SearchableLocationOption>();
  for (const item of values) {
    const value = item?.value.trim();
    if (!value || map.has(value)) continue;
    map.set(value, { ...item, value });
  }
  return [...map.values()];
}

export function TenantServiceAreaPanel({
  tenantId,
  areas,
  error,
}: {
  tenantId: string;
  areas: TenantServiceAreaRecord[];
  error?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TenantServiceAreaRecord | null>(null);
  const [form, setForm] = useState<FormState>(initialForm);
  const [submitError, setSubmitError] = useState("");
  const [areaError, setAreaError] = useState("");
  const [provinceRows, setProvinceRows] = useState<AdministrativeAreaOption[]>([]);
  const [cityRows, setCityRows] = useState<AdministrativeAreaOption[]>([]);
  const [districtRows, setDistrictRows] = useState<AdministrativeAreaOption[]>([]);
  const [pending, startTransition] = useTransition();
  const selectedProvince = useMemo(
    () => provinceRows.find((province) => province.name === form.province) ?? null,
    [form.province, provinceRows],
  );
  const selectedCity = useMemo(
    () => cityRows.find((city) => city.name === form.city) ?? null,
    [cityRows, form.city],
  );
  const provinceOptions = useMemo(
    () => toUniqueOptions([
      ...provinceRows.map((province) => ({
        value: province.name,
        label: province.adcode,
        keywords: [province.adcode, province.full_name],
      })),
      ...areas.map((area) => area.province ? { value: area.province, label: "已配置区域" } : null),
    ]),
    [areas, provinceRows],
  );
  const cityOptions = useMemo(() => {
    return toUniqueOptions([
      ...cityRows.map((city) => ({
        value: city.name,
        label: city.adcode,
        keywords: [city.adcode, city.full_name],
      })),
      ...areas
        .filter((area) => !form.province || area.province === form.province)
        .map((area) => ({ value: area.city, label: "已配置区域" })),
    ]);
  }, [areas, cityRows, form.province]);
  const districtOptions = useMemo(() => {
    return toUniqueOptions([
      ...districtRows.map((district) => ({
        value: district.name,
        label: district.adcode,
        keywords: [district.adcode, district.full_name],
      })),
      ...areas
        .filter((area) => {
          if (!area.district) return false;
          if (form.province && area.province !== form.province) return false;
          return !form.city || area.city === form.city;
        })
        .map((area) => ({ value: area.district || "", label: "已配置区域" })),
    ]);
  }, [areas, districtRows, form.city, form.province]);

  useEffect(() => {
    if (!open || !selectedProvince) return;
    if (cityRows.some((city) => city.parent_adcode === selectedProvince.adcode)) return;
    void loadCities(selectedProvince.adcode);
  }, [cityRows, open, selectedProvince]);

  useEffect(() => {
    if (!open || !selectedCity) return;
    if (districtRows.some((district) => district.parent_adcode === selectedCity.adcode)) return;
    void loadDistricts(selectedCity.adcode);
  }, [districtRows, open, selectedCity]);

  async function loadProvinces() {
    if (provinceRows.length) return;
    try {
      setAreaError("");
      setProvinceRows(await fetchAdministrativeAreas({ level: "province" }));
    } catch (err) {
      setAreaError(err instanceof Error ? err.message : "省份加载失败");
    }
  }

  async function loadCities(parentAdcode: string) {
    try {
      setAreaError("");
      setCityRows(await fetchAdministrativeAreas({ parent_adcode: parentAdcode }));
    } catch (err) {
      setAreaError(err instanceof Error ? err.message : "城市加载失败");
    }
  }

  async function loadDistricts(parentAdcode: string) {
    try {
      setAreaError("");
      setDistrictRows(await fetchAdministrativeAreas({ parent_adcode: parentAdcode }));
    } catch (err) {
      setAreaError(err instanceof Error ? err.message : "区县加载失败");
    }
  }

  function openCreate() {
    setEditing(null);
    setForm(initialForm);
    setSubmitError("");
    setOpen(true);
    void loadProvinces();
  }

  function openEdit(area: TenantServiceAreaRecord) {
    setEditing(area);
    setForm(toFormState(area));
    setSubmitError("");
    setOpen(true);
    void loadProvinces();
  }

  function close() {
    if (pending) return;
    setOpen(false);
    setSubmitError("");
  }

  function updateField(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateProvince(value: string) {
    const province = provinceRows.find((item) => item.name === value);
    setForm((current) => ({
      ...current,
      province: value,
      city: "",
      district: "",
      adcode: "",
    }));
    setCityRows([]);
    setDistrictRows([]);
    if (province) void loadCities(province.adcode);
  }

  function updateCity(value: string) {
    const city = cityRows.find((item) => item.name === value);
    setForm((current) => ({
      ...current,
      city: value,
      district: "",
      adcode: city?.adcode || "",
    }));
    setDistrictRows([]);
    if (city) void loadDistricts(city.adcode);
  }

  function updateDistrict(value: string) {
    const district = districtRows.find((item) => item.name === value);
    setForm((current) => ({
      ...current,
      district: value,
      adcode: district?.adcode || current.adcode,
    }));
  }

  function buildPayload() {
    return {
      tenant_id: tenantId,
      province: optionalText(form.province),
      city: form.city.trim(),
      district: optionalText(form.district),
      adcode: optionalText(form.adcode),
      center_latitude: optionalNumber(form.center_latitude),
      center_longitude: optionalNumber(form.center_longitude),
      service_radius_km: optionalNumber(form.service_radius_km),
      priority: Number(form.priority || 100),
      status: form.status,
    };
  }

  function save() {
    const payload = buildPayload();
    setSubmitError("");
    startTransition(async () => {
      try {
        await requestPlatformTenantJson(
          editing
            ? `/api/backend/platform/tenant-service-areas/${editing.id}`
            : "/api/backend/platform/tenant-service-areas",
          {
            method: editing ? "PATCH" : "POST",
            body: JSON.stringify(editing ? { ...payload, tenant_id: undefined } : payload),
            fallbackMessage: editing ? "更新服务区域失败" : "创建服务区域失败",
          },
        );
        setOpen(false);
        refreshAfterDialogClose(router);
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : "保存服务区域失败");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-md bg-accent text-accent-foreground">
              <MapPin className="size-4" />
            </div>
            <div>
              <CardTitle>服务区域</CardTitle>
              <CardDescription>用于小程序定位后匹配本地装修公司</CardDescription>
            </div>
          </div>
          <Button type="button" onClick={openCreate}>
            <Plus data-icon="inline-start" />
            新增区域
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error ? <StatusAlert>{error}</StatusAlert> : null}
        {areas.length ? (
          <div className="divide-y rounded-md border">
            {areas.map((area) => {
              const statusMeta = getStatusMeta(area.status);
              return (
                <div
                  key={area.id}
                  className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_auto]"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-medium">
                        {[area.province, area.city, area.district].filter(Boolean).join(" ")}
                      </div>
                      <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
                      <Badge variant="outline">优先级 {area.priority}</Badge>
                    </div>
                    <div className="mt-2 grid gap-2 text-xs text-muted-foreground md:grid-cols-4">
                      <span>adcode：{text(area.adcode)}</span>
                      <span>纬度：{text(area.center_latitude)}</span>
                      <span>经度：{text(area.center_longitude)}</span>
                      <span>半径：{area.service_radius_km == null ? "-" : `${area.service_radius_km} km`}</span>
                    </div>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={() => openEdit(area)}>
                    <Edit3 data-icon="inline-start" />
                    编辑
                  </Button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            暂无服务区域。未配置时，小程序只能依赖已绑定客户或员工身份匹配租户。
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? setOpen(true) : close())}>
        <DialogContent className="max-w-[720px]">
          <DialogHeader>
            <DialogTitle>{editing ? "编辑服务区域" : "新增服务区域"}</DialogTitle>
            <DialogDescription>城市为必填项；adcode 和经纬度会提升定位匹配准确性。</DialogDescription>
          </DialogHeader>
          <FieldGroup className="grid gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="tenant-area-province">省份</FieldLabel>
              <SearchableLocationSelect
                id="tenant-area-province"
                value={form.province}
                options={provinceOptions}
                placeholder="搜索或选择省份"
                searchPlaceholder="搜索省份"
                disabled={pending}
                onChange={updateProvince}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="tenant-area-city">城市</FieldLabel>
              <SearchableLocationSelect
                id="tenant-area-city"
                value={form.city}
                options={cityOptions}
                placeholder="搜索或选择城市"
                searchPlaceholder="搜索城市或 adcode"
                disabled={pending || Boolean(form.province && selectedProvince && !cityRows.length)}
                required
                onChange={updateCity}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="tenant-area-district">区县</FieldLabel>
              <SearchableLocationSelect
                id="tenant-area-district"
                value={form.district}
                options={districtOptions}
                placeholder="搜索或选择区县"
                searchPlaceholder="搜索区县或 adcode"
                disabled={pending || Boolean(form.city && selectedCity && !districtRows.length)}
                onChange={updateDistrict}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="tenant-area-adcode">adcode</FieldLabel>
              <Input
                id="tenant-area-adcode"
                value={form.adcode}
                disabled={pending}
                onChange={(event) => updateField("adcode", event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="tenant-area-latitude">中心纬度</FieldLabel>
              <Input
                id="tenant-area-latitude"
                type="number"
                step="0.000001"
                value={form.center_latitude}
                disabled={pending}
                onChange={(event) => updateField("center_latitude", event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="tenant-area-longitude">中心经度</FieldLabel>
              <Input
                id="tenant-area-longitude"
                type="number"
                step="0.000001"
                value={form.center_longitude}
                disabled={pending}
                onChange={(event) => updateField("center_longitude", event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="tenant-area-radius">服务半径 km</FieldLabel>
              <Input
                id="tenant-area-radius"
                type="number"
                min="0"
                step="0.1"
                value={form.service_radius_km}
                disabled={pending}
                onChange={(event) => updateField("service_radius_km", event.target.value)}
              />
              <FieldDescription>为空时只按行政区划匹配，不做半径限制。</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="tenant-area-priority">优先级</FieldLabel>
              <Input
                id="tenant-area-priority"
                type="number"
                min="0"
                step="1"
                value={form.priority}
                disabled={pending}
                onChange={(event) => updateField("priority", event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="tenant-area-status">状态</FieldLabel>
              <FormSelect
                id="tenant-area-status"
                value={form.status}
                options={tenantServiceAreaStatusOptions}
                disabled={pending}
                onChange={(value) => updateField("status", value)}
              />
            </Field>
          </FieldGroup>
          {areaError ? <StatusAlert>{areaError}</StatusAlert> : null}
          {submitError ? <StatusAlert>{submitError}</StatusAlert> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close} disabled={pending}>
              取消
            </Button>
            <Button type="button" onClick={save} disabled={pending || !form.city.trim()}>
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
