"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MoreHorizontal, Pencil, Plus, Shield, UserCheck } from "lucide-react";
import type { EmployeeStatus } from "@gooes/domain";

import { StatusAlert } from "@/components/admin/status-alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { requestBackendJson } from "@/lib/backend-client";

import {
  PlatformOperatorRoleCheckboxField,
  readPlatformOperatorVersion,
  togglePlatformOperatorRoleId,
} from "./platform-operator-action-shared";
import {
  buildPlatformOperatorActionPayload,
  buildPlatformOperatorCreatePayload,
  buildPlatformOperatorRolesPayload,
  buildPlatformOperatorUpdatePayload,
  platformOperatorStatusOptions,
} from "./platform-operator-rules";
import type {
  PlatformOperator,
  PlatformRoleOption,
} from "./platform-operator-types";

type OperatorFormValues = {
  name: string;
  phone: string;
  status: EmployeeStatus;
  roleIds: string[];
};

const DEFAULT_FORM_VALUES: OperatorFormValues = {
  name: "",
  phone: "",
  status: "pending",
  roleIds: [],
};

function initialValues(operator?: PlatformOperator | null): OperatorFormValues {
  if (!operator) return DEFAULT_FORM_VALUES;

  return {
    name: operator.name || "",
    phone: operator.full_phone || operator.phone || "",
    status: (
      platformOperatorStatusOptions.some((item) => item.value === operator.status)
        ? operator.status
        : "pending"
    ) as EmployeeStatus,
    roleIds: operator.roles.map((role) => role.id),
  };
}

async function fetchOperatorDetail(id: string) {
  return requestBackendJson<PlatformOperator>(`/platform/operators/${id}`, {
    fallbackMessage: "平台人员详情加载失败",
  });
}

