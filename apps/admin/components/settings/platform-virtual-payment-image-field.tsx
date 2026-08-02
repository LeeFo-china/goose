"use client";

import {
  type ChangeEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { ImageIcon, Upload } from "lucide-react";

import { StatusAlert } from "@/components/admin/status-alert";
import {
  validateVirtualGoodsImageForUpload,
} from "@/components/settings/platform-virtual-payment-image-upload";
import { toSafeVirtualPaymentMutationMessage } from
  "@/components/settings/platform-virtual-payment-errors";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { uploadDirectToCos } from "@/lib/cos-direct-upload";

export function VirtualPaymentImageField({
  id,
  value,
  disabled,
  onChange,
  onPendingChange,
}: {
  id: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onPendingChange: (pending: boolean) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const localPreviewUrlRef = useRef("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => () => {
    if (localPreviewUrlRef.current) {
      URL.revokeObjectURL(localPreviewUrlRef.current);
    }
  }, []);

  function clearLocalPreview() {
    if (localPreviewUrlRef.current) {
      URL.revokeObjectURL(localPreviewUrlRef.current);
      localPreviewUrlRef.current = "";
    }
    setPreviewUrl("");
  }

  function showLocalPreview(file: File) {
    clearLocalPreview();
    const objectUrl = URL.createObjectURL(file);
    localPreviewUrlRef.current = objectUrl;
    setPreviewUrl(objectUrl);
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || disabled || uploading) return;

    setError("");
    setNotice("");
    setUploading(true);
    onPendingChange(true);
    try {
      const validationError = await validateVirtualGoodsImageForUpload(file);
      if (validationError) {
        setError(validationError);
        return;
      }
      showLocalPreview(file);
      const uploaded = await uploadDirectToCos(file, {
        scene: "branding_virtual_goods",
        uploadErrorLabel: "虚拟商品图片",
        missingStorageMessage: "图片上传成功但未返回公网地址",
      });
      const uploadedUrl = uploaded.publicUrl || uploaded.url;
      if (!uploadedUrl || !uploadedUrl.startsWith("https://")) {
        throw new Error("图片上传成功但未返回公网地址");
      }
      onChange(uploadedUrl);
      setNotice("图片已上传，请保存映射后再上传商品到微信。");
    } catch (caught) {
      clearLocalPreview();
      setError(toSafeVirtualPaymentMutationMessage(
        caught,
        "商品图片上传失败，请稍后重试。",
      ));
    } finally {
      setUploading(false);
      onPendingChange(false);
    }
  }

  function handleUrlChange(nextValue: string) {
    clearLocalPreview();
    setError("");
    setNotice("");
    onChange(nextValue);
  }

  const currentPreview = previewUrl || value.trim();
  return (
    <Field className="md:col-span-2" data-disabled={disabled || uploading}>
      <FieldLabel>商品图片</FieldLabel>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/40">
          {currentPreview ? (
            // The URL may be a newly uploaded COS object or an operator-owned CDN.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={currentPreview}
              alt="商品图片预览"
              className="size-full object-cover"
            />
          ) : (
            <ImageIcon className="size-6 text-muted-foreground" aria-hidden="true" />
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {!disabled ? (
            <div className="flex flex-wrap items-center gap-2">
              <Input
                ref={fileInputRef}
                className="hidden"
                type="file"
                accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                onChange={(event) => void handleFileChange(event)}
                disabled={uploading}
                aria-label="选择虚拟商品图片"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading
                  ? <Spinner data-icon="inline-start" />
                  : <Upload data-icon="inline-start" />}
                {uploading ? "上传中" : currentPreview ? "更换图片" : "选择图片"}
              </Button>
              <span className="text-xs text-muted-foreground">
                JPG/PNG · 200×200 像素 · 不超过 2 MB
              </span>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">
              JPG/PNG · 200×200 像素
            </span>
          )}
          <p className="text-xs text-muted-foreground">
            上传成功只会回填当前草稿，不会自动保存或提交微信。
          </p>
        </div>
      </div>
      {error ? <StatusAlert>{error}</StatusAlert> : null}
      {notice ? <StatusAlert tone="success">{notice}</StatusAlert> : null}
      <FieldLabel htmlFor={id}>或填写图片 URL（高级）</FieldLabel>
      <Input
        id={id}
        type="url"
        value={value}
        onChange={(event) => handleUrlChange(event.target.value)}
        disabled={disabled || uploading}
        placeholder="https://cdn.example.com/goods.png"
        required
      />
      <FieldDescription>
        使用长期可访问的 HTTPS JPG/JPEG/PNG 地址；本地上传会自动回填。
      </FieldDescription>
    </Field>
  );
}
