"use client";

import { type FormEvent, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2, Search, X } from "lucide-react";
import { FormSelect } from "@/components/admin/form-select";
import { buildPlatformDevicesHref } from "@/components/platform-devices/platform-device-href";
import {
  platformDeviceStatusOptions,
  type Pagination,
} from "@/components/platform-devices/platform-device-types";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";

const statusOptions = [
  { value: "__all", label: "全部状态" },
  ...platformDeviceStatusOptions,
] as const;

export function PlatformTencentDeviceFilters({
  status,
  keyword,
}: {
  status: string;
  keyword: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selectedStatus, setSelectedStatus] = useState(status || "__all");
  const [selectedKeyword, setSelectedKeyword] = useState(keyword);

  useEffect(() => {
    setSelectedStatus(status || "__all");
    setSelectedKeyword(keyword);
  }, [keyword, status]);

  function navigate(next: {
    status?: string;
    keyword?: string;
  }) {
    startTransition(() => {
      router.push(buildPlatformDevicesHref({
        tab: "tencent",
        status: next.status ?? selectedStatus,
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
    <form className="grid gap-3 md:grid-cols-[150px_1fr_72px]" onSubmit={submit}>
      <FormSelect
        id="platform-tencent-device-status-filter"
        value={selectedStatus}
        options={statusOptions}
        disabled={pending}
        onChange={(value) => {
          setSelectedStatus(value);
          navigate({ status: value });
        }}
      />
      <InputGroup>
        <InputGroupAddon>
          <Search data-icon="inline-start" />
        </InputGroupAddon>
        <InputGroupInput
          name="keyword"
          value={selectedKeyword}
          placeholder="搜索设备名、DeviceId、DeviceCode"
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

export function PlatformTencentDevicePagination({
  pagination,
  status,
  keyword,
}: {
  pagination: Pagination;
  status: string;
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
        tab: "tencent",
        page,
        status,
        keyword,
      }));
      router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="text-sm text-muted-foreground">
        第 {pagination.page} / {totalPages} 页，共 {pagination.total} 台腾讯云设备
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
