"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, PowerOff } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { PictureCategoryDialog } from "@/components/picture-library/picture-category-dialog";
import { requestPictureLibraryJson } from "@/components/picture-library/picture-library-requests";
import type {
  PictureAssetRecord,
  PictureCategoryRecord,
} from "@/components/picture-library/picture-library-types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { refreshAfterDialogClose } from "@/lib/deferred-refresh";

export function CreatePictureCategoryButton({ assets }: { assets: PictureAssetRecord[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <Plus data-icon="inline-start" />
        新建分类
      </Button>
      <PictureCategoryDialog mode="create" assets={assets} open={open} onOpenChange={setOpen} />
    </>
  );
}

export function EditPictureCategoryButton({
  category,
  assets,
}: {
  category: PictureCategoryRecord;
  assets: PictureAssetRecord[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Pencil data-icon="inline-start" />
        编辑
      </Button>
      <PictureCategoryDialog
        mode="edit"
        category={category}
        assets={assets}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}

export function DisablePictureCategoryButton({ category }: { category: PictureCategoryRecord }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const disabled = pending || category.status === "inactive";

  function run() {
    if (disabled) return;
    setError("");
    startTransition(async () => {
      try {
        await requestPictureLibraryJson(`/platform/picture-library/categories/${category.id}`, {
          method: "DELETE",
          fallbackMessage: "停用图片分类失败",
        });
        setOpen(false);
        refreshAfterDialogClose(router);
      } catch (err) {
        setError(err instanceof Error ? err.message : "停用图片分类失败");
      }
    });
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => setOpen(true)}>
        <PowerOff data-icon="inline-start" />
        停用
      </Button>
      <Dialog open={open} onOpenChange={(nextOpen) => {
        if (pending) return;
        setOpen(nextOpen);
        if (!nextOpen) setError("");
      }}>
        <DialogContent className="max-w-[420px]">
          <DialogHeader>
            <DialogTitle>停用图片分类</DialogTitle>
            <DialogDescription>
              确认停用「{category.name}」吗？已关联图片不会删除。
            </DialogDescription>
          </DialogHeader>
          {error ? <StatusAlert>{error}</StatusAlert> : null}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button type="button" disabled={pending} onClick={run}>
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              确认停用
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
