"use client";

import type { ChangeEvent, RefObject } from "react";
import { Controller, type UseFormReturn } from "react-hook-form";
import { Loader2, Upload, UserRound, X } from "lucide-react";
import { FormSelect } from "@/components/admin/form-select";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { CustomerMode } from "@/components/customers/customer-mutation-types";
import {
  type CustomerFormValues,
  SelectField,
  sourceOptions,
  useEmployeeOptions,
} from "@/components/customers/customer-mutation-shared";

export function CustomerFormFields({
  mode,
  form,
  pending,
  employees,
  avatar,
  avatarPreviewUrl,
  avatarLoadFailed,
  uploadingAvatar,
  avatarInputRef,
  customerName,
  onAvatarLoadFailed,
  onAvatarClear,
  onAvatarChange,
}: {
  mode: CustomerMode;
  form: UseFormReturn<CustomerFormValues>;
  pending: boolean;
  employees: ReturnType<typeof useEmployeeOptions>;
  avatar: string;
  avatarPreviewUrl: string;
  avatarLoadFailed: boolean;
  uploadingAvatar: boolean;
  avatarInputRef: RefObject<HTMLInputElement | null>;
  customerName: string;
  onAvatarLoadFailed: () => void;
  onAvatarClear: () => void;
  onAvatarChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  const selectedSource = form.watch("source");

  return (
    <FieldGroup className="grid gap-4 md:grid-cols-2">
      <CustomerAvatarField
        mode={mode}
        avatar={avatar}
        avatarPreviewUrl={avatarPreviewUrl}
        avatarLoadFailed={avatarLoadFailed}
        uploadingAvatar={uploadingAvatar}
        pending={pending}
        avatarInputRef={avatarInputRef}
        customerName={customerName}
        onAvatarLoadFailed={onAvatarLoadFailed}
        onAvatarClear={onAvatarClear}
        onAvatarChange={onAvatarChange}
      />
      <Controller
        name="name"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={`${mode}-customer-name`}>客户姓名</FieldLabel>
            <Input
              {...field}
              id={`${mode}-customer-name`}
              disabled={pending}
              aria-invalid={fieldState.invalid}
            />
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />
      <Controller
        name="phone"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={`${mode}-customer-phone`}>手机号</FieldLabel>
            <Input
              {...field}
              id={`${mode}-customer-phone`}
              disabled={pending}
              inputMode="numeric"
              aria-invalid={fieldState.invalid}
            />
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />
      <Controller
        name="source"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={`${mode}-customer-source`}>来源</FieldLabel>
            <SelectField
              id={`${mode}-customer-source`}
              value={field.value}
              options={sourceOptions}
              disabled={pending}
              onChange={field.onChange}
            />
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />
      <Controller
        name="owner_id"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field className="md:col-span-2" data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={`${mode}-customer-owner`}>负责人</FieldLabel>
            <FormSelect
              id={`${mode}-customer-owner`}
              value={field.value || "__current_account__"}
              disabled={pending || employees.loading}
              invalid={fieldState.invalid}
              placeholder={employees.loading ? "负责人加载中" : "默认当前账号"}
              options={[
                {
                  value: "__current_account__",
                  label: employees.loading ? "负责人加载中" : "默认当前账号",
                },
                ...employees.options.map((employee) => ({
                  value: employee.id,
                  label: employee.name || employee.phone || employee.id,
                })),
              ]}
              onChange={(value) => field.onChange(value === "__current_account__" ? "" : value)}
            />
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />
      {selectedSource === "douyin" ? (
        <Controller
          name="douyin_screenshot_images"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field className="md:col-span-2" data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${mode}-customer-douyin`}>抖音截图 URL</FieldLabel>
              <Textarea
                {...field}
                id={`${mode}-customer-douyin`}
                placeholder="抖音来源必填，最多 1 张"
                disabled={pending}
                aria-invalid={fieldState.invalid}
                className="min-h-[72px]"
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
      ) : null}
      <CustomerPropertyFields mode={mode} form={form} pending={pending} />
    </FieldGroup>
  );
}

function CustomerAvatarField({
  mode,
  avatar,
  avatarPreviewUrl,
  avatarLoadFailed,
  uploadingAvatar,
  pending,
  avatarInputRef,
  customerName,
  onAvatarLoadFailed,
  onAvatarClear,
  onAvatarChange,
}: {
  mode: CustomerMode;
  avatar: string;
  avatarPreviewUrl: string;
  avatarLoadFailed: boolean;
  uploadingAvatar: boolean;
  pending: boolean;
  avatarInputRef: RefObject<HTMLInputElement | null>;
  customerName: string;
  onAvatarLoadFailed: () => void;
  onAvatarClear: () => void;
  onAvatarChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <Field className="md:col-span-2">
      <FieldLabel htmlFor={`${mode}-customer-avatar-file`}>头像</FieldLabel>
      <input type="hidden" name="avatar" value={avatar} />
      <div className="flex gap-3">
        <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted text-muted-foreground">
          {avatarPreviewUrl && !avatarLoadFailed ? (
            <img
              src={avatarPreviewUrl}
              alt={`${customerName || "客户"}头像预览`}
              className="size-full object-cover"
              onError={onAvatarLoadFailed}
            />
          ) : (
            <UserRound />
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
                onClick={onAvatarClear}
              >
                <X data-icon="inline-start" />
                清除
              </Button>
            ) : null}
          </div>
          <Input
            id={`${mode}-customer-avatar-file`}
            ref={avatarInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            className="sr-only"
            disabled={pending || uploadingAvatar}
            onChange={onAvatarChange}
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

function CustomerPropertyFields({
  mode,
  form,
  pending,
}: {
  mode: CustomerMode;
  form: UseFormReturn<CustomerFormValues>;
  pending: boolean;
}) {
  return (
    <>
      <Controller
        name="community"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field className="md:col-span-2" data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={`${mode}-customer-community`}>小区名称</FieldLabel>
            <Input
              {...field}
              id={`${mode}-customer-community`}
              disabled={pending}
              aria-invalid={fieldState.invalid}
            />
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />
      <Controller
        name="building_info"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={`${mode}-customer-building`}>楼栋门牌</FieldLabel>
            <Input
              {...field}
              id={`${mode}-customer-building`}
              disabled={pending}
              aria-invalid={fieldState.invalid}
            />
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />
      <Controller
        name="area"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={`${mode}-customer-area`}>面积</FieldLabel>
            <Input
              {...field}
              id={`${mode}-customer-area`}
              type="number"
              min="0"
              step="0.01"
              disabled={pending}
              aria-invalid={fieldState.invalid}
            />
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />
      <Controller
        name="layout"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field className="md:col-span-2" data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={`${mode}-customer-layout`}>户型</FieldLabel>
            <Input
              {...field}
              id={`${mode}-customer-layout`}
              disabled={pending}
              aria-invalid={fieldState.invalid}
            />
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />
    </>
  );
}
