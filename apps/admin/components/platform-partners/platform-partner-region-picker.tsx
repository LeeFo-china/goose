"use client";

import { Check, ChevronsUpDown, MapPin, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { StatusAlert } from "@/components/admin/status-alert";
import {
  SearchableLocationSelect,
  type SearchableLocationOption,
} from "@/components/platform-tenants/searchable-location-select";
import type { AdministrativeAreaOption } from "@/components/platform-partners/platform-partner-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { requestBackendJson } from "@/lib/backend-client";
import { cn } from "@/lib/utils";

const EMPTY_ADMINISTRATIVE_AREAS: AdministrativeAreaOption[] = [];

export async function fetchAdministrativeAreas(
  query: Record<string, string>,
) {
  const params = new URLSearchParams(query);
  const data = await requestBackendJson<{ list: AdministrativeAreaOption[] }>(
    `/public/administrative-areas?${params.toString()}`,
    { fallbackMessage: "行政区划加载失败" },
  );
  return data.list || [];
}

export function PlatformPartnerRegionPicker({
  value,
  initialAreas = EMPTY_ADMINISTRATIVE_AREAS,
  disabled = false,
  onChange,
}: {
  value: string[];
  initialAreas?: AdministrativeAreaOption[];
  disabled?: boolean;
  onChange: (regionCodes: string[]) => void;
}) {
  const [provinceRows, setProvinceRows] = useState<AdministrativeAreaOption[]>([]);
  const [cityRows, setCityRows] = useState<AdministrativeAreaOption[]>([]);
  const [districtRows, setDistrictRows] = useState<AdministrativeAreaOption[]>([]);
  const [knownAreas, setKnownAreas] = useState<AdministrativeAreaOption[]>(initialAreas);
  const [provinceName, setProvinceName] = useState("");
  const [cityName, setCityName] = useState("");
  const [error, setError] = useState("");

  const selectedProvince = useMemo(
    () => provinceRows.find((row) => row.name === provinceName) ?? null,
    [provinceName, provinceRows],
  );
  const selectedCity = useMemo(
    () => cityRows.find((row) => row.name === cityName) ?? null,
    [cityName, cityRows],
  );
  const areaByCode = useMemo(
    () => new Map(knownAreas.map((area) => [area.adcode, area])),
    [knownAreas],
  );

  useEffect(() => {
    void loadRows({ level: "province" }, setProvinceRows);
  }, []);

  useEffect(() => {
    setKnownAreas((current) => mergeAreas(current, initialAreas));
  }, [initialAreas]);

  useEffect(() => {
    const missingCodes = value.filter((code) => !areaByCode.has(code));
    if (missingCodes.length === 0) return;
    void fetchAdministrativeAreas({ adcodes: missingCodes.slice(0, 100).join(",") })
      .then((rows) => setKnownAreas((current) => mergeAreas(current, rows)))
      .catch((caught) => {
        setError(caught instanceof Error ? caught.message : "行政区划加载失败");
      });
  }, [areaByCode, value]);

  useEffect(() => {
    setCityName("");
    setCityRows([]);
    setDistrictRows([]);
    if (!selectedProvince) return;
    void loadRows(
      { parent_adcode: selectedProvince.adcode },
      setCityRows,
    );
  }, [selectedProvince?.adcode]);

  useEffect(() => {
    setDistrictRows([]);
    if (!selectedCity) return;
    void loadRows(
      { parent_adcode: selectedCity.adcode },
      setDistrictRows,
    );
  }, [selectedCity?.adcode]);

  async function loadRows(
    query: Record<string, string>,
    setter: (rows: AdministrativeAreaOption[]) => void,
  ) {
    try {
      setError("");
      setter(await fetchAdministrativeAreas(query));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "行政区划加载失败");
    }
  }

  function toggleDistrict(area: AdministrativeAreaOption) {
    if (!value.includes(area.adcode) && value.length >= 100) {
      setError("单个合伙人最多选择 100 个运营区县");
      return;
    }
    setError("");
    setKnownAreas((current) => mergeAreas(current, [area]));
    const nextCodes = value.includes(area.adcode)
      ? value.filter((code) => code !== area.adcode)
      : [...value, area.adcode];
    onChange(Array.from(new Set(nextCodes)).sort());
  }

  return (
    <Field className="md:col-span-2" data-invalid={value.length === 0 || undefined}>
      <FieldLabel>运营区县</FieldLabel>
      <div className="grid gap-3 md:grid-cols-2">
        <LocationField
          id="partner-region-province"
          value={provinceName}
          options={toLocationOptions(provinceRows)}
          placeholder="选择省份"
          searchPlaceholder="搜索省份"
          disabled={disabled}
          onChange={setProvinceName}
        />
        <LocationField
          id="partner-region-city"
          value={cityName}
          options={toLocationOptions(cityRows)}
          placeholder="选择城市"
          searchPlaceholder="搜索城市或 adcode"
          disabled={disabled || !selectedProvince}
          onChange={setCityName}
        />
      </div>
      <DistrictMultiSelect
        rows={districtRows}
        selectedCodes={value}
        disabled={disabled || !selectedCity}
        onToggle={toggleDistrict}
      />
      <SelectedRegions
        regionCodes={value}
        areaByCode={areaByCode}
        disabled={disabled}
        onRemove={(code) => onChange(value.filter((item) => item !== code))}
      />
      <FieldDescription>
        先选择省市，再勾选一个或多个实际运营区县；已选区县可跨城市累积。
      </FieldDescription>
      {error ? <StatusAlert>{error}</StatusAlert> : null}
    </Field>
  );
}

