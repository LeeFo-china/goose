"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Edit3, Loader2, Plus, Power, RotateCcw } from "lucide-react";
import { ConfirmActionDialog } from "@/components/admin/action-dialogs";
import { Button } from "@/components/ui/button";
import { PermissionDialog } from "@/components/permissions/permission-dialog";
import { mutatePermission } from "@/components/permissions/permission-mutation-shared";
import type { PermissionRecord } from "@/components/permissions/permission-types";
import { refreshAfterDialogClose } from "@/lib/deferred-refresh";

export type { PermissionRecord } from "@/components/permissions/permission-types";
export function CreatePermissionButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus />
        新增权限
      </Button>
      <PermissionDialog mode="create" open={open} onOpenChange={setOpen} />
    </>
  );
}

export function PermissionRowActions({
  permission,
}: {
  permission: PermissionRecord;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [statusAction, setStatusAction] = useState<"active" | "inactive" | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const disabled = pending;

  function setStatus(status: "active" | "inactive") {
    setError("");
    startTransition(async () => {
      try {
        if (status === "inactive") {
          await mutatePermission({ method: "DELETE", id: permission.id });
        } else {
          await mutatePermission({
            method: "PATCH",
            id: permission.id,
            payload: { status: "active" },
          });
        }
        setStatusAction(null);
        refreshAfterDialogClose(router);
      } catch (err) {
        setError(err instanceof Error ? err.message : "操作失败");
      }
    });
  }

  return (
    <div className="flex min-w-[156px] flex-nowrap items-center justify-end gap-2 whitespace-nowrap">
      <Button type="button" variant="outline" size="sm" onClick={() => setEditOpen(true)}>
        <Edit3 />
        编辑
      </Button>
      {permission.status === "inactive" ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => setStatusAction("active")}
        >
          {pending ? <Loader2 className="animate-spin" /> : <RotateCcw />}
          恢复
        </Button>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => setStatusAction("inactive")}
        >
          {pending ? <Loader2 className="animate-spin" /> : <Power />}
          停用
        </Button>
      )}
      <PermissionDialog
        mode="edit"
        permission={permission}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      <ConfirmActionDialog
        open={statusAction !== null}
        onOpenChange={(open) => setStatusAction(open ? statusAction : null)}
        title={statusAction === "inactive" ? "停用权限" : "恢复权限"}
        description={
          statusAction === "inactive"
            ? `确认停用权限「${permission.name || permission.code}」？`
            : `确认恢复权限「${permission.name || permission.code}」？`
        }
        confirmLabel={statusAction === "inactive" ? "确认停用" : "确认恢复"}
        destructive={statusAction === "inactive"}
        pending={pending}
        onConfirm={() => {
          if (statusAction) setStatus(statusAction);
        }}
      />
      {error ? (
        <div className="absolute right-5 mt-10 rounded-md border border-destructive/50 bg-background px-3 py-2 text-xs text-destructive shadow-sm">
          {error}
        </div>
      ) : null}
    </div>
  );
}
