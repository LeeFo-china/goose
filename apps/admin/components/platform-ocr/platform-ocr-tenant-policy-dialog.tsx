"use client";

import { type FormEvent, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ScanText } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import {
  platformOcrRolloutDocumentOptions,
  type PlatformOcrTenantPolicy,
} from "@/components/platform-ocr/platform-ocr-types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { requestBackendJson } from "@/lib/backend-client";
import { refreshAfterDialogClose } from "@/lib/deferred-refresh";

export function PlatformOcrTenantPolicyDialog({
  policy,
  open,
  onOpenChange,
}: {
  policy: PlatformOcrTenantPolicy | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(false);
  const [documentTypes, setDocumentTypes] = useState<string[]>([]);
  const [dailyLimit, setDailyLimit] = useState("");
  const [remark, setRemark] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !policy) return;
    setEnabled(policy.enabled);
    setDocumentTypes(policy.allowed_document_types);
    setDailyLimit(policy.daily_limit == null ? "" : String(policy.daily_limit));
    setRemark(policy.remark ?? "");
    setError("");
  }, [open, policy]);

  function toggleDocumentType(value: string, checked: boolean) {
    setDocumentTypes((current) => checked
      ? [...new Set([...current, value])]
      : current.filter((item) => item !== value));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!policy) return;
    if (enabled && documentTypes.length === 0) {
      setError("启用租户 OCR 时至少选择一种识别类型");
      return;
    }
    const parsedDailyLimit = dailyLimit.trim() ? Number(dailyLimit) : null;
    if (parsedDailyLimit !== null &&
      (!Number.isInteger(parsedDailyLimit) || parsedDailyLimit < 1 || parsedDailyLimit > 10000)) {
      setError("每日额度必须是 1 到 10000 之间的整数");
      return;
    }

    setError("");
    startTransition(async () => {
      try {
        await requestBackendJson(
          `/api/backend/platform/ocr/tenant-policies/${policy.tenant_id}`,
          {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              enabled,
              allowed_document_types: documentTypes,
              daily_limit: parsedDailyLimit,
              remark: remark.trim() || null,
            }),
          },
        );
        onOpenChange(false);
        refreshAfterDialogClose(router);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "保存 OCR 灰度策略失败");
      }
    });
  }

  function close() {
    if (pending) return;
    setError("");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-[600px]">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="flex size-9 items-center justify-center rounded-md bg-accent text-accent-foreground">
              <ScanText />
            </div>
            <div className="min-w-0">
              <DialogTitle>配置租户 OCR 灰度</DialogTitle>
              <DialogDescription className="mt-1">
                {policy?.tenant_name ?? "未选择租户"} · {policy?.tenant_slug ?? "-"}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form className="flex flex-col gap-4" onSubmit={submit}>
          {error ? <StatusAlert>{error}</StatusAlert> : null}
          <FieldGroup>
            <Field className="rounded-md border p-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <FieldLabel htmlFor="platform-ocr-tenant-enabled">启用 OCR</FieldLabel>
                  <FieldDescription>
                    还需平台总开关开启才会生效；停用不会删除历史调用记录。
                  </FieldDescription>
                </div>
                <Switch
                  id="platform-ocr-tenant-enabled"
                  checked={enabled}
                  disabled={pending}
                  onCheckedChange={setEnabled}
                />
              </div>
            </Field>

            <Field data-invalid={enabled && documentTypes.length === 0 ? true : undefined}>
              <FieldLabel>允许的识别类型</FieldLabel>
              <div className="grid gap-2 sm:grid-cols-2">
                {platformOcrRolloutDocumentOptions.map((option) => {
                  const id = `platform-ocr-policy-${option.value}`;
                  return (
                    <label
                      key={option.value}
                      htmlFor={id}
                      className="flex items-center gap-2 rounded-md border p-3 text-sm"
                    >
                      <Checkbox
                        id={id}
                        checked={documentTypes.includes(option.value)}
                        disabled={pending}
                        onCheckedChange={(checked) =>
                          toggleDocumentType(option.value, checked === true)}
                      />
                      {option.label}
                    </label>
                  );
                })}
              </div>
              <FieldError>
                {enabled && documentTypes.length === 0
                  ? "启用时至少选择一种识别类型"
                  : null}
              </FieldError>
            </Field>

            <Field>
              <FieldLabel htmlFor="platform-ocr-tenant-daily-limit">每日额度</FieldLabel>
              <Input
                id="platform-ocr-tenant-daily-limit"
                type="number"
                inputMode="numeric"
                min={1}
                max={10000}
                step={1}
                value={dailyLimit}
                disabled={pending}
                placeholder="留空使用平台默认额度"
                onChange={(event) => setDailyLimit(event.target.value)}
              />
              <FieldDescription>按租户、UTC 自然日统计，范围 1 到 10000。</FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="platform-ocr-tenant-remark">运营备注</FieldLabel>
              <Textarea
                id="platform-ocr-tenant-remark"
                value={remark}
                maxLength={500}
                rows={3}
                disabled={pending}
                placeholder="例如：首批支付进件灰度"
                onChange={(event) => setRemark(event.target.value)}
              />
              <FieldDescription>{remark.length}/500，仅平台运营可见。</FieldDescription>
            </Field>
          </FieldGroup>

          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={close}>
              取消
            </Button>
            <Button type="submit" disabled={pending || !policy}>
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              保存策略
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
