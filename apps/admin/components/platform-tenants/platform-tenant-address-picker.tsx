"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, MapPin, Search } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import type {
  PlatformTenantAddressSuggestion,
  PlatformTenantRecord,
} from "@/components/platform-tenants/platform-tenant-types";
import { requestPlatformTenantJson } from "@/components/platform-tenants/platform-tenant-requests";
import { PlatformTenantAddressMapPreview } from "@/components/platform-tenants/platform-tenant-address-map-preview";
import { SearchableLocationSelect, type SearchableLocationOption } from "@/components/platform-tenants/searchable-location-select";
import { cn } from "@/lib/utils";

type AddressMetadata = Pick<
  PlatformTenantRecord,
  | "address_title"
  | "address_poi_id"
  | "address_province"
  | "address_city"
  | "address_district"
  | "address_adcode"
  | "address_latitude"
  | "address_longitude"
  | "address_source"
  | "address_confidence"
  | "address_confirmed_at"
>;

type SuggestionResponse = {
  list: PlatformTenantAddressSuggestion[];
};

type AdministrativeAreaOption = {
  adcode: string;
  name: string;
  level: "province" | "city" | "district";
  parent_adcode: string | null;
  full_name: string;
};

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

function metadataFromTenant(tenant?: PlatformTenantRecord): AddressMetadata {
  return {
    address_title: tenant?.address_title ?? null,
    address_poi_id: tenant?.address_poi_id ?? null,
    address_province: tenant?.address_province ?? null,
    address_city: tenant?.address_city ?? null,
    address_district: tenant?.address_district ?? null,
    address_adcode: tenant?.address_adcode ?? null,
    address_latitude: tenant?.address_latitude ?? null,
    address_longitude: tenant?.address_longitude ?? null,
    address_source: tenant?.address_source ?? null,
    address_confidence: tenant?.address_confidence ?? null,
    address_confirmed_at: tenant?.address_confirmed_at ?? null,
  };
}

function suggestionAddress(suggestion: PlatformTenantAddressSuggestion) {
  return suggestion.address || [suggestion.province, suggestion.city, suggestion.district]
    .filter(Boolean)
    .join("");
}

