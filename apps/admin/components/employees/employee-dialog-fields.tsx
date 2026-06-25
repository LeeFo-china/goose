"use client";

import { type ChangeEvent, type ReactNode, type RefObject, useState } from "react";
import { RoleStatusConfig, type EmployeeStatus } from "@gooes/domain";
import { ChevronsUpDown, Loader2, Upload, UserRound, X } from "lucide-react";
import { FormSelect } from "@/components/admin/form-select";
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
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  employeeStatusSelectOptions,
  EMPTY_SELECT_VALUE,
  type RoleOption,
} from "@/components/employees/employee-mutation-shared";

export function EmployeeAvatarField({
  mode,
  name,
  avatar,
  avatarPreviewUrl,
  avatarLoadFailed,
  pending,
  uploadingAvatar,
  avatarInputRef,
  handleAvatarChange,
  clearAvatar,
  markAvatarLoadFailed,
}: {
  mode: "create" | "edit";
  name: string;
  avatar: string;
  avatarPreviewUrl: string;
  avatarLoadFailed: boolean;
  pending: boolean;
  uploadingAvatar: boolean;
  avatarInputRef: RefObject<HTMLInputElement | null>;
  handleAvatarChange: (event: ChangeEvent<HTMLInputElement>) => void;
  clearAvatar: () => void;
  markAvatarLoadFailed: () => void;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={`${mode}-employee-avatar-file`}>头像</FieldLabel>
      <input type="hidden" name="avatar" value={avatar} />
      <div className="flex gap-3">
        <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted text-muted-foreground">
          {avatarPreviewUrl && !avatarLoadFailed ? (
            <img
              src={avatarPreviewUrl}
              alt={`${name || "员工"}头像预览`}
              className="size-full object-cover"
              onError={markAvatarLoadFailed}
            />
          ) : (
            <UserRound className="size-6" />
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={pending || uploadingAvatar}
              onClick={() => avatarInputRef.current?.click()}
            >
              {uploadingAvatar
                ? <Loader2 className="animate-spin" data-icon="inline-start" />
                : <Upload data-icon="inline-start" />}
              上传头像
            </Button>
            {avatar ? (
              <Button
                type="button"
                variant="ghost"
                disabled={pending || uploadingAvatar}
                onClick={clearAvatar}
              >
                <X data-icon="inline-start" />
                清除
              </Button>
            ) : null}
          </div>
          <Input
            id={`${mode}-employee-avatar-file`}
            ref={avatarInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            className="sr-only"
            disabled={pending || uploadingAvatar}
            onChange={handleAvatarChange}
          />
          <p className="text-xs text-muted-foreground">
            {avatar
              ? avatarLoadFailed
                ? "头像图片加载失败，请重新上传"
                : "已上传头像"
              : "支持 JPG、PNG、WebP、HEIC，单张不超过 2MB"}
          </p>
        </div>
      </div>
    </Field>
  );
}

export function EmployeeBaseFields({
  mode,
  name,
  phone,
  status,
  pending,
  setStatus,
}: {
  mode: "create" | "edit";
  name: string;
  phone: string;
  status: EmployeeStatus;
  pending: boolean;
  setStatus: (status: EmployeeStatus) => void;
}) {
  return (
    <>
      <Field>
        <FieldLabel htmlFor={`${mode}-employee-name`}>姓名</FieldLabel>
        <Input
          id={`${mode}-employee-name`}
          name="name"
          defaultValue={name}
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
          defaultValue={phone}
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
    </>
  );
}

export function EmployeeOrgFields({
  mode,
  pending,
  tenantDepartmentId,
  postId,
  departmentOptions,
  postOptions,
  hasSelectablePost,
  changeDepartment,
  setPostId,
}: {
  mode: "create" | "edit";
  pending: boolean;
  tenantDepartmentId: string;
  postId: string;
  departmentOptions: Array<{ value: string; label: string }>;
  postOptions: Array<{ value: string; label: string }>;
  hasSelectablePost: boolean;
  changeDepartment: (value: string) => void;
  setPostId: (postId: string) => void;
}) {
  return (
    <>
      <Field>
        <FieldLabel htmlFor={`${mode}-employee-department`}>部门</FieldLabel>
        <FormSelect
          id={`${mode}-employee-department`}
          disabled={pending}
          value={tenantDepartmentId || EMPTY_SELECT_VALUE}
          options={departmentOptions}
          onChange={changeDepartment}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${mode}-employee-post`}>职位</FieldLabel>
        <FormSelect
          id={`${mode}-employee-post`}
          disabled={pending || !hasSelectablePost}
          value={postId || EMPTY_SELECT_VALUE}
          options={postOptions}
          onChange={(value) => setPostId(value === EMPTY_SELECT_VALUE ? "" : value)}
        />
      </Field>
    </>
  );
}

export function EmployeeRoleFields({
  mode,
  roles,
  selectedRoleIds,
  pending,
  toggleRole,
}: {
  mode: "create" | "edit";
  roles: RoleOption[];
  selectedRoleIds: string[];
  pending: boolean;
  toggleRole: (roleId: string, checked: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedRoleIdSet = new Set(selectedRoleIds);
  const selectedRoles = roles.filter((role) => selectedRoleIdSet.has(role.id));
  const visibleSelectedRoles = selectedRoles.slice(0, 2);
  const hiddenSelectedCount = selectedRoles.length - visibleSelectedRoles.length;

  function clearRoles() {
    for (const roleId of selectedRoleIds) {
      toggleRole(roleId, false);
    }
  }

  return (
    <Field>
      <FieldLabel id={`${mode}-employee-roles-label`}>角色</FieldLabel>
      <FieldDescription>
        创建后立即分配角色；不选择则员工暂无角色权限。
      </FieldDescription>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-labelledby={`${mode}-employee-roles-label`}
            disabled={pending || roles.length === 0}
            className="min-h-10 w-full justify-between px-3 font-normal"
          >
            <span className="flex min-w-0 flex-1 flex-wrap gap-1.5">
              {selectedRoles.length === 0 ? (
                <span className="text-muted-foreground">
                  {roles.length === 0 ? "暂无可分配角色" : "选择角色"}
                </span>
              ) : (
                <>
                  {visibleSelectedRoles.map((role) => (
                    <Badge
                      key={role.id}
                      variant="secondary"
                      className="max-w-[150px] truncate"
                    >
                      {role.name || role.code}
                    </Badge>
                  ))}
                  {hiddenSelectedCount > 0 ? (
                    <Badge variant="outline">
                      +{hiddenSelectedCount}
                    </Badge>
                  ) : null}
                </>
              )}
            </span>
            <ChevronsUpDown data-icon="inline-end" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder="搜索角色名称或编码" />
            <CommandList className="max-h-[260px]">
              <CommandEmpty>没有匹配的角色</CommandEmpty>
              <CommandGroup>
                {roles.map((role) => {
                  const checked = selectedRoleIdSet.has(role.id);
                  const statusMeta = role.status === "active"
                    ? { label: RoleStatusConfig.active.label, variant: "success" as const }
                    : { label: RoleStatusConfig.inactive.label, variant: "secondary" as const };

                  return (
                    <CommandItem
                      key={role.id}
                      value={`${role.name} ${role.code} ${role.description || ""}`}
                      onSelect={() => toggleRole(role.id, !checked)}
                      className={checked ? "bg-accent/40" : undefined}
                    >
                      <Checkbox
                        checked={checked}
                        aria-label={role.name || role.code}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-medium">
                            {role.name || role.code}
                          </span>
                          <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
                        </span>
                        <span className="mt-0.5 block break-all text-xs text-muted-foreground">
                          {role.code}
                        </span>
                        {role.description ? (
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                            {role.description}
                          </span>
                        ) : null}
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
          {selectedRoleIds.length > 0 ? (
            <div className="flex items-center justify-between border-t px-3 py-2">
              <span className="text-xs text-muted-foreground">
                已选择 {selectedRoleIds.length} 个角色
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={clearRoles}
              >
                <X data-icon="inline-start" />
                清空
              </Button>
            </div>
          ) : null}
        </PopoverContent>
      </Popover>
      {roles.length === 0 ? (
        <div className="rounded-md border bg-muted/30 px-3 py-2.5 text-sm text-muted-foreground">
          暂无可分配角色，请先到角色管理页面创建或启用角色。
        </div>
      ) : null}
    </Field>
  );
}

export function EmployeeDialogFields({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <FieldGroup className={className}>{children}</FieldGroup>;
}
