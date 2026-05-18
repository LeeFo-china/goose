"use client";

import { type FormEvent, useEffect, useMemo, useState, useTransition } from "react";
import {
  DEPARTMENT_CODE_VALUES,
  DepartmentConfig,
  type DepartmentCode,
} from "@gooes/domain";
import { useRouter } from "next/navigation";
import { Building2, Check, Edit3, Loader2, Plus, PowerOff } from "lucide-react";
import { FormSelect } from "@/components/admin/form-select";
import { StatusAlert } from "@/components/admin/status-alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
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
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { DepartmentRecord } from "@/components/organization/organization-types";
import { cn } from "@/lib/utils";

const enabledOptions = [
  { value: "true", label: "启用" },
  { value: "false", label: "停用" },
];

function getPayloadMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

async function mutateDepartment(input: {
  method: "POST" | "PATCH";
  id?: string;
  payload: unknown;
}) {
  return requestDepartmentMutation({
    path: input.id ? `/api/backend/departments/${input.id}` : "/api/backend/departments",
    method: input.method,
    payload: input.payload,
  });
}

async function enableDepartmentsBatch(payload: unknown) {
  return requestDepartmentMutation({
    path: "/api/backend/departments/enable-batch",
    method: "POST",
    payload,
  });
}

async function requestDepartmentMutation(input: {
  path: string;
  method: "POST" | "PATCH";
  payload: unknown;
}) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 20_000);

  try {
    const response = await fetch(input.path, {
      method: input.method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input.payload),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.success === false) {
      throw new Error(getPayloadMessage(payload, "操作失败"));
    }
    return payload;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("请求超时，请稍后重试");
    }
    throw err;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function toDepartmentCode(value: string | null | undefined): DepartmentCode {
  return value && DEPARTMENT_CODE_VALUES.includes(value as DepartmentCode)
    ? value as DepartmentCode
    : DEPARTMENT_CODE_VALUES[0];
}

function DepartmentDialog({
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
        router.refresh();
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

function EnableDepartmentsDialog({
  enabledDepartmentCodes,
  open,
  onOpenChange,
  onEnabled,
}: {
  enabledDepartmentCodes: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEnabled?: (codes: string[]) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selectedCodes, setSelectedCodes] = useState<DepartmentCode[]>([]);
  const [error, setError] = useState("");
  const enabledCodeSet = useMemo(
    () => new Set(enabledDepartmentCodes.filter(Boolean)),
    [enabledDepartmentCodes],
  );
  const availableOptions = useMemo(
    () =>
      DEPARTMENT_CODE_VALUES
        .filter((code) => !enabledCodeSet.has(code))
        .map((code, index) => ({
          code,
          label: DepartmentConfig[code].label,
          sort: index + 1,
        })),
    [enabledCodeSet],
  );
  const selectedSet = useMemo(() => new Set(selectedCodes), [selectedCodes]);

  useEffect(() => {
    if (!open) return;
    setSelectedCodes([]);
    setError("");
  }, [open]);

  function close() {
    if (pending) return;
    setError("");
    onOpenChange(false);
  }

  function toggleCode(code: DepartmentCode) {
    if (selectedSet.has(code)) {
      setSelectedCodes((current) => current.filter((item) => item !== code));
      return;
    }
    setSelectedCodes((current) => [...current, code]);
  }

  function selectAll() {
    setSelectedCodes(availableOptions.map((item) => item.code));
  }

  function submit() {
    if (selectedCodes.length === 0) {
      setError("请选择需要启用的部门");
      return;
    }

    setError("");
    startTransition(async () => {
      try {
        await enableDepartmentsBatch({
          departments: selectedCodes.map((code) => {
            const option = availableOptions.find((item) => item.code === code);
            return {
              code,
              name: DepartmentConfig[code].label,
              enabled: true,
              sort: option?.sort ?? 0,
            };
          }),
        });
        onEnabled?.(selectedCodes);
        onOpenChange(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "启用部门失败");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-[640px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-md bg-accent text-accent-foreground">
              <Building2 />
            </div>
            <div>
              <DialogTitle>启用部门</DialogTitle>
              <DialogDescription>
                从平台标准部门中搜索并多选，启用后才会进入租户部门列表。
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 rounded-md border bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-muted-foreground">
              已选择 {selectedCodes.length} 个，尚可启用 {availableOptions.length} 个
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending || availableOptions.length === 0}
                onClick={selectAll}
              >
                全选
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pending || selectedCodes.length === 0}
                onClick={() => setSelectedCodes([])}
              >
                清空
              </Button>
            </div>
          </div>

          <Command className="rounded-md border">
            <CommandInput placeholder="搜索标准部门名称或编码" />
            <CommandList className="max-h-[360px]">
              <CommandEmpty>
                {availableOptions.length === 0 ? "标准部门已全部启用" : "没有匹配的部门"}
              </CommandEmpty>
              <CommandGroup>
                {availableOptions.map((item) => {
                  const checked = selectedSet.has(item.code);

                  return (
                    <CommandItem
                      key={item.code}
                      value={`${item.label} ${item.code}`}
                      onSelect={() => toggleCode(item.code)}
                    >
                      <Checkbox checked={checked} aria-label={item.label} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{item.label}</div>
                        <div className="truncate text-xs text-muted-foreground">{item.code}</div>
                      </div>
                      <Check className={cn("opacity-0", checked && "opacity-100")} />
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
          {error ? <StatusAlert>{error}</StatusAlert> : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={close} disabled={pending}>
            取消
          </Button>
          <Button
            type="button"
            disabled={pending || availableOptions.length === 0}
            onClick={submit}
          >
            {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
            启用选中部门
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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
        router.refresh();
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
