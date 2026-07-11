"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2 } from "lucide-react";

import { StatusAlert } from "@/components/admin/status-alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { uploadDirectToCos, validateUploadFile } from "@/lib/cos-direct-upload";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export function SiteContentImageField({
  id,
  value,
  onChange,
  disabled,
  error,
}: {
  id: string;
  value: { fileId: string; alt: string };
  onChange: (value: { fileId: string; alt: string }) => void;
  disabled?: boolean;
  error?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setUploadError("");
    setUploading(true);
    try {
      validateUploadFile(file, {
        allowedTypes: IMAGE_TYPES,
        maxSizeBytes: IMAGE_MAX_BYTES,
        typeMessage: "仅支持 JPG、PNG 或 WebP 图片",
        sizeMessage: "单张图片不能超过 5MB",
      });
      const result = await uploadDirectToCos(file, {
        scene: "picture_library",
        uploadErrorLabel: "上传官网图片",
        initFallbackMessage: "初始化官网图片直传失败",
        completeFallbackMessage: "登记官网图片失败",
      });
      if (!result.fileId) throw new Error("图片上传成功但未返回文件 ID");
      onChange({ fileId: result.fileId, alt: value.alt || file.name.replace(/\.[^.]+$/, "") });
    } catch (uploadFailure) {
      setUploadError(uploadFailure instanceof Error ? uploadFailure.message : "上传图片失败");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {uploadError ? <StatusAlert>{uploadError}</StatusAlert> : null}
      <Field data-invalid={Boolean(error)}>
        <FieldLabel htmlFor={`${id}-file-id`}>文件 ID</FieldLabel>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id={`${id}-file-id`}
            value={value.fileId}
            disabled={disabled || uploading}
            aria-invalid={Boolean(error)}
            placeholder="上传后自动填写，也可粘贴资料库文件 ID"
            onChange={(event) => onChange({ ...value, fileId: event.target.value })}
          />
          <input
            ref={inputRef}
            className="sr-only"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={disabled || uploading}
            onChange={(event) => void handleFile(event.target.files?.[0])}
          />
          <Button
            type="button"
            variant="outline"
            disabled={disabled || uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <ImagePlus data-icon="inline-start" />}
            {uploading ? "上传中" : "上传图片"}
          </Button>
        </div>
        <FieldDescription>内容只保存 fileId 和替代文本，不保存 URL 或图片尺寸。</FieldDescription>
        <FieldError>{error}</FieldError>
      </Field>
      <Field data-invalid={!value.alt.trim()}>
        <FieldLabel htmlFor={`${id}-alt`}>替代文本</FieldLabel>
        <Input
          id={`${id}-alt`}
          value={value.alt}
          disabled={disabled || uploading}
          aria-invalid={!value.alt.trim()}
          placeholder="描述图片传达的内容"
          onChange={(event) => onChange({ ...value, alt: event.target.value })}
        />
      </Field>
    </div>
  );
}
