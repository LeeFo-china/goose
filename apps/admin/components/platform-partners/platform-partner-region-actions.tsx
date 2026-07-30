"use client";

import { Loader2, MapPinned } from "lucide-react";
import { type FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { StatusAlert } from "@/components/admin/status-alert";
import { PlatformPartnerRegionPicker } from "@/components/platform-partners/platform-partner-region-picker";
import type { PlatformPartnerRecord } from "@/components/platform-partners/platform-partner-types";
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
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { requestBackendJson } from "@/lib/backend-client";
import { refreshAfterDialogClose } from "@/lib/deferred-refresh";

export function EditPartnerRegionsButton({
  partner,
}: {
  partner: PlatformPartnerRecord;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selectedRegionCodes, setSelectedRegionCodes] = useState(
    partner.region_codes,
  );
  const [changeReason, setChangeReason] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function handleOpenChange(nextOpen: boolean) {
    if (pending) return;
    setOpen(nextOpen);
    if (nextOpen) {
      setSelectedRegionCodes(partner.region_codes);
      setChangeReason("");
      setError("");
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    startTransition(async () => {
      try {
        await requestBackendJson(
          `/platform/partners/${partner.id}/regions`,
          {
            method: "PATCH",
            body: JSON.stringify({
              region_codes: selectedRegionCodes,
              change_reason: changeReason.trim(),
              expected_version: partner.region_version ?? 1,
            }),
            fallbackMessage: "更新城市合伙人运营区县失败",
          },
        );
        setOpen(false);
        refreshAfterDialogClose(router);
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "更新城市合伙人运营区县失败",
        );
      }
    });
  }

  const isSubmitDisabled =
    pending || selectedRegionCodes.length === 0 || !changeReason.trim();

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="ghost">
          <MapPinned data-icon="inline-start" />
          区域
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-[640px] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>调整运营区县</DialogTitle>
          <DialogDescription>
            {partner.name} · 保存后仅影响后续区域归属，不会迁移已绑定装企。
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <FieldGroup className="grid gap-4">
            <PlatformPartnerRegionPicker
              value={selectedRegionCodes}
              initialAreas={partner.region_areas}
              disabled={pending}
              onChange={setSelectedRegionCodes}
            />
            <Field>
              <FieldLabel htmlFor={`partner-region-reason-${partner.id}`}>
                变更原因
              </FieldLabel>
              <Textarea
                id={`partner-region-reason-${partner.id}`}
                value={changeReason}
                maxLength={300}
                required
                disabled={pending}
                placeholder="例如：按实际团队覆盖范围调整为浉河区、平桥区"
                onChange={(event) => setChangeReason(event.target.value)}
              />
              <FieldDescription>
                原因会和变更前后区域一起写入平台审计日志。
              </FieldDescription>
            </Field>
          </FieldGroup>
          {error ? <StatusAlert>{error}</StatusAlert> : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              取消
            </Button>
            <Button type="submit" disabled={isSubmitDisabled}>
              {pending ? (
                <Loader2 className="animate-spin" data-icon="inline-start" />
              ) : null}
              保存运营区县
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
