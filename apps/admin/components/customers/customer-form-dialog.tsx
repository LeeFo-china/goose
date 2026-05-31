"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { Loader2, Upload, UserRound, X } from "lucide-react";
import { FormSelect } from "@/components/admin/form-select";
import { StatusAlert } from "@/components/admin/status-alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { refreshAfterDialogClose } from "@/lib/deferred-refresh";
import type { CustomerMode, CustomerRecord } from "@/components/customers/customer-mutation-types";
import { buildDefaults, CustomerFormSchema, type CustomerFormValues, requestCustomer, SelectField, sourceOptions, uploadCustomerAvatar, useEmployeeOptions } from "@/components/customers/customer-mutation-shared";

export function CustomerDialog({
  mode,
  customer,
  open,
  onOpenChange,
}: {
  mode: CustomerMode;
  customer?: CustomerRecord;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const defaults = useMemo(() => buildDefaults(customer), [customer]);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [avatar, setAvatar] = useState(defaults.avatar);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState(defaults.avatar);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const [avatarDirty, setAvatarDirty] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const employees = useEmployeeOptions(open, customer);
  const form = useForm<CustomerFormValues>({
    resolver: zodResolver(CustomerFormSchema as never) as Resolver<CustomerFormValues>,
    defaultValues: defaults,
  });
  const selectedSource = form.watch("source");

  useEffect(() => {
    if (!open) return;
    form.reset(defaults);
    setAvatar(defaults.avatar);
    setAvatarPreviewUrl(defaults.avatar);
    setUploadingAvatar(false);
    setAvatarLoadFailed(false);
    setAvatarDirty(false);
  }, [open, defaults, form]);

  function close() {
    if (pending || uploadingAvatar) return;
    setError("");
    onOpenChange(false);
  }

  async function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError("");
    setUploadingAvatar(true);
    try {
      const uploaded = await uploadCustomerAvatar(file);
      setAvatar(uploaded.value);
      setAvatarPreviewUrl(uploaded.previewUrl);
      setAvatarLoadFailed(false);
      setAvatarDirty(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "上传头像失败");
    } finally {
      setUploadingAvatar(false);
    }
  }

  function submit(values: CustomerFormValues) {
    const images = values.douyin_screenshot_images
      .split(/[\n,，]/)
      .map((item) => item.trim())
      .filter(Boolean);
    const hasProperty = Boolean(
      values.community.trim() ||
        values.building_info.trim() ||
        values.layout.trim() ||
        values.area,
    );
    const payload: {
      name: string;
      avatar?: string | null;
      phone: string;
      status?: "potential";
      source: CustomerFormValues["source"];
      owner_id: string | null;
      douyin_screenshot_images: string[];
      property: {
        community: string;
        building_info: string | null;
        area: number | null;
        layout: string | null;
      } | null;
    } = {
      name: values.name.trim(),
      phone: values.phone.trim(),
      source: values.source,
      owner_id: values.owner_id || null,
      douyin_screenshot_images: values.source === "douyin" ? images : [],
      property: hasProperty
        ? {
          community: values.community.trim(),
          building_info: values.building_info.trim() || null,
          area: values.area ? Number(values.area) : null,
          layout: values.layout.trim() || null,
        }
        : null,
    };
    if (mode === "create" || avatarDirty) {
      payload.avatar = avatar || null;
    }
    if (mode === "create") {
      payload.status = "potential";
    }

    setError("");
    startTransition(async () => {
      try {
        await requestCustomer({
          path: mode === "create" ? "/customers" : `/customers/${customer?.id}`,
          method: mode === "create" ? "POST" : "PATCH",
          payload,
        });
        onOpenChange(false);
        refreshAfterDialogClose(router);
      } catch (err) {
        setError(err instanceof Error ? err.message : "保存失败");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? onOpenChange(true) : close())}>
      <DialogContent className="max-h-[88vh] max-w-[720px] overflow-hidden p-0">
        <DialogHeader className="border-b p-5">
          <DialogTitle>
            {mode === "create" ? "新增客户" : "编辑客户"}
          </DialogTitle>
          <DialogDescription>
            维护客户基础资料、负责人、来源状态和主房产信息。
          </DialogDescription>
        </DialogHeader>
        <form className="flex max-h-[calc(88vh-82px)] flex-col gap-4 overflow-y-auto p-5" onSubmit={form.handleSubmit(submit)}>
          <FieldGroup className="grid gap-4 md:grid-cols-2">
            <Field className="md:col-span-2">
              <FieldLabel htmlFor={`${mode}-customer-avatar-file`}>头像</FieldLabel>
              <input type="hidden" name="avatar" value={avatar} />
              <div className="flex gap-3">
                <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted text-muted-foreground">
                  {avatarPreviewUrl && !avatarLoadFailed ? (
                    <img
                      src={avatarPreviewUrl}
                      alt={`${defaults.name || "客户"}头像预览`}
                      className="size-full object-cover"
                      onError={() => setAvatarLoadFailed(true)}
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
                        onClick={() => {
                          setAvatar("");
                          setAvatarPreviewUrl("");
                          setAvatarLoadFailed(false);
                          setAvatarDirty(true);
                        }}
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
          </FieldGroup>
          {employees.error ? (
            <StatusAlert tone="warning">{employees.error}</StatusAlert>
          ) : null}
          {error ? (
            <StatusAlert>{error}</StatusAlert>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close} disabled={pending}>
              取消
            </Button>
            <Button type="submit" disabled={pending || employees.loading}>
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              {mode === "create" ? "创建客户" : "保存修改"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
