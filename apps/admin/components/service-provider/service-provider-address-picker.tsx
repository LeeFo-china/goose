"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, MapPin, Search } from "lucide-react";

import { PlatformTenantAddressMapPreview } from "@/components/platform-tenants/platform-tenant-address-map-preview";
import type { PlatformTenantAddressSuggestion } from "@/components/platform-tenants/platform-tenant-types";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Field, FieldLabel } from "@/components/ui/field";
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
import { requestBackendJson } from "@/lib/backend-client";
import { cn } from "@/lib/utils";

type SuggestionResponse = {
  list: PlatformTenantAddressSuggestion[];
};

export type ServiceProviderAddressValue = {
  address: string;
  address_province: string;
  address_city: string;
  address_district: string;
  address_region_code: string;
  address_latitude: string;
  address_longitude: string;
};

export function ServiceProviderAddressPicker({
  value,
  disabled,
  onChange,
}: {
  value: ServiceProviderAddressValue;
  disabled: boolean;
  onChange: (patch: Partial<ServiceProviderAddressValue>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<PlatformTenantAddressSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const region = useMemo(() => {
    return value.address_city ||
      value.address_province ||
      undefined;
  }, [value.address_city, value.address_province]);

  useEffect(() => {
    const keyword = value.address.trim();
    if (!open || disabled || keyword.length < 2) {
      setSuggestions([]);
      setError("");
      setLoading(false);
      return;
    }

    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const query = new URLSearchParams({ keyword, pageSize: "8" });
        if (region) query.set("region", region);
        if (value.address_province) query.set("province", value.address_province);
        if (value.address_city) query.set("city", value.address_city);
        if (value.address_district) query.set("district", value.address_district);
        if (value.address_region_code) query.set("adcode", value.address_region_code);
        const data = await requestBackendJson<SuggestionResponse>(
          `/tenant/location/address-suggestions?${query.toString()}`,
          { fallbackMessage: "地址搜索失败" },
        );
        setSuggestions(data.list || []);
      } catch (caught) {
        setSuggestions([]);
        setError(caught instanceof Error ? caught.message : "地址搜索失败");
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => window.clearTimeout(timer);
  }, [
    disabled,
    open,
    region,
    value.address,
    value.address_city,
    value.address_district,
    value.address_province,
    value.address_region_code,
  ]);

  function updateAddress(nextAddress: string) {
    onChange({
      address: nextAddress,
    });
  }

  function selectSuggestion(suggestion: PlatformTenantAddressSuggestion) {
    const nextAddress = suggestionAddress(suggestion);
    onChange({
      address: nextAddress,
      address_province: suggestion.province || value.address_province,
      address_city: suggestion.city || value.address_city,
      address_district: suggestion.district || value.address_district,
      address_region_code: suggestion.adcode || value.address_region_code,
      address_latitude: suggestion.latitude == null ? "" : String(suggestion.latitude),
      address_longitude: suggestion.longitude == null ? "" : String(suggestion.longitude),
    });
    setOpen(false);
  }

  return (
    <Field className="md:col-span-2">
      <FieldLabel htmlFor="service-provider-address">详细地址</FieldLabel>
      <Popover open={open} onOpenChange={(nextOpen) => !disabled && setOpen(nextOpen)}>
        <PopoverAnchor asChild>
          <InputGroup>
            <InputGroupAddon align="inline-start">
              {loading ? <Loader2 className="animate-spin" /> : <Search />}
            </InputGroupAddon>
            <InputGroupInput
              id="service-provider-address"
              value={value.address}
              maxLength={200}
              placeholder="搜索公司办公地址或门店地址"
              disabled={disabled}
              autoComplete="off"
              onChange={(event) => {
                updateAddress(event.target.value);
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
                {error || (value.address.trim().length < 2 ? "输入至少 2 个字符搜索地址" : "未找到匹配地址")}
              </CommandEmpty>
              <CommandGroup>
                {suggestions.map((suggestion, index) => {
                  const itemAddress = suggestionAddress(suggestion);
                  return (
                    <CommandItem
                      key={suggestion.id || `${suggestion.title}-${index}`}
                      value={`${suggestion.title || ""} ${itemAddress}`}
                      onSelect={() => selectSuggestion(suggestion)}
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
                          value.address === itemAddress ? "opacity-100" : "opacity-0",
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
    </Field>
  );
}

export function ServiceProviderAddressMap({
  value,
  disabled,
  onChange,
}: {
  value: ServiceProviderAddressValue;
  disabled: boolean;
  onChange: (patch: Partial<ServiceProviderAddressValue>) => void;
}) {
  const latitude = parseCoordinate(value.address_latitude);
  const longitude = parseCoordinate(value.address_longitude);

  return (
    <PlatformTenantAddressMapPreview
      latitude={latitude}
      longitude={longitude}
      title={value.address}
      address={value.address}
      disabled={disabled}
      mapConfigPath="/tenant/location/map-config"
      previewClassName="h-64 lg:h-[360px]"
      zoom={resolveMapZoom(value)}
      onConfirm={(location) => {
        onChange({
          address_latitude: String(location.latitude),
          address_longitude: String(location.longitude),
        });
      }}
    />
  );
}

function suggestionAddress(suggestion: PlatformTenantAddressSuggestion) {
  return suggestion.address || [suggestion.province, suggestion.city, suggestion.district]
    .filter(Boolean)
    .join("") || suggestion.title || "";
}

function parseCoordinate(value: string) {
  const coordinate = Number(value);
  return Number.isFinite(coordinate) ? coordinate : null;
}

function resolveMapZoom(value: ServiceProviderAddressValue) {
  if (value.address.trim()) return 16;
  if (value.address_district) return 12;
  if (value.address_city) return 10;
  if (value.address_province) return 7;
  return 4;
}
