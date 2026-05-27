"use client";

import { type FormEvent, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, Loader2, Pencil, Play, Plus, PowerOff, RefreshCcw } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { Button } from "@/components/ui/button";
import { refreshAfterDialogClose } from "@/lib/deferred-refresh";
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
import type { PlatformTenantRecord } from "@/components/platform-tenants/platform-tenant-types";

type TenantDialogMode = "create" | "edit";

function getPayloadMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

async function requestJson<T>(path: string, init?: RequestInit) {
  const response = await fetch(path, init);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.success === false) {
    throw new Error(getPayloadMessage(payload, "操作失败"));
  }

  return payload.data as T;
}

function generateTenantSlug() {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let suffix = "";

  for (let index = 0; index < 8; index += 1) {
    suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  }

  return `tenant-${suffix}`;
}

function TenantDialog({
  mode,
  tenant,
  open,
  onOpenChange,
}: {
  mode: TenantDialogMode;
  tenant?: PlatformTenantRecord;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const defaults = useMemo(() => ({
    name: tenant?.name || "",
    slug: tenant?.slug || "",
    contact_name: tenant?.contact_name || "",
    contact_phone: tenant?.contact_phone || "",
  }), [tenant]);
  const [slugValue, setSlugValue] = useState(defaults.slug);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);

  useEffect(() => {
    if (!open) return;

    setError("");
    setSlugManuallyEdited(false);
    setSlugValue(mode === "create" ? generateTenantSlug() : defaults.slug);
  }, [defaults.slug, mode, open]);

  function close() {
    if (pending) return;
    setError("");
    onOpenChange(false);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") || "").trim();
    const slug = String(formData.get("slug") || "").trim();
    const contactName = String(formData.get("contact_name") || "").trim();
    const contactPhone = String(formData.get("contact_phone") || "").trim();
    const adminName = String(formData.get("admin_name") || "").trim();
    const adminPhone = String(formData.get("admin_phone") || "").trim();

    setError("");
    startTransition(async () => {
      try {
        const body = mode === "create"
          ? {
            name,
            slug,
            contact_name: contactName || undefined,
            contact_phone: contactPhone || undefined,
            admin: {
              name: adminName,
              phone: adminPhone,
            },
          }
          : {
            name,
            contact_name: contactName || undefined,
            contact_phone: contactPhone || undefined,
          };

        await requestJson(
          mode === "create" ? "/api/backend/platform/tenants" : `/api/backend/platform/tenants/${tenant?.id}`,
          {
            method: mode === "create" ? "POST" : "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          },
        );
        onOpenChange(false);
        refreshAfterDialogClose(router);
      } catch (err) {
        setError(err instanceof Error ? err.message : "保存租户失败");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-[620px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-md bg-accent text-accent-foreground">
              <Building2 />
            </div>
            <div>
              <DialogTitle>{mode === "create" ? "新建租户" : "编辑租户"}</DialogTitle>
              <DialogDescription>
                {mode === "create" ? "创建装修公司租户，并初始化默认组织、岗位、角色和管理员。" : "仅更新租户基础信息，不修改 slug 和管理员。"}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form className="flex flex-col gap-4" onSubmit={submit}>
          <FieldGroup>
            <div className="flex flex-col gap-3">
              <div className="text-sm font-medium">公司信息</div>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor={`${mode}-tenant-name`}>公司名称</FieldLabel>
                  <Input
                    id={`${mode}-tenant-name`}
                    name="name"
                    defaultValue={defaults.name}
                    maxLength={100}
                    required
                    disabled={pending}
                    onChange={() => {
                      if (mode === "create" && !slugManuallyEdited && !slugValue) {
                        setSlugValue(generateTenantSlug());
                      }
                    }}
                  />
                </Field>
                <Field data-disabled={mode === "edit" ? true : undefined}>
                  <FieldLabel htmlFor={`${mode}-tenant-slug`}>slug</FieldLabel>
                  <div className="flex gap-2">
                    <Input
                      id={`${mode}-tenant-slug`}
                      name="slug"
                      value={slugValue}
                      onChange={(event) => {
                        setSlugManuallyEdited(true);
                        setSlugValue(event.target.value);
                      }}
                      placeholder="tenant-k8f3x2q9"
                      pattern="[a-z0-9][a-z0-9_-]*[a-z0-9]"
                      minLength={2}
                      maxLength={64}
                      required={mode === "create"}
                      disabled={pending || mode === "edit"}
                    />
                    {mode === "create" ? (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={pending}
                        onClick={() => {
                          setSlugManuallyEdited(false);
                          setSlugValue(generateTenantSlug());
                        }}
                      >
                        <RefreshCcw data-icon="inline-start" />
                        重新生成
                      </Button>
                    ) : null}
                  </div>
                  <FieldDescription>创建后不建议修改，用于 H5、小程序和分享链路识别租户。</FieldDescription>
                </Field>
                <div className="grid gap-3 md:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor={`${mode}-tenant-contact-name`}>联系人</FieldLabel>
                    <Input
                      id={`${mode}-tenant-contact-name`}
                      name="contact_name"
                      defaultValue={defaults.contact_name}
                      maxLength={80}
                      disabled={pending}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`${mode}-tenant-contact-phone`}>联系电话</FieldLabel>
                    <Input
                      id={`${mode}-tenant-contact-phone`}
                      name="contact_phone"
                      defaultValue={defaults.contact_phone}
                      maxLength={30}
                      disabled={pending}
                    />
                  </Field>
                </div>
              </FieldGroup>
            </div>

            {mode === "create" ? (
              <div className="flex flex-col gap-3">
                <div className="text-sm font-medium">管理员账号</div>
                <FieldGroup>
                  <div className="grid gap-3 md:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor="create-tenant-admin-name">管理员姓名</FieldLabel>
                      <Input
                        id="create-tenant-admin-name"
                        name="admin_name"
                        maxLength={50}
                        required
                        disabled={pending}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="create-tenant-admin-phone">管理员手机号</FieldLabel>
                      <Input
                        id="create-tenant-admin-phone"
                        name="admin_phone"
                        inputMode="tel"
                        maxLength={11}
                        pattern="1[3-9][0-9]{9}"
                        placeholder="请输入 11 位手机号"
                        required
                        disabled={pending}
                      />
                    </Field>
                  </div>
                  <FieldDescription>
                    管理员将绑定系统管理员角色。当前后台登录要求管理员手机号不能已绑定其他员工。
                  </FieldDescription>
                </FieldGroup>
              </div>
            ) : null}
          </FieldGroup>

          {error ? <StatusAlert>{error}</StatusAlert> : null}

          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={close}>
              取消
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              {mode === "create" ? "创建租户" : "保存修改"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CreatePlatformTenantButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus data-icon="inline-start" />
        新建租户
      </Button>
      <TenantDialog mode="create" open={open} onOpenChange={setOpen} />
    </>
  );
}

export function EditPlatformTenantButton({ tenant }: { tenant: PlatformTenantRecord }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Pencil data-icon="inline-start" />
        编辑
      </Button>
      <TenantDialog mode="edit" tenant={tenant} open={open} onOpenChange={setOpen} />
    </>
  );
}

export function PlatformTenantStatusButton({ tenant }: { tenant: PlatformTenantRecord }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const disabled = tenant.status === "archived" || pending;
  const nextAction = tenant.status === "active" ? "suspend" : "activate";
  const label = tenant.status === "active" ? "停用" : "启用";
  const Icon = tenant.status === "active" ? PowerOff : Play;

  function run() {
    if (disabled) return;
    setError("");
    startTransition(async () => {
      try {
        await requestJson(`/api/backend/platform/tenants/${tenant.id}/${nextAction}`, {
          method: "POST",
        });
        setOpen(false);
        refreshAfterDialogClose(router);
      } catch (err) {
        setError(err instanceof Error ? err.message : `${label}租户失败`);
      }
    });
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => setOpen(true)}>
        <Icon data-icon="inline-start" />
        {label}
      </Button>
      <Dialog open={open} onOpenChange={(nextOpen) => {
        if (pending) return;
        setOpen(nextOpen);
        if (!nextOpen) setError("");
      }}>
        <DialogContent className="max-w-[420px]">
          <DialogHeader>
            <DialogTitle>{label}租户</DialogTitle>
            <DialogDescription>
              确认要{label}「{tenant.name}」吗？该操作会影响租户后台访问策略。
            </DialogDescription>
          </DialogHeader>
          {error ? <StatusAlert>{error}</StatusAlert> : null}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button type="button" disabled={pending} onClick={run}>
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              确认{label}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
