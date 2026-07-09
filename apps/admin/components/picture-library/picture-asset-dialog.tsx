"use client";

import { type ChangeEvent, type FormEvent, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2 } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { buildPictureAssetCreatePayload } from "@/components/picture-library/picture-asset-dialog-utils";
import { requestPictureLibraryJson } from "@/components/picture-library/picture-library-requests";
import type {
  PictureAssetRecord,
  PictureCategoryRecord,
} from "@/components/picture-library/picture-library-types";
import { getAssetPreviewUrl } from "@/components/picture-library/picture-library-utils";
import { Badge } from "@/components/ui/badge";
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
import { cn } from "@/lib/utils";

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_PREVIEW_TILE_COUNT = 4;

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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [progressText, setProgressText] = useState("");
  const busy = pending || submitting;
  const selectedFileCount = files.length;
  const selectedCategoryIds = useMemo(
    () => new Set((asset?.categories || []).map((item) => item.id)),
    [asset],
  );

  useEffect(() => {
    if (!open) return;
    setError("");
    setFiles([]);
    setProgressText("");
  }, [asset, open]);

  useEffect(() => {
    if (files.length === 0) {
      setPreviewUrls(asset ? [getAssetPreviewUrl(asset)].filter(Boolean) : []);
      return undefined;
    }

    const previewLimit = files.length > MAX_PREVIEW_TILE_COUNT
      ? MAX_PREVIEW_TILE_COUNT - 1
      : MAX_PREVIEW_TILE_COUNT;
    const nextPreviewUrls = files.slice(0, previewLimit).map((item) => URL.createObjectURL(item));
    setPreviewUrls(nextPreviewUrls);
    return () => {
      nextPreviewUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [asset, files]);

  function close() {
    if (busy) return;
    setError("");
    onOpenChange(false);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files ?? []);
    if (selectedFiles.length === 0) {
      setFiles([]);
      return;
    }

    try {
      selectedFiles.forEach((selectedFile) => {
        validateUploadFile(selectedFile, {
          allowedTypes: ALLOWED_IMAGE_TYPES,
          maxSizeBytes: MAX_IMAGE_SIZE_BYTES,
          typeMessage: "仅支持 jpg、png、webp 图片",
          sizeMessage: "单张图片不能超过 5MB",
        });
      });
      setError("");
      setFiles(selectedFiles);
    } catch (err) {
      event.target.value = "";
      setFiles([]);
      const message = err instanceof Error ? err.message : "图片文件不符合要求";
      const invalidFile = selectedFiles.find((item) =>
        item.size > MAX_IMAGE_SIZE_BYTES || !ALLOWED_IMAGE_TYPES.has(item.type)
      );
      setError(`${invalidFile?.name || "图片文件"}：${message}`);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const filesToUpload = files;
    if (mode === "create" && filesToUpload.length === 0) {
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
    setProgressText("");
    startTransition(() => {
      void submitPictureAsset(basePayload, filesToUpload);
    });
  }

  async function submitPictureAsset(
    basePayload: {
      title: string;
      description: string | null;
      sort_order: number;
      status: string;
      category_ids: string[];
    },
    filesToUpload: File[],
  ) {
    setSubmitting(true);
    let createdCount = 0;
    try {
      if (mode === "create") {
        for (const [index, selectedFile] of filesToUpload.entries()) {
          const itemLabel = `${index + 1}/${filesToUpload.length}`;
          setProgressText(`正在上传 ${itemLabel}：${selectedFile.name}`);
          const fileObjectId = await uploadPictureFile(selectedFile);
          setProgressText(`正在创建 ${itemLabel}：${selectedFile.name}`);
          await requestPictureLibraryJson(
            "/platform/picture-library/assets",
            {
              method: "POST",
              body: JSON.stringify(buildPictureAssetCreatePayload({
                basePayload,
                fileName: selectedFile.name,
                fileObjectId,
                index,
                total: filesToUpload.length,
              })),
              fallbackMessage: "保存图片失败",
            },
          );
          createdCount += 1;
        }
      } else {
        await requestPictureLibraryJson(
          `/platform/picture-library/assets/${asset?.id}`,
          {
            method: "PATCH",
            body: JSON.stringify(basePayload),
            fallbackMessage: "保存图片失败",
          },
        );
      }

      setProgressText("");
      onOpenChange(false);
      refreshAfterDialogClose(router);
    } catch (err) {
      const message = err instanceof Error ? err.message : "保存图片失败";
      setProgressText("");
      if (createdCount > 0) {
        setError(`已创建 ${createdCount} 张，${message}`);
        refreshAfterDialogClose(router);
      } else {
        setError(message);
      }
    } finally {
      setSubmitting(false);
    }
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

  const previewOverflowCount = selectedFileCount - previewUrls.length;

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
              {previewUrls.length > 0 ? (
                <div
                  className={cn(
                    "grid size-full gap-1 p-1",
                    previewUrls.length > 1 ? "grid-cols-2" : "grid-cols-1",
                  )}
                >
                  {previewUrls.map((previewUrl, index) => (
                    <div
                      key={`${previewUrl}-${index}`}
                      className="min-w-0 overflow-hidden rounded bg-background"
                    >
                      <img src={previewUrl} alt="图片预览" className="size-full object-cover" />
                    </div>
                  ))}
                  {previewOverflowCount > 0 ? (
                    <div className="flex min-w-0 items-center justify-center rounded bg-background text-sm text-muted-foreground">
                      +{previewOverflowCount}
                    </div>
                  ) : null}
                </div>
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
                    disabled={busy}
                    required
                    multiple
                    onChange={handleFileChange}
                  />
                  <FieldDescription>支持 jpg、png、webp，单张不超过 5MB，可一次选择多张。</FieldDescription>
                  {files.length > 0 ? (
                    <div className="flex flex-col gap-2 rounded-md border bg-muted/40 p-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">已选 {files.length} 张</Badge>
                        <span className="text-xs text-muted-foreground">将逐张上传并创建资料库图片</span>
                      </div>
                      <div className="flex max-h-24 flex-col gap-1 overflow-auto">
                        {files.slice(0, 6).map((item) => (
                          <span
                            key={`${item.name}-${item.size}`}
                            className="truncate text-xs"
                            title={item.name}
                          >
                            {item.name}
                          </span>
                        ))}
                        {files.length > 6 ? (
                          <span className="text-xs text-muted-foreground">还有 {files.length - 6} 张未显示</span>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                  {progressText ? <FieldDescription>{progressText}</FieldDescription> : null}
                </Field>
              ) : null}
              <Field>
                <FieldLabel htmlFor={`${mode}-picture-title`}>
                  {mode === "create" ? "标题（选填）" : "标题"}
                </FieldLabel>
                <Input
                  id={`${mode}-picture-title`}
                  name="title"
                  defaultValue={asset?.title || ""}
                  maxLength={120}
                  required={mode === "edit"}
                  disabled={busy}
                  placeholder={mode === "create" ? "留空则使用文件名" : undefined}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${mode}-picture-description`}>说明</FieldLabel>
                <Textarea
                  id={`${mode}-picture-description`}
                  name="description"
                  defaultValue={asset?.description || ""}
                  maxLength={1000}
                  disabled={busy}
                />
              </Field>
            </FieldGroup>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <Field>
              <FieldLabel>状态</FieldLabel>
              <Select name="status" defaultValue={asset?.status || "draft"} disabled={busy}>
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
                disabled={busy}
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
                    disabled={busy || category.status !== "active"}
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
            <Button type="button" variant="outline" disabled={busy} onClick={close}>
              取消
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              {mode === "create" && selectedFileCount > 1 ? `保存 ${selectedFileCount} 张` : "保存"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
