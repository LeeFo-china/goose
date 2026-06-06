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

function emptyMetadata(): AddressMetadata {
  return {
    address_title: null,
    address_poi_id: null,
    address_province: null,
    address_city: null,
    address_district: null,
    address_adcode: null,
    address_latitude: null,
    address_longitude: null,
    address_source: null,
    address_confidence: null,
    address_confirmed_at: null,
  };
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
}: {
  mode: "create" | "edit";
  tenant?: PlatformTenantRecord;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [address, setAddress] = useState(tenant?.address || "");
  const [metadata, setMetadata] = useState<AddressMetadata>(() => metadataFromTenant(tenant));
  const [suggestions, setSuggestions] = useState<PlatformTenantAddressSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const region = useMemo(() => {
    return [metadata.address_city, metadata.address_district].filter(Boolean).join(" ") ||
      tenant?.address_city ||
      tenant?.address_district ||
      undefined;
  }, [metadata.address_city, metadata.address_district, tenant]);

  useEffect(() => {
    setAddress(tenant?.address || "");
    setMetadata(metadataFromTenant(tenant));
    setSuggestions([]);
    setError("");
  }, [tenant]);

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
    setMetadata({
      ...emptyMetadata(),
      address_source: value.trim() ? "manual" : null,
    });
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

  return (
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
    </Field>
  );
}
