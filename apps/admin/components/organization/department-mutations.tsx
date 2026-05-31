"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Edit3, Loader2, Plus, PowerOff } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { DepartmentRecord } from "@/components/organization/organization-types";
import { DepartmentDialog } from "@/components/organization/department-dialog";
import { mutateDepartment } from "@/components/organization/department-mutation-shared";
import { EnableDepartmentsDialog } from "@/components/organization/enable-departments-dialog";
import { refreshAfterDialogClose } from "@/lib/deferred-refresh";

export function EnableDepartmentButton({
  enabledDepartmentCodes,
  onEnabled,
}: {
  enabledDepartmentCodes: string[];
  onEnabled?: (codes: string[]) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus data-icon="inline-start" />
        启用部门
      </Button>
      <EnableDepartmentsDialog
        enabledDepartmentCodes={enabledDepartmentCodes}
        open={open}
        onOpenChange={setOpen}
        onEnabled={onEnabled}
      />
    </>
  );
}

export function DepartmentRowActions({
  department,
  onDisabled,
}: {
  department: DepartmentRecord;
  onDisabled?: (code: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const router = useRouter();

  function closeDisableDialog() {
    if (pending) return;
    setError("");
    setDisableOpen(false);
  }

  function disableDepartment() {
    setError("");
    startTransition(async () => {
      try {
        await mutateDepartment({
          method: "PATCH",
          id: department.id,
          payload: { enabled: false },
        });
        if (department.code) {
          onDisabled?.(department.code);
        }
        setDisableOpen(false);
        refreshAfterDialogClose(router);
      } catch (err) {
        setError(err instanceof Error ? err.message : "停用部门失败");
      }
    });
  }

  return (
    <div className="flex justify-end gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => setOpen(true)}
      >
        <Edit3 data-icon="inline-start" />
        编辑
      </Button>
      {department.enabled === false ? null : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => setDisableOpen(true)}
        >
          {pending ? (
            <Loader2 className="animate-spin" data-icon="inline-start" />
          ) : (
            <PowerOff data-icon="inline-start" />
          )}
          停用
        </Button>
      )}
      <DepartmentDialog
        department={department}
        open={open}
        onOpenChange={setOpen}
      />
      <AlertDialog
        open={disableOpen}
        onOpenChange={(nextOpen) => (nextOpen ? setDisableOpen(true) : closeDisableDialog())}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>停用部门</AlertDialogTitle>
            <AlertDialogDescription>
              停用后，{department.name || "该部门"} 将从部门列表、员工和岗位新增候选中移除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error ? <StatusAlert>{error}</StatusAlert> : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(event) => {
                event.preventDefault();
                disableDepartment();
              }}
            >
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              确认停用
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
