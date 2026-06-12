"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Filter, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL_VALUE = "all";

type Option = {
  value: string;
  label: string;
};

export function SocialVideoFilters({
  targetPlatform,
  style,
  status,
  targetPlatformOptions,
  styleOptions,
  statusOptions,
}: {
  targetPlatform: string;
  style: string;
  status: string;
  targetPlatformOptions: readonly Option[];
  styleOptions: readonly Option[];
  statusOptions: readonly Option[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState({
    targetPlatform: targetPlatform || ALL_VALUE,
    style: style || ALL_VALUE,
    status: status || ALL_VALUE,
  });

  function applyFilters() {
    const params = new URLSearchParams();
    if (draft.targetPlatform !== ALL_VALUE) params.set("target_platform", draft.targetPlatform);
    if (draft.style !== ALL_VALUE) params.set("style", draft.style);
    if (draft.status !== ALL_VALUE) params.set("status", draft.status);

    const query = params.toString();
    startTransition(() => {
      router.push(query ? `/social-video?${query}` : "/social-video");
      router.refresh();
    });
  }

  return (
    <FieldGroup className="grid gap-2 md:grid-cols-[140px_140px_140px_auto_auto] md:items-end">
      <Field>
        <FieldLabel htmlFor="social-video-target-platform" className="sr-only">
          目标平台
        </FieldLabel>
        <Select
          value={draft.targetPlatform}
          onValueChange={(value) => setDraft((current) => ({ ...current, targetPlatform: value }))}
        >
          <SelectTrigger id="social-video-target-platform" className="bg-card shadow-none">
            <SelectValue placeholder="全部平台" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={ALL_VALUE}>全部平台</SelectItem>
              {targetPlatformOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel htmlFor="social-video-style" className="sr-only">
          脚本风格
        </FieldLabel>
        <Select
          value={draft.style}
          onValueChange={(value) => setDraft((current) => ({ ...current, style: value }))}
        >
          <SelectTrigger id="social-video-style" className="bg-card shadow-none">
            <SelectValue placeholder="全部风格" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={ALL_VALUE}>全部风格</SelectItem>
              {styleOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel htmlFor="social-video-status" className="sr-only">
          状态
        </FieldLabel>
        <Select
          value={draft.status}
          onValueChange={(value) => setDraft((current) => ({ ...current, status: value }))}
        >
          <SelectTrigger id="social-video-status" className="bg-card shadow-none">
            <SelectValue placeholder="全部状态" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={ALL_VALUE}>全部状态</SelectItem>
              {statusOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      <Button type="button" disabled={pending} onClick={applyFilters}>
        {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Filter data-icon="inline-start" />}
        筛选
      </Button>
      <Button asChild type="button" variant="outline">
        <Link href="/social-video">重置</Link>
      </Button>
    </FieldGroup>
  );
}
