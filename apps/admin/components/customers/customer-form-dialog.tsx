"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm, type Resolver } from "react-hook-form";
import { Loader2 } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { refreshAfterDialogClose } from "@/lib/deferred-refresh";
import { CustomerFormFields } from "@/components/customers/customer-form-fields";
import type { CustomerMode, CustomerRecord } from "@/components/customers/customer-mutation-types";
import { buildDefaults, CustomerFormSchema, type CustomerFormValues, requestCustomer, uploadCustomerAvatar, useEmployeeOptions } from "@/components/customers/customer-mutation-shared";

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
          <CustomerFormFields
            mode={mode}
            form={form}
            pending={pending}
            employees={employees}
            avatar={avatar}
            avatarPreviewUrl={avatarPreviewUrl}
            avatarLoadFailed={avatarLoadFailed}
            uploadingAvatar={uploadingAvatar}
            avatarInputRef={avatarInputRef}
            customerName={defaults.name}
            onAvatarLoadFailed={() => setAvatarLoadFailed(true)}
            onAvatarClear={() => {
              setAvatar("");
              setAvatarPreviewUrl("");
              setAvatarLoadFailed(false);
              setAvatarDirty(true);
            }}
            onAvatarChange={handleAvatarChange}
          />
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
