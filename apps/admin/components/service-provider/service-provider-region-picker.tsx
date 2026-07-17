"use client";

import { useEffect, useMemo, useState } from "react";

import { StatusAlert } from "@/components/admin/status-alert";
import {
  SearchableLocationSelect,
  type SearchableLocationOption,
} from "@/components/platform-tenants/searchable-location-select";
import { Field, FieldLabel } from "@/components/ui/field";
import { requestBackendJson } from "@/lib/backend-client";
import { fetchPublicAdministrativeAreas } from "./service-provider-actions";
import type { AdministrativeAreaOption } from "./service-provider-types";

export type ServiceProviderRegionValue = {
  address_province: string;
  address_city: string;
  address_district: string;
  address_region_code: string;
};

type ServiceProviderRegionPatch = ServiceProviderRegionValue & {
  address_latitude?: string;
  address_longitude?: string;
};

type GeocodeResponse = {
  ok: boolean;
  latitude: number | null;
  longitude: number | null;
};

export function ServiceProviderRegionPicker({
  value,
  disabled,
  onChange,
}: {
  value: ServiceProviderRegionValue;
  disabled: boolean;
  onChange: (patch: ServiceProviderRegionPatch) => void;
}) {
  const [provinceRows, setProvinceRows] = useState<AdministrativeAreaOption[]>([]);
  const [cityRows, setCityRows] = useState<AdministrativeAreaOption[]>([]);
  const [districtRows, setDistrictRows] = useState<AdministrativeAreaOption[]>([]);
  const [error, setError] = useState("");

  const selectedProvince = useMemo(
    () => provinceRows.find((province) => province.name === value.address_province) ?? null,
    [provinceRows, value.address_province],
  );
  const selectedCity = useMemo(
    () => cityRows.find((city) => city.name === value.address_city) ?? null,
    [cityRows, value.address_city],
  );

  useEffect(() => {
    void loadRows({ level: "province" }, setProvinceRows);
  }, []);

  useEffect(() => {
    setCityRows([]);
    setDistrictRows([]);
    if (!selectedProvince) return;
    void loadRows({ parent_adcode: selectedProvince.adcode }, setCityRows);
  }, [selectedProvince?.adcode]);

  useEffect(() => {
    setDistrictRows([]);
    if (!selectedCity) return;
    void loadRows({ parent_adcode: selectedCity.adcode }, setDistrictRows);
  }, [selectedCity?.adcode]);

  async function loadRows(
    query: Record<string, string>,
    setter: (rows: AdministrativeAreaOption[]) => void,
  ) {
    try {
      setError("");
      setter(await fetchPublicAdministrativeAreas(query));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "行政区划加载失败");
    }
  }

  function updateProvince(nextProvince: string) {
    const province = provinceRows.find((row) => row.name === nextProvince);
    const patch = {
      address_province: province?.name || nextProvince,
      address_city: "",
      address_district: "",
      address_region_code: "",
      address_latitude: "",
      address_longitude: "",
    };
    onChange(patch);
    if (province) void locateRegion(province, patch);
  }

  function updateCity(nextCity: string) {
    const city = cityRows.find((row) => row.name === nextCity);
    const patch = {
      address_province: value.address_province,
      address_city: city?.name || nextCity,
      address_district: "",
      address_region_code: city?.adcode || "",
      address_latitude: "",
      address_longitude: "",
    };
    onChange(patch);
    if (city) void locateRegion(city, patch);
  }

  function updateDistrict(nextDistrict: string) {
    const district = districtRows.find((row) => row.name === nextDistrict);
    const patch = {
      address_province: value.address_province,
      address_city: value.address_city,
      address_district: district?.name || nextDistrict,
      address_region_code: district?.adcode || selectedCity?.adcode || value.address_region_code,
      address_latitude: "",
      address_longitude: "",
    };
    onChange(patch);
    if (district) {
      void locateRegion(district, patch);
    } else if (selectedCity) {
      void locateRegion(selectedCity, patch);
    }
  }

  async function locateRegion(
    row: AdministrativeAreaOption,
    basePatch: ServiceProviderRegionPatch,
  ) {
    try {
      const query = new URLSearchParams({
        address: row.full_name,
        region: basePatch.address_city || basePatch.address_province || row.name,
      });
      const result = await requestBackendJson<GeocodeResponse>(
        `/tenant/location/geocode?${query.toString()}`,
        { fallbackMessage: "区域定位失败" },
      );
      if (!result.ok || result.latitude == null || result.longitude == null) return;
      onChange({
        ...basePatch,
        address_latitude: String(result.latitude),
        address_longitude: String(result.longitude),
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "区域定位失败");
    }
  }

  return (
    <>
      <RegionField
        id="service-provider-address-province"
        label="省份"
        value={value.address_province}
        options={toLocationOptions(provinceRows)}
        placeholder="选择省份"
        searchPlaceholder="搜索省份"
        disabled={disabled}
        onChange={updateProvince}
      />
      <RegionField
        id="service-provider-address-city"
        label="城市"
        value={value.address_city}
        options={toLocationOptions(cityRows)}
        placeholder="选择城市"
        searchPlaceholder="搜索城市或 adcode"
        disabled={disabled || Boolean(value.address_province && selectedProvince && !cityRows.length)}
        required
        onChange={updateCity}
      />
      <RegionField
        id="service-provider-address-district"
        label="区县"
        className="md:col-span-2"
        value={value.address_district}
        options={toLocationOptions(districtRows)}
        placeholder="选择区县"
        searchPlaceholder="搜索区县或 adcode"
        disabled={disabled || Boolean(value.address_city && selectedCity && !districtRows.length)}
        onChange={updateDistrict}
      />
      {error ? <StatusAlert>{error}</StatusAlert> : null}
    </>
  );
}

function RegionField({
  id,
  label,
  className,
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
  className?: string;
  value: string;
  options: SearchableLocationOption[];
  placeholder: string;
  searchPlaceholder: string;
  disabled?: boolean;
  required?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <Field className={className}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <SearchableLocationSelect
        id={id}
        value={value}
        options={options}
        placeholder={placeholder}
        searchPlaceholder={searchPlaceholder}
        disabled={disabled}
        required={required}
        allowCustomValue={false}
        onChange={onChange}
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
