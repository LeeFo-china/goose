"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { StatusAlert } from "@/components/admin/status-alert";
import { SearchableLocationSelect, type SearchableLocationOption } from "@/components/platform-tenants/searchable-location-select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  createServiceProviderArea,
  fetchPublicAdministrativeAreas,
  updateServiceProviderArea,
} from "./service-provider-actions";
import type {
  AdministrativeAreaOption,
  ServiceProviderArea,
  ServiceProviderMutationResult,
} from "./service-provider-types";

type AreaForm = {
  province: string;
  city: string;
  district: string;
  adcode: string;
  service_radius_km: string;
  priority: string;
};

type RequestError = Error & { code?: string; status?: number };

const emptyAreaForm: AreaForm = {
  province: "",
  city: "",
  district: "",
  adcode: "",
  service_radius_km: "",
  priority: "100",
};

function toAreaForm(area: ServiceProviderArea | null): AreaForm {
  if (!area) return emptyAreaForm;
  return {
    province: area.province || "",
    city: area.city || "",
    district: area.district || "",
    adcode: area.adcode,
    service_radius_km: area.service_radius_km == null ? "" : String(area.service_radius_km),
    priority: String(area.priority ?? 100),
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

export function ServiceProviderAreaDialog({
  open,
  editing,
  profileVersion,
  onOpenChange,
  onMutated,
  onError,
  onMessage,
}: {
  open: boolean;
  editing: ServiceProviderArea | null;
  profileVersion: number;
  onOpenChange: (open: boolean) => void;
  onMutated: (result: ServiceProviderMutationResult) => void;
  onError: (error: RequestError | null) => void;
  onMessage: (message: string) => void;
}) {
  const [form, setForm] = useState<AreaForm>(emptyAreaForm);
  const [provinceRows, setProvinceRows] = useState<AdministrativeAreaOption[]>([]);
  const [cityRows, setCityRows] = useState<AdministrativeAreaOption[]>([]);
  const [districtRows, setDistrictRows] = useState<AdministrativeAreaOption[]>([]);
  const [areaError, setAreaError] = useState("");
  const [pending, startTransition] = useTransition();
  const selectedProvince = useMemo(
    () => provinceRows.find((province) => province.name === form.province) ?? null,
    [form.province, provinceRows],
  );
  const selectedCity = useMemo(
    () => cityRows.find((city) => city.name === form.city) ?? null,
    [cityRows, form.city],
  );

  useEffect(() => {
    if (!open) return;
    setForm(toAreaForm(editing));
    setAreaError("");
    void loadRows({ level: "province" }, setProvinceRows);
  }, [open, editing]);

  async function loadRows(
    query: Record<string, string>,
    setter: (rows: AdministrativeAreaOption[]) => void,
  ) {
    try {
      setAreaError("");
      setter(await fetchPublicAdministrativeAreas(query));
    } catch (caught) {
      setAreaError(caught instanceof Error ? caught.message : "行政区划加载失败");
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (pending) return;
    onOpenChange(nextOpen);
  }

  function updateField(field: keyof AreaForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateProvince(value: string) {
    const province = provinceRows.find((item) => item.name === value);
    setForm((current) => ({ ...current, province: value, city: "", district: "", adcode: "" }));
    setCityRows([]);
    setDistrictRows([]);
    if (province) void loadRows({ parent_adcode: province.adcode }, setCityRows);
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
    if (city) void loadRows({ parent_adcode: city.adcode }, setDistrictRows);
  }

  function updateDistrict(value: string) {
    const district = districtRows.find((item) => item.name === value);
    setForm((current) => ({
      ...current,
      district: value,
      adcode: district?.adcode || current.adcode,
    }));
  }

  function saveArea() {
    if (!form.city.trim() || !form.adcode.trim() || !profileVersion) return;
    const payload = {
      version: profileVersion,
      province: nullableText(form.province),
      city: form.city.trim(),
      district: nullableText(form.district),
      adcode: form.adcode.trim(),
      service_radius_km: nullableNumber(form.service_radius_km),
      priority: Number(form.priority || 100),
    };
    onError(null);
    onMessage("");
    startTransition(async () => {
      try {
        const result = editing
          ? await updateServiceProviderArea(editing.id, payload)
          : await createServiceProviderArea(payload);
        onMutated(result);
        onMessage(editing ? "服务区域已保存，需平台发布后恢复展示。" : "服务区域已新增，默认不会直接公开展示。");
        onOpenChange(false);
      } catch (caught) {
        onError(toRequestError(caught, editing ? "更新服务区域失败" : "新增服务区域失败"));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[720px]">
        <DialogHeader>
          <DialogTitle>{editing ? "编辑服务区域" : "新增服务区域"}</DialogTitle>
          <DialogDescription>保存后区域保持未展示，等待平台审核发布。</DialogDescription>
        </DialogHeader>
        <FieldGroup className="grid gap-4 md:grid-cols-2">
          <AreaLocationField
            id="service-provider-area-province"
            label="省份"
            value={form.province}
            options={toLocationOptions(provinceRows)}
            placeholder="搜索或选择省份"
            searchPlaceholder="搜索省份"
            disabled={pending}
            onChange={updateProvince}
          />
          <AreaLocationField
            id="service-provider-area-city"
            label="城市"
            value={form.city}
            options={toLocationOptions(cityRows)}
            placeholder="搜索或选择城市"
            searchPlaceholder="搜索城市或 adcode"
            disabled={pending || Boolean(form.province && selectedProvince && !cityRows.length)}
            required
            onChange={updateCity}
          />
          <AreaLocationField
            id="service-provider-area-district"
            label="区县"
            value={form.district}
            options={toLocationOptions(districtRows)}
            placeholder="搜索或选择区县"
            searchPlaceholder="搜索区县或 adcode"
            disabled={pending || Boolean(form.city && selectedCity && !districtRows.length)}
            onChange={updateDistrict}
          />
          <TextField id="service-provider-area-adcode" label="adcode" value={form.adcode} disabled={pending} onChange={(value) => updateField("adcode", value)} />
          <TextField id="service-provider-area-radius" label="服务半径 km" value={form.service_radius_km} disabled={pending} type="number" onChange={(value) => updateField("service_radius_km", value)} />
          <TextField id="service-provider-area-priority" label="优先级" value={form.priority} disabled={pending} type="number" onChange={(value) => updateField("priority", value)} />
        </FieldGroup>
        {areaError ? <StatusAlert>{areaError}</StatusAlert> : null}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={() => handleOpenChange(false)}>取消</Button>
          <Button type="button" disabled={pending || !form.city.trim() || !form.adcode.trim()} onClick={saveArea}>
            {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
            保存区域
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AreaLocationField({
  id,
  label,
  value,
  options,
  placeholder,
  searchPlaceholder,
  disabled,
  required,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: SearchableLocationOption[];
  placeholder: string;
  searchPlaceholder: string;
  disabled?: boolean;
  required?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <SearchableLocationSelect
        id={id}
        value={value}
        options={options}
        placeholder={placeholder}
        searchPlaceholder={searchPlaceholder}
        disabled={disabled}
        required={required}
        onChange={onChange}
      />
    </Field>
  );
}

function TextField({
  id,
  label,
  value,
  disabled,
  type = "text",
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  disabled: boolean;
  type?: "text" | "number";
  onChange: (value: string) => void;
}) {
  return (
    <Field>
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

function toLocationOptions(rows: AdministrativeAreaOption[]): SearchableLocationOption[] {
  return rows.map((row) => ({
    value: row.name,
    label: row.adcode,
    keywords: [row.adcode, row.full_name],
  }));
}
