"use client";

import { FormEvent, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Edit3, Loader2, Plus, Trash2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type EmployeeStatus = "pending" | "active" | "suspended" | "leaved";

export type EmployeeMutationRecord = {
  id: string;
  name: string | null;
  phone: string | null;
  status: EmployeeStatus | string | null;
  avatar: string | null;
};

type MutationMode = "create" | "edit";

const statusOptions: Array<{ label: string; value: EmployeeStatus }> = [
  { label: "在职", value: "active" },
  { label: "待入职", value: "pending" },
  { label: "已封禁", value: "suspended" },
  { label: "已离职", value: "leaved" },
];

function getPayloadMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }

  return fallback;
}

async function mutateEmployee(input: {
  method: "POST" | "PATCH" | "DELETE";
  id?: string;
  payload?: unknown;
}) {
  const response = await fetch(
    input.id ? `/api/backend/employees/${input.id}` : "/api/backend/employees",
    {
      method: input.method,
      headers: input.payload ? { "content-type": "application/json" } : undefined,
      body: input.payload ? JSON.stringify(input.payload) : undefined,
    },
  );
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.success === false) {
    throw new Error(getPayloadMessage(payload, "操作失败"));
  }

  return payload;
}

function EmployeeDialog({
  mode,
  employee,
  open,
  onOpenChange,
}: {
  mode: MutationMode;
  employee?: EmployeeMutationRecord;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const title = mode === "create" ? "新增员工" : "编辑员工";
  const submitText = mode === "create" ? "创建员工" : "保存修改";

  const defaults = useMemo(() => ({
    name: employee?.name || "",
    phone: employee?.phone || "",
    avatar: employee?.avatar || "",
    status: (employee?.status || "active") as EmployeeStatus,
  }), [employee]);

  if (!open) {
    return null;
  }

  function close() {
    if (pending) return;
    setError("");
    onOpenChange(false);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") || "").trim();
    const phone = String(formData.get("phone") || "").trim();
    const avatar = String(formData.get("avatar") || "").trim();
    const status = String(formData.get("status") || "active");

    const payload = {
      name,
      phone: phone || null,
      avatar: avatar || null,
      status,
    };

    setError("");
    startTransition(async () => {
      try {
        await mutateEmployee({
          method: mode === "create" ? "POST" : "PATCH",
          id: employee?.id,
          payload,
        });
        onOpenChange(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "操作失败");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-4">
      <div className="w-full max-w-[480px] rounded-lg border bg-card shadow-[0_20px_80px_rgba(15,23,42,0.22)]">
        <div className="border-b p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-accent text-accent-foreground">
              <UserRound className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold">{title}</h2>
              <p className="text-sm text-muted-foreground">
                {mode === "create" ? "创建可登录后台或小程序员工身份的基础档案。" : "调整员工基础档案和在职状态。"}
              </p>
            </div>
          </div>
        </div>
        <form className="space-y-4 p-5" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor={`${mode}-employee-name`}>姓名</Label>
            <Input
              id={`${mode}-employee-name`}
              name="name"
              defaultValue={defaults.name}
              minLength={2}
              maxLength={50}
              required
              placeholder="请输入员工姓名"
              disabled={pending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${mode}-employee-phone`}>手机号</Label>
            <Input
              id={`${mode}-employee-phone`}
              name="phone"
              defaultValue={defaults.phone}
              inputMode="tel"
              maxLength={11}
              required
              placeholder="请输入 11 位手机号"
              disabled={pending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${mode}-employee-status`}>状态</Label>
            <select
              id={`${mode}-employee-status`}
              name="status"
              defaultValue={defaults.status}
              disabled={pending}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              {statusOptions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${mode}-employee-avatar`}>头像地址</Label>
            <Input
              id={`${mode}-employee-avatar`}
              name="avatar"
              defaultValue={defaults.avatar}
              placeholder="可留空"
              disabled={pending}
            />
          </div>
          {error ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="outline" onClick={close} disabled={pending}>
              取消
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              {submitText}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function CreateEmployeeButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus />
        新增员工
      </Button>
      <EmployeeDialog mode="create" open={open} onOpenChange={setOpen} />
    </>
  );
}

export function EmployeeRowActions({
  employee,
}: {
  employee: EmployeeMutationRecord;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleting, startDeleting] = useTransition();
  const [error, setError] = useState("");

  function remove() {
    const confirmed = window.confirm(
      `确认删除员工「${employee.name || "未命名员工"}」？该操作会将员工置为已离职并解绑登录账号。`,
    );
    if (!confirmed) return;

    setError("");
    startDeleting(async () => {
      try {
        await mutateEmployee({
          method: "DELETE",
          id: employee.id,
        });
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "删除失败");
      }
    });
  }

  return (
    <div className="flex items-center justify-end gap-2">
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
        onClick={remove}
        disabled={deleting || employee.status === "leaved"}
        title={employee.status === "leaved" ? "员工已离职" : "删除员工"}
      >
        {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
        删除
      </Button>
      <EmployeeDialog
        mode="edit"
        employee={employee}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      {error ? (
        <div className="absolute right-5 mt-10 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 shadow-sm">
          {error}
        </div>
      ) : null}
    </div>
  );
}
