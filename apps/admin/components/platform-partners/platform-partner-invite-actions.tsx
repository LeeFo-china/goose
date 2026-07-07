"use client";

import { Link2, Loader2, QrCode } from "lucide-react";
import { type FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CopyValueButton } from "@/components/admin/copy-value-button";
import { StatusAlert } from "@/components/admin/status-alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type {
  PlatformPartnerInviteCodeRecord,
  PlatformPartnerRecord,
} from "@/components/platform-partners/platform-partner-types";
import { requestBackendJson } from "@/lib/backend-client";
import { refreshAfterDialogClose } from "@/lib/deferred-refresh";

export function CreateInviteCodeButton({
  partner,
}: {
  partner: PlatformPartnerRecord;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [inviteCode, setInviteCode] =
    useState<PlatformPartnerInviteCodeRecord | null>(null);

  function handleOpenChange(nextOpen: boolean) {
    if (pending) return;
    setOpen(nextOpen);
    if (!nextOpen && inviteCode) refreshAfterDialogClose(router);
    if (nextOpen) setError("");
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      try {
        const created = await requestBackendJson<PlatformPartnerInviteCodeRecord>(
          `/platform/partners/${partner.id}/invite-codes`,
          {
            method: "POST",
            body: JSON.stringify(cleanPayload({
              region_code: optionalString(formData, "region_code"),
              expires_at: optionalDateTime(formData, "expires_at"),
            })),
            fallbackMessage: "生成合伙人邀请码失败",
          },
        );
        setInviteCode(created);
      } catch (submitError) {
        setError(
          submitError instanceof Error
            ? submitError.message
            : "生成合伙人邀请码失败",
        );
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          <Link2 data-icon="inline-start" />邀请码
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[560px]">
        <DialogHeader>
          <DialogTitle>生成专属邀请码</DialogTitle>
          <DialogDescription>
            为「{partner.name}」生成装企入驻绑定入口。系统会自动生成所需参数。
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={onSubmit}>
          <FieldGroup className="grid gap-4 md:grid-cols-2">
            <InviteCodeTextField
              name="region_code"
              label="区域编码"
              placeholder={partner.region_codes[0] ?? "可不填"}
            />
            <InviteCodeTextField
              name="expires_at"
              label="过期时间"
              type="datetime-local"
            />
          </FieldGroup>
          {inviteCode ? <InviteCodeResult inviteCode={inviteCode} /> : null}
          {error ? <StatusAlert>{error}</StatusAlert> : null}
          <FieldError />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => handleOpenChange(false)}
            >
              关闭
            </Button>
            <Button type="submit" disabled={pending}>
              {pending
                ? <Loader2 className="animate-spin" data-icon="inline-start" />
                : <QrCode data-icon="inline-start" />}
              {inviteCode ? "重新生成" : "生成小程序码"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function InviteCodeTextField({
  name,
  label,
  type = "text",
  placeholder,
}: {
  name: string;
  label: string;
  type?: "text" | "datetime-local";
  placeholder?: string;
}) {
  const id = `partner-invite-code-${name}`;
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input id={id} name={name} type={type} placeholder={placeholder} />
    </Field>
  );
}

function InviteCodeResult({
  inviteCode,
}: {
  inviteCode: PlatformPartnerInviteCodeRecord;
}) {
  const qrcodeSrc = `/api/backend/platform/partner-invite-codes/${
    encodeURIComponent(inviteCode.code)
  }/qrcode`;

  return (
    <div className="grid gap-4 rounded-md border bg-muted/20 p-4 md:grid-cols-[160px_1fr]">
      <div className="flex size-40 items-center justify-center rounded-md border bg-background p-2">
        <img
          src={qrcodeSrc}
          alt={`城市合伙人邀请码 ${inviteCode.code} 小程序码`}
          className="size-full object-contain"
        />
      </div>
      <div className="flex min-w-0 flex-col justify-center gap-3">
        <div>
          <div className="text-xs text-muted-foreground">专属邀请码</div>
          <div className="mt-1 break-all font-mono text-base font-semibold">
            {inviteCode.code}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <CopyValueButton value={inviteCode.code} label="复制邀请码" />
          <CopyValueButton value={qrcodeSrc} label="复制图片地址" />
        </div>
      </div>
    </div>
  );
}

function stringField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function optionalString(formData: FormData, key: string) {
  const value = stringField(formData, key);
  return value || undefined;
}

function optionalDateTime(formData: FormData, key: string) {
  const value = stringField(formData, key);
  return value ? new Date(value).toISOString() : undefined;
}

function cleanPayload(payload: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined),
  );
}
