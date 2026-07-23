"use client";

import { type FormEvent, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";
import { FormSelect } from "@/components/admin/form-select";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";

const enabledOptions = [
  { value: "__all", label: "全部状态" },
  { value: "true", label: "已启用" },
  { value: "false", label: "未启用" },
] as const;

function buildHref(input: {
  pageSize: number;
  keyword: string;
  enabled: string;
}) {
  const query = new URLSearchParams();
  query.set("view", "tenants");
  query.set("pageSize", String(input.pageSize));
  if (input.keyword.trim()) query.set("keyword", input.keyword.trim());
  if (input.enabled !== "__all") query.set("enabled", input.enabled);
  return `/platform/ocr?${query.toString()}`;
}

export function PlatformOcrTenantPolicyFilters({
  pageSize,
  keyword,
  enabled,
}: {
  pageSize: number;
  keyword: string;
  enabled: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selectedKeyword, setSelectedKeyword] = useState(keyword);
  const [selectedEnabled, setSelectedEnabled] = useState(enabled || "__all");

  useEffect(() => {
    setSelectedKeyword(keyword);
    setSelectedEnabled(enabled || "__all");
  }, [enabled, keyword]);

  function navigate(nextKeyword = selectedKeyword) {
    startTransition(() => {
      router.push(buildHref({
        pageSize,
        keyword: nextKeyword,
        enabled: selectedEnabled,
      }));
      router.refresh();
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate();
  }

  return (
    <form
      className="grid gap-3 md:grid-cols-[180px_minmax(280px,1fr)_72px]"
      onSubmit={submit}
    >
      <FormSelect
        id="platform-ocr-tenant-enabled-filter"
        value={selectedEnabled}
        options={enabledOptions}
        disabled={pending}
        onChange={setSelectedEnabled}
      />
      <InputGroup>
        <InputGroupAddon><Search data-icon="inline-start" /></InputGroupAddon>
        <InputGroupInput
          value={selectedKeyword}
          placeholder="搜索租户名称或标识"
          maxLength={80}
          disabled={pending}
          onChange={(event) => setSelectedKeyword(event.target.value)}
        />
        {selectedKeyword ? (
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              type="button"
              size="icon-xs"
              disabled={pending}
              aria-label="清除租户搜索"
              onClick={() => {
                setSelectedKeyword("");
                navigate("");
              }}
            >
              <X />
            </InputGroupButton>
          </InputGroupAddon>
        ) : null}
      </InputGroup>
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
        筛选
      </Button>
    </form>
  );
}
