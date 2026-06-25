"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Edit3, Loader2, Plus, Trash2 } from "lucide-react";
import { ConfirmActionDialog } from "@/components/admin/action-dialogs";
import { Button } from "@/components/ui/button";
import { EmployeeDialog } from "@/components/employees/employee-dialog";
import {
  mutateEmployee,
  type RoleOption,
} from "@/components/employees/employee-mutation-shared";
import { ManageEmployeeRolesButton } from "@/components/employees/employee-roles-dialog";
import type {
  EmployeeDepartmentOption,
  EmployeeMutationRecord,
  EmployeePostOption,
} from "@/components/employees/employee-types";
import { refreshAfterDialogClose } from "@/lib/deferred-refresh";

export type {
  EmployeeDepartmentOption,
  EmployeeMutationRecord,
  EmployeePostOption,
} from "@/components/employees/employee-types";
export function CreateEmployeeButton({
  departments,
  posts,
  roles,
}: {
  departments: EmployeeDepartmentOption[];
  posts: EmployeePostOption[];
  roles: RoleOption[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus />
        新增员工
      </Button>
      <EmployeeDialog
        mode="create"
        departments={departments}
        posts={posts}
        roles={roles}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}

export function EmployeeRowActions({
  employee,
  departments,
  posts,
  onChanged,
}: {
  employee: EmployeeMutationRecord;
  departments: EmployeeDepartmentOption[];
  posts: EmployeePostOption[];
  onChanged?: () => void;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, startDeleting] = useTransition();
  const [error, setError] = useState("");

  function remove() {
    setError("");
    startDeleting(async () => {
      try {
        await mutateEmployee({
          method: "DELETE",
          id: employee.id,
        });
        setDeleteOpen(false);
        if (onChanged) {
          onChanged();
        } else {
          refreshAfterDialogClose(router);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "删除失败");
      }
    });
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <ManageEmployeeRolesButton employee={employee} onSaved={onChanged} />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setEditOpen(true)}
      >
        <Edit3 />
        编辑
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setDeleteOpen(true)}
        disabled={deleting || employee.status === "leaved"}
        title={employee.status === "leaved" ? "员工已离职" : "删除员工"}
      >
        {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
        删除
      </Button>
      <EmployeeDialog
        mode="edit"
        employee={employee}
        departments={departments}
        posts={posts}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={onChanged}
      />
      <ConfirmActionDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="删除员工"
        description={`确认删除员工「${employee.name || "未命名员工"}」？该操作会将员工置为已离职并解绑登录账号。`}
        confirmLabel="确认删除"
        destructive
        pending={deleting}
        onConfirm={remove}
      />
      {error ? (
        <div className="absolute right-5 mt-10 rounded-md border border-destructive/50 bg-background px-3 py-2 text-xs text-destructive shadow-sm">
          {error}
        </div>
      ) : null}
    </div>
  );
}