function LocationField({
  id,
  value,
  options,
  placeholder,
  searchPlaceholder,
  disabled,
  onChange,
}: {
  id: string;
  value: string;
  options: SearchableLocationOption[];
  placeholder: string;
  searchPlaceholder: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <SearchableLocationSelect
      id={id}
      value={value}
      options={options}
      placeholder={placeholder}
      searchPlaceholder={searchPlaceholder}
      disabled={disabled}
      allowCustomValue={false}
      required
      onChange={onChange}
    />
  );
}

function DistrictMultiSelect({
  rows,
  selectedCodes,
  disabled,
  onToggle,
}: {
  rows: AdministrativeAreaOption[];
  selectedCodes: string[];
  disabled: boolean;
  onToggle: (area: AdministrativeAreaOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedCount = rows.filter((row) =>
    selectedCodes.includes(row.adcode)
  ).length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className={cn("truncate", !selectedCount && "text-muted-foreground")}>
            {selectedCount ? `当前城市已选 ${selectedCount} 个区县` : "选择区县"}
          </span>
          <ChevronsUpDown data-icon="inline-end" className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
      >
        <Command>
          <CommandInput placeholder="搜索区县名称或 adcode" />
          <CommandList>
            <CommandEmpty>当前城市没有可选区县</CommandEmpty>
            <CommandGroup>
              {rows.map((row) => {
                const isChecked = selectedCodes.includes(row.adcode);
                return (
                  <CommandItem
                    key={row.adcode}
                    value={`${row.name} ${row.adcode} ${row.full_name}`}
                    onSelect={() => onToggle(row)}
                  >
                    <Checkbox
                      checked={isChecked}
                      tabIndex={-1}
                      aria-label={`选择${row.full_name}`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{row.name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {row.adcode}
                      </div>
                    </div>
                    <Check className={cn("opacity-0", isChecked && "opacity-100")} />
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function SelectedRegions({
  regionCodes,
  areaByCode,
  disabled,
  onRemove,
}: {
  regionCodes: string[];
  areaByCode: Map<string, AdministrativeAreaOption>;
  disabled: boolean;
  onRemove: (code: string) => void;
}) {
  if (regionCodes.length === 0) {
    return (
      <div className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
        尚未选择运营区县
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border p-2">
      {regionCodes.map((code) => {
        const area = areaByCode.get(code);
        const isDistrict = area?.level === "district";
        return (
          <div key={code} className="flex min-w-0 items-center gap-2">
            <MapPin className="shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm">{area?.full_name ?? code}</div>
              <div className="truncate text-xs text-muted-foreground">{code}</div>
            </div>
            <Badge variant={isDistrict ? "outline" : "warning"}>
              {isDistrict ? "区县" : "待迁移"}
            </Badge>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              disabled={disabled}
              aria-label={`移除${area?.full_name ?? code}`}
              onClick={() => onRemove(code)}
            >
              <X />
            </Button>
          </div>
        );
      })}
    </div>
  );
}

function mergeAreas(
  current: AdministrativeAreaOption[],
  incoming: AdministrativeAreaOption[],
) {
  const map = new Map(current.map((area) => [area.adcode, area]));
  let changed = false;
  for (const area of incoming) {
    if (map.get(area.adcode) === area) continue;
    map.set(area.adcode, area);
    changed = true;
  }
  return changed ? [...map.values()] : current;
}

function toLocationOptions(
  rows: AdministrativeAreaOption[],
): SearchableLocationOption[] {
  return rows.map((row) => ({
    value: row.name,
    label: row.adcode,
    keywords: [row.adcode, row.full_name],
  }));
}
