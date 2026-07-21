"use client";

import { type FormEvent, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL_STATUS = "all";

const STATUS_OPTIONS = [
  { value: "submitted", label: "待审核" },
  { value: "approved", label: "审核通过" },
  { value: "applying", label: "进件中" },
  { value: "wechat_editing", label: "待修正重提" },
  { value: "reviewing", label: "微信审核中" },
  { value: "account_verifying", label: "账户验证" },
  { value: "signing", label: "待签约" },
  { value: "opening", label: "开通中" },
  { value: "opened", label: "已开通" },
  { value: "bound", label: "已绑定" },
  { value: "active", label: "已启用" },
  { value: "rejected", label: "已驳回" },
  { value: "suspended", label: "已暂停" },
  { value: "closed", label: "已关闭" },
] as const;

export function PlatformWechatPayApplymentFilters({
  status,
  keyword,
}: {
  status: string;
  keyword: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draftStatus, setDraftStatus] = useState(status || ALL_STATUS);
  const [draftKeyword, setDraftKeyword] = useState(keyword);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    const normalizedKeyword = draftKeyword.trim();
    if (draftStatus !== ALL_STATUS) params.set("status", draftStatus);
    if (normalizedKeyword) params.set("keyword", normalizedKeyword);

    const query = params.toString();
    startTransition(() => {
      router.push(query
        ? `/platform/wechat-pay/applyments?${query}`
        : "/platform/wechat-pay/applyments");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <FieldGroup className="grid gap-2 md:grid-cols-[180px_minmax(260px,1fr)_auto_auto] md:items-end">
        <Field>
          <FieldLabel htmlFor="platform-applyment-status" className="sr-only">
            申请状态
          </FieldLabel>
          <Select
            value={draftStatus}
            disabled={pending}
            onValueChange={setDraftStatus}
          >
            <SelectTrigger
              id="platform-applyment-status"
              aria-label="按申请状态筛选"
              className="bg-card shadow-none"
            >
              <SelectValue placeholder="全部状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={ALL_STATUS}>全部状态</SelectItem>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="platform-applyment-keyword" className="sr-only">
            搜索申请
          </FieldLabel>
          <Input
            id="platform-applyment-keyword"
            value={draftKeyword}
            disabled={pending}
            placeholder="申请 ID / 编号、租户、微信进件号、子商户号"
            className="bg-card shadow-none"
            onChange={(event) => setDraftKeyword(event.target.value)}
          />
        </Field>
        <Button type="submit" disabled={pending}>
          {pending ? (
            <Loader2 className="animate-spin" data-icon="inline-start" />
          ) : (
            <Search data-icon="inline-start" />
          )}
          搜索
        </Button>
        <Button asChild type="button" variant="outline">
          <Link href="/platform/wechat-pay/applyments">
            <RotateCcw data-icon="inline-start" />
            重置
          </Link>
        </Button>
      </FieldGroup>
    </form>
  );
}
