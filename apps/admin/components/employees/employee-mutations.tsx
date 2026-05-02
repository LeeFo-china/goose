"use client";

import { FormEvent, useEffect, useMemo, useState, useTransition } from "react";
import {
  EMPLOYEE_STATUS_VALUES,
  EmployeeStatusConfig,
  isEmployeeStatus,
  type EmployeeStatus,
} from "@gooes/domain";
import { useRouter } from "next/navigation";
import { Edit3, Loader2, Plus, Trash2, UserRound } from "lucide-react";
import { FormSelect } from "@/components/admin/form-select";
import { StatusAlert } from "@/components/admin/status-alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export type EmployeeMutationRecord = {
  id: string;
  name: string | null;
  phone: string | null;
  status: EmployeeStatus | string | null;
  avatar: string | null;
};

type MutationMode = "create" | "edit";

const statusOptions: Array<{ label: string; value: EmployeeStatus }> =
  EMPLOYEE_STATUS_VALUES.map((value) => ({
    value,
    label: EmployeeStatusConfig[value].label,
  }));

const employeeStatusSelectOptions = statusOptions.map((item) => ({
  value: item.value,
  label: item.label,
}));

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
    status: isEmployeeStatus(employee?.status) ? employee.status : "active",
  }), [employee]);
  const [status, setStatus] = useState<EmployeeStatus>(defaults.status);
  const [avatar, setAvatar] = useState(defaults.avatar);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStatus(defaults.status);
    setAvatar(defaults.avatar);
    setAvatarLoadFailed(false);
  }, [defaults.avatar, defaults.status, open]);

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
    <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-[480px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-md bg-accent text-accent-foreground">
              <UserRound className="size-4" />
            </div>
            <div>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>
                {mode === "create" ? "创建可登录后台或小程序员工身份的基础档案。" : "调整员工基础档案和在职状态。"}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`${mode}-employee-name`}>姓名</FieldLabel>
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
            </Field>
            <Field>
              <FieldLabel htmlFor={`${mode}-employee-phone`}>手机号</FieldLabel>
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
            </Field>
            <Field>
              <FieldLabel htmlFor={`${mode}-employee-status`}>状态</FieldLabel>
              <input type="hidden" name="status" value={status} />
              <FormSelect
              id={`${mode}-employee-status`}
              disabled={pending}
                value={status}
                options={employeeStatusSelectOptions}
                onChange={(value) => setStatus(value as EmployeeStatus)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${mode}-employee-avatar`}>头像地址</FieldLabel>
              <div className="flex gap-3">
                <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted text-muted-foreground">
                  {avatar && !avatarLoadFailed ? (
                    <img
                      src={avatar}
                      alt={`${defaults.name || "员工"}头像预览`}
                      className="size-full object-cover"
                      onError={() => setAvatarLoadFailed(true)}
                    />
                  ) : (
                    <UserRound className="size-6" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <Input
                    id={`${mode}-employee-avatar`}
                    name="avatar"
                    value={avatar}
                    placeholder="可留空，粘贴图片 URL 后显示预览"
                    disabled={pending}
                    onChange={(event) => {
                      setAvatar(event.target.value);
                      setAvatarLoadFailed(false);
                    }}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {avatar
                      ? avatarLoadFailed
                        ? "头像图片加载失败，请检查地址是否可访问"
                        : "当前头像缩略图预览"
                      : "未设置头像时使用默认图标"}
                  </p>
                </div>
              </div>
            </Field>
          </FieldGroup>
          {error ? (
            <StatusAlert>{error}</StatusAlert>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close} disabled={pending}>
              取消
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              {submitText}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
        <div className="absolute right-5 mt-10 rounded-md border border-destructive/50 bg-background px-3 py-2 text-xs text-destructive shadow-sm">
          {error}
        </div>
      ) : null}
    </div>
  );
}
