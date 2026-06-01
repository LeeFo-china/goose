"use client";

import type { ChangeEvent, ReactNode, RefObject } from "react";
import type { EmployeeStatus } from "@gooes/domain";
import { Loader2, Upload, UserRound, X } from "lucide-react";
import { FormSelect } from "@/components/admin/form-select";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { employeeStatusSelectOptions, EMPTY_SELECT_VALUE } from "@/components/employees/employee-mutation-shared";

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

export function EmployeeDialogFields({ children }: { children: ReactNode }) {
  return <FieldGroup>{children}</FieldGroup>;
}
