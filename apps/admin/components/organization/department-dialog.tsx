"use client";

import { type FormEvent, useEffect, useMemo, useState, useTransition } from "react";
import { DepartmentConfig } from "@gooes/domain";
import { useRouter } from "next/navigation";
import { Building2, Loader2 } from "lucide-react";
import { FormSelect } from "@/components/admin/form-select";
import { StatusAlert } from "@/components/admin/status-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { DepartmentRecord } from "@/components/organization/organization-types";
import { enabledOptions, mutateDepartment, toDepartmentCode } from "@/components/organization/department-mutation-shared";
import { refreshAfterDialogClose } from "@/lib/deferred-refresh";

export function DepartmentDialog({
  department,
  open,
  onOpenChange,
}: {
  department?: DepartmentRecord;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const defaults = useMemo(() => ({
    name: department?.name || "",
    code: toDepartmentCode(department?.code),
    enabled: department?.enabled === false ? "false" : "true",
    sort: department?.sort != null ? String(department.sort) : "0",
  }), [department]);
  const code = defaults.code;
  const [enabled, setEnabled] = useState(defaults.enabled);
  const [name, setName] = useState(defaults.name || DepartmentConfig[defaults.code].label);

  useEffect(() => {
    if (!open) return;
    setEnabled(defaults.enabled);
    setName(defaults.name || DepartmentConfig[defaults.code].label);
    setError("");
  }, [defaults.code, defaults.enabled, defaults.name, open]);

  function close() {
    if (pending) return;
    setError("");
    onOpenChange(false);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const nameValue = name.trim();
    const sortValue = String(formData.get("sort") || "").trim();
    const payload = {
      name: nameValue,
      enabled: enabled === "true",
      sort: sortValue ? Number(sortValue) : 0,
    };

    setError("");
    startTransition(async () => {
      try {
        await mutateDepartment({
          method: "PATCH",
          id: department?.id,
          payload,
        });
        onOpenChange(false);
        refreshAfterDialogClose(router);
      } catch (err) {
        setError(err instanceof Error ? err.message : "保存部门失败");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-md bg-accent text-accent-foreground">
              <Building2 className="size-4" />
            </div>
            <div>
              <DialogTitle>部门配置</DialogTitle>
              <DialogDescription>
                标准部门编码不可修改，可调整租户侧显示名称、启停和排序。
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="edit-department-name">显示名称</FieldLabel>
              <Input
                id="edit-department-name"
                name="name"
                value={name}
                placeholder={DepartmentConfig[code].label}
                maxLength={50}
                required
                disabled={pending}
                onChange={(event) => setName(event.target.value)}
              />
              <FieldDescription>
                可按公司习惯设置别名，系统底层仍使用标准部门编码。
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="edit-department-code">标准部门</FieldLabel>
              <div
                id="edit-department-code"
                className="flex min-h-9 items-center gap-2 rounded-md border bg-muted/35 px-3 text-sm"
              >
                <span className="font-medium">{DepartmentConfig[code].label}</span>
                <Badge variant="outline">{code}</Badge>
              </div>
            </Field>
            <Field>
              <FieldLabel htmlFor="edit-department-enabled">状态</FieldLabel>
              <FormSelect
                id="edit-department-enabled"
                value={enabled}
                options={enabledOptions}
                disabled={pending}
                onChange={setEnabled}
              />
              <FieldDescription>
                停用后不会出现在员工、岗位新增的候选部门中。
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="edit-department-sort">排序</FieldLabel>
              <Input
                id="edit-department-sort"
                name="sort"
                type="number"
                min="0"
                step="1"
                defaultValue={defaults.sort}
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

