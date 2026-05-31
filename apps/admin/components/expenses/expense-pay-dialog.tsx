"use client";

import { useMemo, useState, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { Loader2, WalletCards } from "lucide-react";
import { FormSelect } from "@/components/admin/form-select";
import { StatusAlert } from "@/components/admin/status-alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ExpenseRecord } from "@/components/expenses/expense-mutation-types";
import {
  formatMoney,
  getEvidenceImagePreviewSrc,
  getExpensePayeeName,
  MAX_UPLOAD_FILES,
  PayFormSchema,
  type PayFormValues,
  requestExpense,
  settlementMethodSelectOptions,
  uploadEvidenceImages,
} from "@/components/expenses/expense-mutation-shared";

export function PayDialog({
  expense,
  currentEmployeeId,
  onClose,
  onDone,
}: {
  expense: ExpenseRecord;
  currentEmployeeId: string;
  onClose: () => void;
  onDone: (expense: ExpenseRecord) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [uploading, startUploadTransition] = useTransition();
  const [error, setError] = useState("");
  const [uploadMessage, setUploadMessage] = useState("");
  const payeeName = getExpensePayeeName(expense);
  const defaults = useMemo<PayFormValues>(() => ({
    payee_bank: "",
    payee_account: "",
    method: "bank_transfer",
    paid_amount: String(expense.total_amount || ""),
    paid_at: new Date().toISOString().slice(0, 16),
    evidence_images: [],
    remark: "",
  }), [expense.total_amount]);
  const form = useForm<PayFormValues>({
    resolver: zodResolver(PayFormSchema as never) as Resolver<PayFormValues>,
    defaultValues: defaults,
  });

  function submit(values: PayFormValues) {
    if (!payeeName || payeeName === "-") {
      setError("申请中缺少可用于打款的收款人");
      return;
    }

    const paidAmount = Number(values.paid_amount);
    if (paidAmount.toFixed(2) !== Number(expense.total_amount || 0).toFixed(2)) {
      setError(`打款金额必须等于申请总额 ¥${formatMoney(expense.total_amount)}`);
      return;
    }

    const payload = {
      payee_name: payeeName,
      payee_bank: values.payee_bank.trim() || null,
      payee_account: values.payee_account.trim() || null,
      method: values.method,
      paid_amount: paidAmount,
      paid_at: new Date(values.paid_at).toISOString(),
      paid_by: currentEmployeeId,
      evidence_images: values.evidence_images,
      remark: values.remark.trim() || null,
    };

    setError("");
    startTransition(async () => {
      try {
        const data = await requestExpense({
          path: `/expense-requests/${expense.id}/pay`,
          method: "POST",
          payload,
        });
        onDone(data as ExpenseRecord);
      } catch (err) {
        setError(err instanceof Error ? err.message : "登记打款失败");
      }
    });
  }

  function handleEvidenceFiles(fileList: FileList | null) {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;

    const currentImages = form.getValues("evidence_images");
    if (currentImages.length + files.length > MAX_UPLOAD_FILES) {
      setError(`打款凭证最多上传 ${MAX_UPLOAD_FILES} 张`);
      return;
    }

    setError("");
    setUploadMessage("正在处理图片...");
    startUploadTransition(async () => {
      try {
        const urls = await uploadEvidenceImages(files);
        if (urls.length === 0) {
          throw new Error("上传完成但未返回图片地址");
        }
        const nextImages = [...form.getValues("evidence_images"), ...urls];
        form.setValue("evidence_images", nextImages, {
          shouldDirty: true,
          shouldValidate: true,
        });
        setUploadMessage(`已上传 ${nextImages.length} 张打款凭证`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "上传打款凭证失败");
        setUploadMessage("");
      }
    });
  }

  function removeEvidenceImage(index: number) {
    const nextImages = form.getValues("evidence_images").filter((_, itemIndex) => itemIndex !== index);
    form.setValue("evidence_images", nextImages, {
      shouldDirty: true,
      shouldValidate: true,
    });
    setUploadMessage(nextImages.length > 0 ? `已上传 ${nextImages.length} 张打款凭证` : "");
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[560px]">
        <DialogHeader>
          <DialogTitle>登记打款</DialogTitle>
          <DialogDescription>
            金额必须等于申请总额 ¥{formatMoney(expense.total_amount)}，打款凭证至少 1 张。
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={form.handleSubmit(submit)}>
          <FieldGroup className="grid gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel>收款人</FieldLabel>
              <div className="flex h-10 items-center rounded-md border border-input bg-muted/50 px-3 text-sm">
                {payeeName}
              </div>
            </Field>
            <Controller
              name="method"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="method">打款方式</FieldLabel>
                  <FormSelect
                    id="method"
                    value={field.value}
                    disabled={pending}
                    invalid={fieldState.invalid}
                    options={settlementMethodSelectOptions}
                    onChange={field.onChange}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            <Controller
              name="paid_amount"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="paid_amount">打款金额</FieldLabel>
                  <Input
                    {...field}
                    id="paid_amount"
                    type="number"
                    step="0.01"
                    disabled={pending}
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            <Controller
              name="paid_at"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="paid_at">打款时间</FieldLabel>
                  <Input
                    {...field}
                    id="paid_at"
                    type="datetime-local"
                    disabled={pending}
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            <Controller
              name="payee_bank"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="payee_bank">收款银行</FieldLabel>
                  <Input
                    {...field}
                    id="payee_bank"
                    disabled={pending}
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            <Controller
              name="payee_account"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="payee_account">收款账号</FieldLabel>
                  <Input
                    {...field}
                    id="payee_account"
                    disabled={pending}
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            <Controller
              name="evidence_images"
              control={form.control}
              render={({ fieldState }) => {
                const images = form.watch("evidence_images");
                return (
                <Field className="md:col-span-2" data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="evidence_images">打款凭证图片</FieldLabel>
                  <Input
                    id="evidence_images"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                    multiple
                    disabled={pending || uploading}
                    aria-invalid={fieldState.invalid}
                    onChange={(event) => {
                      handleEvidenceFiles(event.target.files);
                      event.target.value = "";
                    }}
                  />
                  {uploadMessage ? (
                    <div className="text-xs text-muted-foreground">{uploadMessage}</div>
                  ) : (
                    <div className="text-xs text-muted-foreground">
                      支持 JPG、PNG、WebP、HEIC；单张大于 1.5MB 会先压缩再上传。
                    </div>
                  )}
                  {images.length > 0 ? (
                    <div className="grid gap-2 sm:grid-cols-3">
                      {images.map((image, index) => (
                        <div key={image} className="overflow-hidden rounded-md border bg-background">
                          <img
                            src={getEvidenceImagePreviewSrc(image)}
                            alt={`打款凭证 ${index + 1}`}
                            className="h-24 w-full object-cover"
                          />
                          <div className="flex items-center justify-between gap-2 p-2">
                            <span className="truncate text-xs text-muted-foreground">
                              凭证 {index + 1}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={pending || uploading}
                              onClick={() => removeEvidenceImage(index)}
                            >
                              移除
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <FieldError errors={[fieldState.error]} />
                </Field>
              );
              }}
            />
            <Controller
              name="remark"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field className="md:col-span-2" data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="remark">备注</FieldLabel>
                  <Textarea
                    {...field}
                    id="remark"
                    disabled={pending}
                    aria-invalid={fieldState.invalid}
                    className="min-h-[72px]"
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
          </FieldGroup>
          {error ? (
            <StatusAlert>{error}</StatusAlert>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending || uploading}>
              取消
            </Button>
            <Button type="submit" disabled={pending || uploading}>
              {pending || uploading ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <WalletCards data-icon="inline-start" />}
              确认打款
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
