"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Edit3, Loader2, Plus, Power, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getTenantDepartmentOptionValue,
  mutatePost,
  PostDialog,
  type PostDepartmentOption,
} from "@/components/organization/post-dialog";
import type { PostRecord } from "@/components/organization/organization-types";

export function CreatePostButton({
  departments = [],
  defaultDepartmentId = "",
  lockDepartment = false,
  disabled = false,
  label = "新增岗位",
}: {
  departments?: PostDepartmentOption[];
  defaultDepartmentId?: string;
  lockDepartment?: boolean;
  disabled?: boolean;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const writableDepartmentCount = useMemo(
    () => departments.filter((department) => getTenantDepartmentOptionValue(department)).length,
    [departments],
  );

  return (
    <>
      <Button
        type="button"
        disabled={disabled || writableDepartmentCount === 0}
        onClick={() => setOpen(true)}
      >
        <Plus data-icon="inline-start" />
        {label}
      </Button>
      <PostDialog
        mode="create"
        departments={departments}
        defaultDepartmentId={defaultDepartmentId}
        lockDepartment={lockDepartment}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}

export function PostRowActions({
  post,
}: {
  post: PostRecord;
}) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const enabled = post.status !== 0;

  function toggleStatus() {
    startTransition(async () => {
      try {
        await mutatePost({
          method: "PATCH",
          id: post.id,
          payload: { status: enabled ? 0 : 1 },
        });
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "岗位状态更新失败");
      }
    });
  }

  return (
    <div className="flex justify-end gap-1">
      <Button type="button" variant="ghost" size="sm" onClick={() => setDialogOpen(true)}>
        <Edit3 data-icon="inline-start" />
        编辑
      </Button>
      <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={toggleStatus}>
        {pending ? (
          <Loader2 className="animate-spin" data-icon="inline-start" />
        ) : enabled ? (
          <Power data-icon="inline-start" />
        ) : (
          <RotateCcw data-icon="inline-start" />
        )}
        {enabled ? "停用" : "启用"}
      </Button>
      <PostDialog
        mode="edit"
        post={post}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  );
}