export function PlatformOperatorFormButton({
  operator,
  roles,
  onSaved,
}: {
  operator?: PlatformOperator | null;
  roles: PlatformRoleOption[];
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<PlatformOperator | null>(operator ?? null);
  const [values, setValues] = useState(() => initialValues(operator));
  const [pending, setPending] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState("");
  const isEditing = Boolean(operator);
  const activeRoles = roles.filter((role) => role.status === "active");
  const assignableRoles = activeRoles.length ? activeRoles : roles;

  useEffect(() => {
    if (!open) return;
    setError("");
    setValues(initialValues(operator));
    setDetail(operator ?? null);
    if (!operator?.id) return;

    setLoadingDetail(true);
    void fetchOperatorDetail(operator.id)
      .then((nextDetail) => {
        setDetail(nextDetail);
        setValues(initialValues(nextDetail));
      })
      .catch((caught) => {
        setError(caught instanceof Error ? caught.message : "平台人员详情加载失败");
      })
      .finally(() => setLoadingDetail(false));
  }, [open, operator]);

  function update(patch: Partial<OperatorFormValues>) {
    setValues((current) => ({ ...current, ...patch }));
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!values.roleIds.length) {
      setError("至少选择一个平台角色");
      return;
    }

    setPending(true);
    setError("");
    try {
      if (operator) {
        await requestBackendJson(`/platform/operators/${operator.id}`, {
          method: "PATCH",
          body: JSON.stringify(buildPlatformOperatorUpdatePayload({
            name: values.name,
            phone: values.phone,
            status: values.status,
            expectedVersion: readPlatformOperatorVersion(detail ?? operator),
            idempotencyKey: crypto.randomUUID(),
          })),
          fallbackMessage: "平台人员保存失败",
        });
      } else {
        await requestBackendJson("/platform/operators", {
          method: "POST",
          body: JSON.stringify(buildPlatformOperatorCreatePayload({
            name: values.name,
            phone: values.phone,
            status: values.status === "active" ? "active" : "pending",
            roleIds: values.roleIds,
            idempotencyKey: crypto.randomUUID(),
          })),
          fallbackMessage: "平台人员创建失败",
        });
      }
      toast.success(isEditing ? "平台人员已保存" : "平台人员已创建");
      setOpen(false);
      onSaved?.();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "平台人员保存失败");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant={isEditing ? "outline" : "default"}>
          {isEditing ? <Pencil data-icon="inline-start" /> : <Plus data-icon="inline-start" />}
          {isEditing ? "编辑" : "新增平台人员"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "编辑平台人员" : "新增平台人员"}</DialogTitle>
          <DialogDescription>
            平台人员独立于租户员工，角色决定可访问的超管功能。手机号用于后台登录身份绑定。
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-5" onSubmit={(event) => void submit(event)}>
          {loadingDetail ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner data-icon="inline-start" />
              正在读取完整手机号和版本信息
            </div>
          ) : null}
          <FieldGroup className="grid gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="platform-operator-name">姓名</FieldLabel>
              <Input
                id="platform-operator-name"
                value={values.name}
                onChange={(event) => update({ name: event.target.value })}
                minLength={2}
                maxLength={50}
                required
                disabled={pending || loadingDetail}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="platform-operator-phone">手机号</FieldLabel>
              <Input
                id="platform-operator-phone"
                value={values.phone}
                onChange={(event) => update({ phone: event.target.value })}
                inputMode="tel"
                pattern="^1[3-9]\\d{9}$"
                maxLength={11}
                required
                disabled={pending || loadingDetail}
              />
              <FieldDescription>编辑时会先读取详情，避免用脱敏手机号覆盖真实手机号。</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="platform-operator-status">状态</FieldLabel>
              <Select
                value={values.status}
                onValueChange={(value) => update({ status: value as EmployeeStatus })}
                disabled={pending || loadingDetail}
              >
                <SelectTrigger id="platform-operator-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {platformOperatorStatusOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <PlatformOperatorRoleCheckboxField
              roles={assignableRoles}
              selectedRoleIds={values.roleIds}
              disabled={pending || loadingDetail}
              onToggle={(roleId, checked) =>
                update({
                  roleIds: togglePlatformOperatorRoleId(
                    values.roleIds,
                    roleId,
                    checked,
                  ),
                })}
            />
          </FieldGroup>
          {error ? <StatusAlert>{error}</StatusAlert> : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              取消
            </Button>
            <Button type="submit" disabled={pending || loadingDetail}>
              {pending ? <Spinner data-icon="inline-start" /> : null}
              {isEditing ? "保存人员" : "创建人员"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PlatformOperatorRolesButton({
  operator,
  roles,
  onSaved,
}: {
  operator: PlatformOperator;
  roles: PlatformRoleOption[];
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>(() =>
    operator.roles.map((role) => role.id)
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const assignableRoles = useMemo(
    () => roles.filter((role) => role.status === "active"),
    [roles],
  );

  useEffect(() => {
    if (!open) return;
    setSelectedRoleIds(operator.roles.map((role) => role.id));
    setError("");
  }, [open, operator]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedRoleIds.length) {
      setError("至少选择一个平台角色");
      return;
    }

    setPending(true);
    setError("");
    try {
      await requestBackendJson(`/platform/operators/${operator.id}/roles`, {
        method: "PUT",
        body: JSON.stringify(buildPlatformOperatorRolesPayload({
          roleIds: selectedRoleIds,
          expectedVersion: readPlatformOperatorVersion(operator),
          idempotencyKey: crypto.randomUUID(),
        })),
        fallbackMessage: "平台人员角色保存失败",
      });
      toast.success("平台人员角色已更新");
      setOpen(false);
      onSaved?.();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "平台人员角色保存失败");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          <Shield data-icon="inline-start" />
          角色
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>分配平台角色</DialogTitle>
          <DialogDescription>
            {operator.name || "未命名人员"} 的角色变更会影响下一次权限校验。
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
          <PlatformOperatorRoleCheckboxField
            roles={assignableRoles.length ? assignableRoles : roles}
            selectedRoleIds={selectedRoleIds}
            disabled={pending}
            onToggle={(roleId, checked) =>
              setSelectedRoleIds((current) =>
                togglePlatformOperatorRoleId(current, roleId, checked)
              )}
          />
          {error ? <StatusAlert>{error}</StatusAlert> : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              取消
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Spinner data-icon="inline-start" /> : null}
              保存角色
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PlatformOperatorRowActions({
  operator,
  roles,
  canManage,
  onChanged,
}: {
  operator: PlatformOperator;
  roles: PlatformRoleOption[];
  canManage: boolean;
  onChanged?: () => void;
}) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  async function runAction(
    action: "activate" | "suspend" | "leave" | "revoke-sessions",
  ) {
    setPendingAction(action);
    try {
      await requestBackendJson(`/platform/operators/${operator.id}/${action}`, {
        method: "POST",
        body: JSON.stringify(buildPlatformOperatorActionPayload({
          expectedVersion: readPlatformOperatorVersion(operator),
          idempotencyKey: crypto.randomUUID(),
        })),
        fallbackMessage: "平台人员操作失败",
      });
      toast.success("平台人员状态已更新");
      onChanged?.();
      router.refresh();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "平台人员操作失败");
    } finally {
      setPendingAction(null);
    }
  }

  if (!canManage) {
    return <span className="text-sm text-muted-foreground">只读</span>;
  }

  return (
    <div className="flex justify-end gap-2">
      <PlatformOperatorFormButton
        operator={operator}
        roles={roles}
        onSaved={onChanged}
      />
      <PlatformOperatorRolesButton
        operator={operator}
        roles={roles}
        onSaved={onChanged}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="icon"
            variant="outline"
            disabled={Boolean(pendingAction)}
            aria-label="更多人员操作"
          >
            {pendingAction ? <Spinner /> : <MoreHorizontal />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            {operator.status !== "active" ? (
              <DropdownMenuItem onClick={() => void runAction("activate")}>
                <UserCheck />
                启用人员
              </DropdownMenuItem>
            ) : null}
            {operator.status === "active" ? (
              <DropdownMenuItem onClick={() => void runAction("suspend")}>
                停用人员
              </DropdownMenuItem>
            ) : null}
            {operator.status !== "leaved" ? (
              <DropdownMenuItem onClick={() => void runAction("leave")}>
                标记离职
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem onClick={() => void runAction("revoke-sessions")}>
              撤销登录会话
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
