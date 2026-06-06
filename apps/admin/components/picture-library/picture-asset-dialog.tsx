"use client";

import { type ChangeEvent, type FormEvent, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2 } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { requestPictureLibraryJson } from "@/components/picture-library/picture-library-requests";
import type {
  PictureAssetRecord,
  PictureCategoryRecord,
} from "@/components/picture-library/picture-library-types";
import { getAssetPreviewUrl } from "@/components/picture-library/picture-library-utils";
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
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  uploadDirectToCos,
  validateUploadFile,
} from "@/lib/cos-direct-upload";
import { refreshAfterDialogClose } from "@/lib/deferred-refresh";

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

export type PictureAssetDialogMode = "create" | "edit";

function optionalString(formData: FormData, key: string) {
  const value = String(formData.get(key) || "").trim();
  return value || undefined;
}

function checkedCategoryIds(formData: FormData) {
  return formData.getAll("category_ids")
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

export function PictureAssetDialog({
  mode,
  asset,
  categories,
  open,
  onOpenChange,
}: {
  mode: PictureAssetDialogMode;
  asset?: PictureAssetRecord;
  categories: PictureCategoryRecord[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const selectedCategoryIds = useMemo(
    () => new Set((asset?.categories || []).map((item) => item.id)),
    [asset],
  );

  useEffect(() => {
    if (!open) return;
    setError("");
    setFile(null);
    setPreviewUrl(asset ? getAssetPreviewUrl(asset) : "");
  }, [asset, open]);

  useEffect(() => {
    if (!file) return undefined;
    const nextPreviewUrl = URL.createObjectURL(file);
    setPreviewUrl(nextPreviewUrl);
    return () => URL.revokeObjectURL(nextPreviewUrl);
  }, [file]);

  function close() {
    if (pending) return;
    setError("");
    onOpenChange(false);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0] ?? null;
    if (!selectedFile) {
      setFile(null);
      setPreviewUrl(asset ? getAssetPreviewUrl(asset) : "");
      return;
    }

    try {
      validateUploadFile(selectedFile, {
        allowedTypes: ALLOWED_IMAGE_TYPES,
        maxSizeBytes: MAX_IMAGE_SIZE_BYTES,
        typeMessage: "仅支持 jpg、png、webp 图片",
        sizeMessage: "单张图片不能超过 5MB",
      });
      setError("");
      setFile(selectedFile);
    } catch (err) {
      event.target.value = "";
      setFile(null);
      setError(err instanceof Error ? err.message : "图片文件不符合要求");
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode === "create" && !file) {
      setError("请选择要上传的图片");
      return;
    }

    const formData = new FormData(event.currentTarget);
    const basePayload = {
      title: String(formData.get("title") || "").trim(),
      description: optionalString(formData, "description") ?? null,
      sort_order: Number(formData.get("sort_order") || 100),
      status: String(formData.get("status") || "draft"),
      category_ids: checkedCategoryIds(formData),
    };

    setError("");
    startTransition(async () => {
      try {
        const payload = mode === "create"
          ? {
            ...basePayload,
            file_object_id: await uploadPictureFile(file as File),
          }
          : basePayload;
        await requestPictureLibraryJson(
          mode === "create"
            ? "/platform/picture-library/assets"
            : `/platform/picture-library/assets/${asset?.id}`,
          {
            method: mode === "create" ? "POST" : "PATCH",
            body: JSON.stringify(payload),
            fallbackMessage: "保存图片失败",
          },
        );
        onOpenChange(false);
        refreshAfterDialogClose(router);
      } catch (err) {
        setError(err instanceof Error ? err.message : "保存图片失败");
      }
    });
  }

  async function uploadPictureFile(input: File) {
    const result = await uploadDirectToCos(input, {
      scene: "picture_library",
      initFallbackMessage: "初始化图片直传失败",
      completeFallbackMessage: "登记图片直传结果失败",
      uploadErrorLabel: "上传资料库图片",
    });
    if (!result.fileId) {
      throw new Error("图片上传成功但未返回文件 ID");
    }
    return result.fileId;
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-[680px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-md bg-accent text-accent-foreground">
              <ImagePlus />
            </div>
            <div>
              <DialogTitle>{mode === "create" ? "上传资料库图片" : "编辑资料库图片"}</DialogTitle>
              <DialogDescription>图片发布后可进入 visitor 首页分类展示。</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {error ? <StatusAlert>{error}</StatusAlert> : null}

        <form className="flex flex-col gap-4" onSubmit={submit}>
          <div className="grid gap-4 md:grid-cols-[180px_1fr]">
            <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md border bg-muted">
              {previewUrl ? (
                <img src={previewUrl} alt="图片预览" className="size-full object-cover" />
              ) : (
                <span className="text-sm text-muted-foreground">等待选择图片</span>
              )}
            </div>
            <FieldGroup>
              {mode === "create" ? (
                <Field>
                  <FieldLabel htmlFor="picture-library-file">图片文件</FieldLabel>
                  <Input
                    id="picture-library-file"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={pending}
                    required
                    onChange={handleFileChange}
                  />
                  <FieldDescription>支持 jpg、png、webp，单张不超过 5MB。</FieldDescription>
                </Field>
              ) : null}
              <Field>
                <FieldLabel htmlFor={`${mode}-picture-title`}>标题</FieldLabel>
                <Input
                  id={`${mode}-picture-title`}
                  name="title"
                  defaultValue={asset?.title || ""}
                  maxLength={120}
                  required
                  disabled={pending}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${mode}-picture-description`}>说明</FieldLabel>
                <Textarea
                  id={`${mode}-picture-description`}
                  name="description"
                  defaultValue={asset?.description || ""}
                  maxLength={1000}
                  disabled={pending}
                />
              </Field>
            </FieldGroup>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <Field>
              <FieldLabel>状态</FieldLabel>
              <Select name="status" defaultValue={asset?.status || "draft"} disabled={pending}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="draft">草稿</SelectItem>
                    <SelectItem value="published">发布</SelectItem>
                    <SelectItem value="hidden">隐藏</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor={`${mode}-picture-sort`}>排序</FieldLabel>
              <Input
                id={`${mode}-picture-sort`}
                name="sort_order"
                type="number"
                min={0}
                max={999999}
                defaultValue={asset?.sort_order ?? 100}
                disabled={pending}
              />
            </Field>
          </div>

          <Field>
            <FieldLabel>关联分类</FieldLabel>
            <div className="grid gap-2 rounded-md border p-3 md:grid-cols-3">
              {categories.map((category) => (
                <label key={category.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    name="category_ids"
                    value={category.id}
                    defaultChecked={selectedCategoryIds.has(category.id)}
                    disabled={pending || category.status !== "active"}
                  />
                  <span className="truncate">{category.name}</span>
                </label>
              ))}
              {categories.length === 0 ? (
                <span className="text-sm text-muted-foreground">请先创建分类</span>
              ) : null}
            </div>
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={close}>
              取消
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              保存
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
