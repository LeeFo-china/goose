"use client";

import { FormEvent, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Edit3, KeyRound, Loader2, Plus, Shield } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  normalizeRoleStatus,
  requestRoleJson,
  roleStatusOptions,
  type RoleMode,
  type RoleRecord,
  type RoleStatus,
} from "@/components/roles/role-mutation-shared";
import { refreshAfterDialogClose } from "@/lib/deferred-refresh";

export type { RoleRecord } from "@/components/roles/role-mutation-shared";

async function requestJson<T>(path: string, init?: RequestInit) {
  return requestRoleJson<T>(path, init);
}

function RoleDialog({
  mode,
  role,
  open,
  onOpenChange,
}: {
  mode: RoleMode;
  role?: RoleRecord;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const defaults = useMemo(() => ({
    code: role?.code || "",
    name: role?.name || "",
    description: role?.description || "",
    status: normalizeRoleStatus(role?.status),
  }), [role]);
  const [status, setStatus] = useState<RoleStatus>(defaults.status);

  useEffect(() => {
    if (!open) return;
    setStatus(defaults.status);
    setError("");
  }, [defaults.status, open]);

  function close() {
    if (pending) return;
    setError("");
    onOpenChange(false);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") || "").trim();
    const description = String(formData.get("description") || "").trim();

    setError("");
    startTransition(async () => {
      try {
        await requestJson(
          role?.id ? `/api/backend/roles/${role.id}` : "/api/backend/roles",
          {
            method: role?.id ? "PATCH" : "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              name,
              description: description || null,
              status,
            }),
          },
        );
        onOpenChange(false);
        refreshAfterDialogClose(router);
      } catch (err) {
        setError(err instanceof Error ? err.message : "保存角色失败");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-md bg-accent text-accent-foreground">
              <Shield className="size-4" />
            </div>
            <div>
              <DialogTitle>{mode === "create" ? "新增角色" : "编辑角色"}</DialogTitle>
              <DialogDescription>
                角色用于承载一组权限点，再分配给员工。
              </DialogDescription>
              {mode === "edit" && defaults.code ? (
                <div className="mt-1 text-xs text-muted-foreground">
                  系统编码：{defaults.code}
                </div>
              ) : null}
            </div>
          </div>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`${mode}-role-name`}>角色名称</FieldLabel>
              <Input
                id={`${mode}-role-name`}
                name="name"
                defaultValue={defaults.name}
                placeholder="例如 财务主管"
                maxLength={100}
                required
                disabled={pending}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${mode}-role-status`}>状态</FieldLabel>
              <FormSelect
                id={`${mode}-role-status`}
                value={status}
                options={roleStatusOptions}
                disabled={pending}
                onChange={(value) => setStatus(value as RoleStatus)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${mode}-role-description`}>说明</FieldLabel>
              <Textarea
                id={`${mode}-role-description`}
                name="description"
                defaultValue={defaults.description}
                placeholder="可填写角色职责和适用范围"
                maxLength={500}
                disabled={pending}
              />
            </Field>
          </FieldGroup>
          {error ? <StatusAlert>{error}</StatusAlert> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close} disabled={pending}>
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

export function CreateRoleButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus />
        新增角色
      </Button>
      <RoleDialog mode="create" open={open} onOpenChange={setOpen} />
    </>
  );
}

export function RoleRowActions({ role }: { role: RoleRecord }) {
  const [editOpen, setEditOpen] = useState(false);

  return (
    <div className="flex items-center justify-end gap-2">
      <Button asChild variant="outline" size="sm">
        <Link href={`/roles/${role.id}/permissions`}>
          <KeyRound />
          权限
        </Link>
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setEditOpen(true)}
      >
        <Edit3 />
        编辑
      </Button>
      <RoleDialog
        mode="edit"
        role={role}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
    </div>
  );
}
