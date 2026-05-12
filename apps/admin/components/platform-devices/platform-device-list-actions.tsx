"use client";

import { type FormEvent, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2, Search, X } from "lucide-react";
import { FormSelect } from "@/components/admin/form-select";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  platformDeviceStatusOptions,
  platformDeviceVendorOptions,
  type Pagination,
} from "@/components/platform-devices/platform-device-types";

const vendorOptions = [
  { value: "__all", label: "全部厂商" },
  ...platformDeviceVendorOptions,
] as const;

const statusOptions = [
  { value: "__all", label: "全部状态" },
  ...platformDeviceStatusOptions,
] as const;

const boundOptions = [
  { value: "__all", label: "全部绑定" },
  { value: "true", label: "仅未绑定" },
] as const;

function buildPlatformDevicesHref(input: {
  page?: number;
  vendor?: string;
  status?: string;
  onlyUnbound?: string;
  keyword?: string;
}) {
  const params = new URLSearchParams();
  if (input.page && input.page > 1) params.set("page", String(input.page));
  if (input.vendor && input.vendor !== "__all") params.set("vendor", input.vendor);
  if (input.status && input.status !== "__all") params.set("status", input.status);
  if (input.onlyUnbound === "true") params.set("only_unbound", "true");
  if (input.keyword) params.set("keyword", input.keyword);
  const query = params.toString();
  return query ? `/platform/devices?${query}` : "/platform/devices";
}

export function PlatformDeviceFilters({
  vendor,
  status,
  onlyUnbound,
  keyword,
}: {
  vendor: string;
  status: string;
  onlyUnbound: boolean;
  keyword: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selectedVendor, setSelectedVendor] = useState(vendor || "__all");
  const [selectedStatus, setSelectedStatus] = useState(status || "__all");
  const [selectedBound, setSelectedBound] = useState(onlyUnbound ? "true" : "__all");
  const [selectedKeyword, setSelectedKeyword] = useState(keyword);

  useEffect(() => {
    setSelectedVendor(vendor || "__all");
    setSelectedStatus(status || "__all");
    setSelectedBound(onlyUnbound ? "true" : "__all");
    setSelectedKeyword(keyword);
  }, [keyword, onlyUnbound, status, vendor]);

  function navigate(next: {
    vendor?: string;
    status?: string;
    onlyUnbound?: string;
    keyword?: string;
  }) {
    startTransition(() => {
      router.push(buildPlatformDevicesHref({
        vendor: next.vendor ?? selectedVendor,
        status: next.status ?? selectedStatus,
        onlyUnbound: next.onlyUnbound ?? selectedBound,
        keyword: next.keyword ?? selectedKeyword.trim(),
      }));
      router.refresh();
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate({ keyword: selectedKeyword.trim() });
  }

  return (
    <form className="grid gap-3 md:grid-cols-[150px_150px_150px_1fr_72px]" onSubmit={submit}>
      <FormSelect
        id="platform-device-vendor-filter"
        value={selectedVendor}
        options={vendorOptions}
        disabled={pending}
        onChange={(value) => {
          setSelectedVendor(value);
          navigate({ vendor: value });
        }}
      />
      <FormSelect
        id="platform-device-status-filter"
        value={selectedStatus}
        options={statusOptions}
        disabled={pending}
        onChange={(value) => {
          setSelectedStatus(value);
          navigate({ status: value });
        }}
      />
      <FormSelect
        id="platform-device-bound-filter"
        value={selectedBound}
        options={boundOptions}
        disabled={pending}
        onChange={(value) => {
          setSelectedBound(value);
          navigate({ onlyUnbound: value });
        }}
      />
      <InputGroup>
        <InputGroupAddon>
          <Search data-icon="inline-start" />
        </InputGroupAddon>
        <InputGroupInput
          name="keyword"
          value={selectedKeyword}
          placeholder="搜索设备名、设备 ID、通道 ID"
          disabled={pending}
          onChange={(event) => setSelectedKeyword(event.target.value)}
        />
        {selectedKeyword ? (
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              type="button"
              size="icon-xs"
              disabled={pending}
              onClick={() => {
                setSelectedKeyword("");
                navigate({ keyword: "" });
              }}
            >
              <X />
            </InputGroupButton>
          </InputGroupAddon>
        ) : null}
      </InputGroup>
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
        搜索
      </Button>
    </form>
  );
}

export function PlatformDevicePagination({
  pagination,
  vendor,
  status,
  onlyUnbound,
  keyword,
}: {
  pagination: Pagination;
  vendor: string;
  status: string;
  onlyUnbound: boolean;
  keyword: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const totalPages = Math.max(1, pagination.totalPages || 1);
  const previousDisabled = pagination.page <= 1 || pending;
  const nextDisabled = pagination.page >= totalPages || pending;

  function navigate(page: number) {
    startTransition(() => {
      router.push(buildPlatformDevicesHref({
        page,
        vendor,
        status,
        onlyUnbound: onlyUnbound ? "true" : "__all",
        keyword,
      }));
      router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="text-sm text-muted-foreground">
        第 {pagination.page} / {totalPages} 页，共 {pagination.total} 个设备资产
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={previousDisabled}
          onClick={() => navigate(Math.max(1, pagination.page - 1))}
        >
          {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <ChevronLeft data-icon="inline-start" />}
          上一页
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={nextDisabled}
          onClick={() => navigate(pagination.page + 1)}
        >
          下一页
          {pending ? <Loader2 className="animate-spin" data-icon="inline-end" /> : <ChevronRight data-icon="inline-end" />}
        </Button>
      </div>
    </div>
  );
}
