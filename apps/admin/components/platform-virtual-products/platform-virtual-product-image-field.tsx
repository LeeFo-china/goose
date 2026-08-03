"use client";

import { type ChangeEvent, useMemo, useRef, useState } from "react";
import { Upload } from "lucide-react";

import { StatusAlert } from "@/components/admin/status-alert";
import {
  validateVirtualGoodsImageForUpload,
} from "@/components/settings/platform-virtual-payment-image-upload";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { uploadDirectToCos } from "@/lib/cos-direct-upload";

import type { PlatformVirtualProductFormValues } from "./platform-virtual-product-types";

export function VirtualProductImageField({
  value,
  disabled,
  onChange,
}: {
  value: PlatformVirtualProductFormValues;
  disabled: boolean;
  onChange: (patch: Partial<PlatformVirtualProductFormValues>) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const preview = useMemo(() => value.imagePreviewUrl, [value.imagePreviewUrl]);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || disabled || uploading) return;

    setUploading(true);
    setError("");
    try {
      const validationError = await validateVirtualGoodsImageForUpload(file);
      if (validationError) {
        setError(validationError);
        return;
      }
      const uploaded = await uploadDirectToCos(file, {
        scene: "branding_virtual_goods",
        uploadErrorLabel: "虚拟商品图片",
        missingStorageMessage: "图片上传成功但未返回文件标识",
      });
      if (!uploaded.fileId) throw new Error("图片上传成功但未返回文件标识");
      onChange({
        imageFileId: uploaded.fileId,
        imagePreviewUrl: uploaded.publicUrl || uploaded.url || "",
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "商品图片上传失败");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Field className="md:col-span-2" data-disabled={disabled || uploading}>
      <FieldLabel>商品图片</FieldLabel>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/40">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="商品图片预览" className="size-full object-cover" />
          ) : (
            <span className="text-xs text-muted-foreground">200×200</span>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Input
            ref={inputRef}
            className="hidden"
            type="file"
            accept=".jpg,.jpeg,.png,image/jpeg,image/png"
            onChange={(event) => void handleFileChange(event)}
            disabled={disabled || uploading}
            aria-label="选择虚拟商品图片"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => inputRef.current?.click()}
              disabled={disabled || uploading}
            >
              {uploading ? <Spinner data-icon="inline-start" /> : <Upload data-icon="inline-start" />}
              {uploading ? "上传中" : value.imageFileId ? "更换图片" : "上传图片"}
            </Button>
            <span className="text-xs text-muted-foreground">
              JPG/PNG · 200×200 像素 · 不超过 2 MB
            </span>
          </div>
          {value.imageFileId ? (
            <span className="break-all text-xs text-muted-foreground">
              file_id：{value.imageFileId}
            </span>
          ) : null}
        </div>
      </div>
      {error ? <StatusAlert>{error}</StatusAlert> : null}
    </Field>
  );
}