export function PlatformTenantAddressPicker({
  mode,
  tenant,
  disabled,
  active,
}: {
  mode: "create" | "edit";
  tenant?: PlatformTenantRecord;
  disabled?: boolean;
  active?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [address, setAddress] = useState(tenant?.address || "");
  const [metadata, setMetadata] = useState<AddressMetadata>(() => metadataFromTenant(tenant));
  const [suggestions, setSuggestions] = useState<PlatformTenantAddressSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [areaError, setAreaError] = useState("");
  const [provinceRows, setProvinceRows] = useState<AdministrativeAreaOption[]>([]);
  const [cityRows, setCityRows] = useState<AdministrativeAreaOption[]>([]);
  const [districtRows, setDistrictRows] = useState<AdministrativeAreaOption[]>([]);
  const selectedProvince = useMemo(
    () => provinceRows.find((province) => province.name === metadata.address_province) ?? null,
    [metadata.address_province, provinceRows],
  );
  const selectedCity = useMemo(
    () => cityRows.find((city) => city.name === metadata.address_city) ?? null,
    [cityRows, metadata.address_city],
  );
  const provinceOptions = useMemo(
    () => toUniqueOptions([
      ...provinceRows.map((province) => ({
        value: province.name,
        label: province.adcode,
        keywords: [province.adcode, province.full_name],
      })),
      metadata.address_province ? { value: metadata.address_province, label: "当前值" } : null,
    ]),
    [metadata.address_province, provinceRows],
  );
  const cityOptions = useMemo(
    () => toUniqueOptions([
      ...cityRows.map((city) => ({
        value: city.name,
        label: city.adcode,
        keywords: [city.adcode, city.full_name],
      })),
      metadata.address_city ? { value: metadata.address_city, label: "当前值" } : null,
    ]),
    [cityRows, metadata.address_city],
  );
  const districtOptions = useMemo(
    () => toUniqueOptions([
      ...districtRows.map((district) => ({
        value: district.name,
        label: district.adcode,
        keywords: [district.adcode, district.full_name],
      })),
      metadata.address_district ? { value: metadata.address_district, label: "当前值" } : null,
    ]),
    [districtRows, metadata.address_district],
  );
  const region = useMemo(() => {
    return metadata.address_city ||
      metadata.address_province ||
      tenant?.address_city ||
      undefined;
  }, [metadata.address_city, metadata.address_province, tenant?.address_city]);

  useEffect(() => {
    setAddress(tenant?.address || "");
    setMetadata(metadataFromTenant(tenant));
    setSuggestions([]);
    setError("");
    setAreaError("");
  }, [tenant]);

  useEffect(() => {
    if (!active) return;
    void loadProvinces();
  }, [active]);

  useEffect(() => {
    if (!selectedProvince) return;
    if (cityRows.some((city) => city.parent_adcode === selectedProvince.adcode)) return;
    void loadCities(selectedProvince.adcode);
  }, [cityRows, selectedProvince]);

  useEffect(() => {
    if (!selectedCity) return;
    if (districtRows.some((district) => district.parent_adcode === selectedCity.adcode)) return;
    void loadDistricts(selectedCity.adcode);
  }, [districtRows, selectedCity]);

  useEffect(() => {
    const keyword = address.trim();
    if (!open || keyword.length < 2) {
      setSuggestions([]);
      setError("");
      setLoading(false);
      return;
    }

    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const query = new URLSearchParams({
          keyword,
          pageSize: "8",
        });
        if (region) query.set("region", region);
        const data = await requestPlatformTenantJson<SuggestionResponse>(
          `/api/backend/platform/location/address-suggestions?${query.toString()}`,
          { fallbackMessage: "地址搜索失败" },
        );
        setSuggestions(data.list || []);
      } catch (err) {
        setSuggestions([]);
        setError(err instanceof Error ? err.message : "地址搜索失败");
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => window.clearTimeout(timer);
  }, [address, open, region]);

  function handleAddressChange(value: string) {
    setAddress(value);
    setMetadata((current) => ({
      ...current,
      address_title: null,
      address_poi_id: null,
      address_latitude: null,
      address_longitude: null,
      address_source: value.trim() ? "manual" : null,
      address_confidence: null,
      address_confirmed_at: null,
    }));
  }

  function handleSelect(suggestion: PlatformTenantAddressSuggestion) {
    const nextAddress = suggestionAddress(suggestion);
    setAddress(nextAddress);
    setMetadata({
      address_title: suggestion.title,
      address_poi_id: suggestion.id,
      address_province: suggestion.province,
      address_city: suggestion.city,
      address_district: suggestion.district,
      address_adcode: suggestion.adcode,
      address_latitude: suggestion.latitude,
      address_longitude: suggestion.longitude,
      address_source: suggestion.source,
      address_confidence: suggestion.confidence,
      address_confirmed_at: new Date().toISOString(),
    });
    setOpen(false);
  }

  function handleMapConfirm(location: { latitude: number; longitude: number }) {
    setMetadata((current) => ({
      ...current,
      address_latitude: location.latitude,
      address_longitude: location.longitude,
      address_source: "map_picker",
      address_confirmed_at: new Date().toISOString(),
    }));
  }

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

  function updateProvince(value: string) {
    const province = provinceRows.find((item) => item.name === value);
    setMetadata((current) => ({
      ...current,
      address_province: value || null,
      address_city: null,
      address_district: null,
      address_adcode: province?.adcode || null,
    }));
    setCityRows([]);
    setDistrictRows([]);
    if (province) void loadCities(province.adcode);
  }

  function updateCity(value: string) {
    const city = cityRows.find((item) => item.name === value);
    setMetadata((current) => ({
      ...current,
      address_city: value || null,
      address_district: null,
      address_adcode: city?.adcode || selectedProvince?.adcode || current.address_adcode,
    }));
    setDistrictRows([]);
    if (city) void loadDistricts(city.adcode);
  }

  function updateDistrict(value: string) {
    const district = districtRows.find((item) => item.name === value);
    setMetadata((current) => ({
      ...current,
      address_district: value || null,
      address_adcode: district?.adcode || selectedCity?.adcode || current.address_adcode,
    }));
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-3">
        <Field>
          <FieldLabel htmlFor={`${mode}-tenant-address-province`}>地址省份</FieldLabel>
          <SearchableLocationSelect
            id={`${mode}-tenant-address-province`}
            value={metadata.address_province || ""}
            options={provinceOptions}
            placeholder="选择省份"
            searchPlaceholder="搜索省份"
            disabled={disabled}
            onChange={updateProvince}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${mode}-tenant-address-city`}>地址城市</FieldLabel>
          <SearchableLocationSelect
            id={`${mode}-tenant-address-city`}
            value={metadata.address_city || ""}
            options={cityOptions}
            placeholder="选择城市"
            searchPlaceholder="搜索城市或 adcode"
            disabled={disabled || Boolean(metadata.address_province && selectedProvince && !cityRows.length)}
            onChange={updateCity}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${mode}-tenant-address-district`}>地址区县</FieldLabel>
          <SearchableLocationSelect
            id={`${mode}-tenant-address-district`}
            value={metadata.address_district || ""}
            options={districtOptions}
            placeholder="选择区县"
            searchPlaceholder="搜索区县或 adcode"
            disabled={disabled || Boolean(metadata.address_city && selectedCity && !districtRows.length)}
            onChange={updateDistrict}
          />
        </Field>
      </div>
      <Field>
        <FieldLabel htmlFor={`${mode}-tenant-address`}>公司地址</FieldLabel>
        <Popover open={open} onOpenChange={(nextOpen) => !disabled && setOpen(nextOpen)}>
          <PopoverAnchor asChild>
            <InputGroup>
              <InputGroupAddon align="inline-start">
                {loading ? <Loader2 className="animate-spin" /> : <Search />}
              </InputGroupAddon>
              <InputGroupInput
                id={`${mode}-tenant-address`}
                name="address"
                value={address}
                maxLength={200}
                placeholder="搜索真实办公地址或门店地址"
                disabled={disabled}
                autoComplete="off"
                onChange={(event) => {
                  handleAddressChange(event.target.value);
                  setOpen(true);
                }}
                onFocus={() => setOpen(true)}
              />
            </InputGroup>
          </PopoverAnchor>
          <PopoverContent
            className="w-[min(560px,calc(100vw-2rem))] p-0"
            align="start"
            onOpenAutoFocus={(event) => event.preventDefault()}
          >
            <Command shouldFilter={false}>
              <CommandList>
                <CommandEmpty>
                  {error || (address.trim().length < 2 ? "输入至少 2 个字符搜索地址" : "未找到匹配地址")}
                </CommandEmpty>
                <CommandGroup>
                  {suggestions.map((suggestion, index) => {
                    const itemAddress = suggestionAddress(suggestion);
                    return (
                      <CommandItem
                        key={suggestion.id || `${suggestion.title}-${index}`}
                        value={`${suggestion.title || ""} ${itemAddress}`}
                        onSelect={() => handleSelect(suggestion)}
                      >
                        <MapPin className="text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{suggestion.title || itemAddress || "未命名地址"}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {[itemAddress, suggestion.district || suggestion.city].filter(Boolean).join(" · ")}
                          </div>
                        </div>
                        <Check
                          className={cn(
                            "text-primary",
                            address === itemAddress ? "opacity-100" : "opacity-0",
                          )}
                        />
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <FieldDescription>
          选中腾讯位置服务候选后会保存经纬度；手动修改地址会降级为待确认。
        </FieldDescription>
      </Field>
      {areaError ? <div className="text-xs text-destructive">{areaError}</div> : null}
      <PlatformTenantAddressMapPreview
        latitude={metadata.address_latitude}
        longitude={metadata.address_longitude}
        title={metadata.address_title}
        address={address}
        disabled={disabled}
        onConfirm={handleMapConfirm}
      />
      {Object.entries(metadata).map(([key, value]) => (
        <Input key={key} type="hidden" name={key} value={value ?? ""} readOnly />
      ))}
    </div>
  );
}
