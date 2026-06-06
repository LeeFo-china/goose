"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { EyeOff, Loader2, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { PictureAssetDialog } from "@/components/picture-library/picture-asset-dialog";
import { requestPictureLibraryJson } from "@/components/picture-library/picture-library-requests";
import type {
  PictureAssetRecord,
  PictureCategoryRecord,
} from "@/components/picture-library/picture-library-types";
import { Button } from "@/components/ui/button";
import { refreshAfterDialogClose } from "@/lib/deferred-refresh";

export function CreatePictureAssetButton({ categories }: { categories: PictureCategoryRecord[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus data-icon="inline-start" />
        上传图片
      </Button>
      <PictureAssetDialog mode="create" categories={categories} open={open} onOpenChange={setOpen} />
    </>
  );
}

export function EditPictureAssetButton({
  asset,
  categories,
}: {
  asset: PictureAssetRecord;
  categories: PictureCategoryRecord[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Pencil data-icon="inline-start" />
        编辑
      </Button>
      <PictureAssetDialog
        mode="edit"
        asset={asset}
        categories={categories}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}

export function PictureAssetStatusButton({
  asset,
  action,
}: {
  asset: PictureAssetRecord;
  action: "publish" | "hide";
}) {
  const Icon = action === "publish" ? Upload : EyeOff;
  const label = action === "publish" ? "发布" : "隐藏";
  const disabled = action === "publish" ? asset.status === "published" : asset.status === "hidden";
  return (
    <PictureAssetMutationButton
      asset={asset}
      path={`/platform/picture-library/assets/${asset.id}/${action}`}
      label={label}
      icon={Icon}
      disabled={disabled}
      fallbackMessage={`${label}图片失败`}
    />
  );
}

export function DeletePictureAssetButton({ asset }: { asset: PictureAssetRecord }) {
  return (
    <PictureAssetMutationButton
      asset={asset}
      path={`/platform/picture-library/assets/${asset.id}`}
      method="DELETE"
      label="删除"
      icon={Trash2}
      fallbackMessage="删除图片失败"
    />
  );
}

function PictureAssetMutationButton({
  path,
  method = "POST",
  label,
  icon: Icon,
  disabled = false,
  fallbackMessage,
}: {
  asset: PictureAssetRecord;
  path: string;
  method?: "POST" | "DELETE";
  label: string;
  icon: typeof Upload;
  disabled?: boolean;
  fallbackMessage: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function run() {
    if (pending || disabled) return;
    setError("");
    startTransition(async () => {
      try {
        await requestPictureLibraryJson(path, { method, fallbackMessage });
        refreshAfterDialogClose(router);
      } catch (err) {
        setError(err instanceof Error ? err.message : fallbackMessage);
      }
    });
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <Button type="button" variant="outline" size="sm" disabled={pending || disabled} onClick={run}>
        {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Icon data-icon="inline-start" />}
        {label}
      </Button>
      {error ? <span className="max-w-32 text-xs text-destructive">{error}</span> : null}
    </span>
  );
}
