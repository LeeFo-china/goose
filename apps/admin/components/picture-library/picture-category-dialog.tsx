"use client";

import { type FormEvent, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImageUp, Loader2 } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import type {
  PictureAssetRecord,
  PictureCategoryRecord,
} from "@/components/picture-library/picture-library-types";
import { generatePictureSlug } from "@/components/picture-library/picture-library-utils";
import { requestPictureLibraryJson } from "@/components/picture-library/picture-library-requests";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
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
import { refreshAfterDialogClose } from "@/lib/deferred-refresh";

export type PictureCategoryDialogMode = "create" | "edit";

function optionalString(formData: FormData, key: string) {
  const value = String(formData.get(key) || "").trim();
  return value || undefined;
}

export function PictureCategoryDialog({
  mode,
  category,
  assets,
  open,
  onOpenChange,
}: {
  mode: PictureCategoryDialogMode;
  category?: PictureCategoryRecord;
  assets: PictureAssetRecord[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const defaults = useMemo(() => ({
    name: category?.name || "",
    slug: category?.slug || "",
    description: category?.description || "",
    sort_order: String(category?.sort_order ?? 100),
    cover_asset_id: category?.cover_asset_id || "none",
    status: category?.status || "active",
  }), [category]);
  const [slug, setSlug] = useState(defaults.slug);

  useEffect(() => {
    if (!open) return;
    setError("");
    setSlug(mode === "create" ? generatePictureSlug("style") : defaults.slug);
  }, [defaults.slug, mode, open]);

  function close() {
    if (pending) return;
    setError("");
    onOpenChange(false);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const coverAssetId = optionalString(formData, "cover_asset_id");
    const payload = {
      name: String(formData.get("name") || "").trim(),
      slug,
      description: optionalString(formData, "description") ?? null,
      sort_order: Number(formData.get("sort_order") || 100),
      cover_asset_id: coverAssetId === "none" ? null : coverAssetId,
      status: String(formData.get("status") || "active"),
    };

    setError("");
    startTransition(async () => {
      try {
        await requestPictureLibraryJson(
          mode === "create"
            ? "/platform/picture-library/categories"
            : `/platform/picture-library/categories/${category?.id}`,
          {
            method: mode === "create" ? "POST" : "PATCH",
            body: JSON.stringify(payload),
            fallbackMessage: "保存图片分类失败",
          },
        );
        onOpenChange(false);
        refreshAfterDialogClose(router);
      } catch (err) {
        setError(err instanceof Error ? err.message : "保存图片分类失败");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-[560px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-md bg-accent text-accent-foreground">
              <ImageUp />
            </div>
            <div>
              <DialogTitle>{mode === "create" ? "新建图片分类" : "编辑图片分类"}</DialogTitle>
              <DialogDescription>分类用于小程序首页按风格组织封面图。</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {error ? <StatusAlert>{error}</StatusAlert> : null}

        <form className="flex flex-col gap-4" onSubmit={submit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`${mode}-picture-category-name`}>分类名称</FieldLabel>
              <Input
                id={`${mode}-picture-category-name`}
                name="name"
                defaultValue={defaults.name}
                maxLength={80}
                required
                disabled={pending}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${mode}-picture-category-slug`}>分类标识</FieldLabel>
              <Input
                id={`${mode}-picture-category-slug`}
                value={slug}
                onChange={(event) => setSlug(event.target.value)}
                pattern="[a-z0-9][a-z0-9_-]*[a-z0-9]"
                maxLength={80}
                required
                disabled={pending}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${mode}-picture-category-description`}>说明</FieldLabel>
              <Textarea
                id={`${mode}-picture-category-description`}
                name="description"
                defaultValue={defaults.description}
                maxLength={500}
                disabled={pending}
              />
            </Field>
            <div className="grid gap-3 md:grid-cols-3">
              <Field>
                <FieldLabel htmlFor={`${mode}-picture-category-sort`}>排序</FieldLabel>
                <Input
                  id={`${mode}-picture-category-sort`}
                  name="sort_order"
                  type="number"
                  min={0}
                  max={999999}
                  defaultValue={defaults.sort_order}
                  disabled={pending}
                />
              </Field>
              <Field>
                <FieldLabel>状态</FieldLabel>
                <Select name="status" defaultValue={defaults.status} disabled={pending}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="active">启用</SelectItem>
                      <SelectItem value="inactive">停用</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>封面图片</FieldLabel>
                <Select name="cover_asset_id" defaultValue={defaults.cover_asset_id} disabled={pending}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="none">自动使用分类图片</SelectItem>
                      {assets.map((asset) => (
                        <SelectItem key={asset.id} value={asset.id}>{asset.title}</SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </FieldGroup>
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
