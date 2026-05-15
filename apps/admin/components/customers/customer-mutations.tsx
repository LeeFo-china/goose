"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  CUSTOMER_SOURCE_VALUES,
  CUSTOMER_STATUS_VALUES,
  CustomerSourceConfig,
  CustomerStatusConfig,
  isCustomerSource,
  isCustomerStatus,
} from "@gooes/domain";
import { useRouter } from "next/navigation";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { z } from "zod";
import {
  CalendarClock,
  Edit3,
  Eye,
  Loader2,
  MessageSquareText,
  MoreHorizontal,
  Plus,
  Share2,
  Tags,
  Trash2,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import { FormSelect } from "@/components/admin/form-select";
import { StatusAlert } from "@/components/admin/status-alert";
import { Badge } from "@/components/ui/badge";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Owner = {
  id?: string | null;
  name?: string | null;
  phone?: string | null;
  avatar?: string | null;
};

type PropertySummary = {
  id: string;
  community: string | null;
  building_info: string | null;
  layout: string | null;
  area: number | null;
  is_primary?: boolean;
};

type CustomerSourceEmployee = {
  id: string;
  name: string | null;
  phone: string | null;
};

type CustomerSourceRecord = {
  id: string;
  source: string;
  display_label: string;
  dedupe_result: string | null;
  is_old_customer_new_lead: boolean;
  is_platform_new_lead: boolean;
  is_employee_share: boolean;
  source_employee?: CustomerSourceEmployee | null;
  assigned_by?: CustomerSourceEmployee | null;
  platform_lead?: {
    id: string;
    phone: string | null;
    name: string | null;
    city: string | null;
    community: string | null;
    status: string | null;
    source: string | null;
  } | null;
  share_link?: {
    id: string;
    token: string;
    source: string;
    target_type: string;
    target_id: string | null;
  } | null;
  metadata?: unknown;
  created_at: string;
};

type CustomerSourceSummary = {
  total: number;
  latest_source: CustomerSourceRecord | null;
  source_tags: string[];
  has_old_customer_new_lead: boolean;
  has_platform_new_lead: boolean;
  has_employee_share: boolean;
};

export type CustomerFollowUpRecord = {
  id: string;
  customer_id?: string | null;
  employee_id: string | null;
  employee_name?: string | null;
  employee?: Owner | Owner[] | null;
  content: string;
  next_follow_at: string | null;
  created_at: string | null;
  comment_count?: number;
  latest_comment_preview?: {
    id: string;
    content: string;
    author_employee_name: string | null;
    created_at: string;
  } | null;
};

export type CustomerRecord = {
  id: string;
  name: string | null;
  avatar?: string | null;
  phone?: string | null;
  phone_masked?: string | null;
  can_view_phone?: boolean;
  can_call_phone?: boolean;
  can_copy_phone?: boolean;
  owner_id: string | null;
  owner?: Owner | Owner[] | null;
  owner_name?: string | null;
  source: string | null;
  customer_origin?: string | null;
  self_registered_at?: string | null;
  claimed_at?: string | null;
  status: string | null;
  created_at: string | null;
  douyin_screenshot_images?: string[];
  property_id?: string | null;
  community?: string | null;
  building_info?: string | null;
  layout?: string | null;
  area?: number | null;
  properties?: PropertySummary[];
  property_count?: number;
  latest_follow_up?: CustomerFollowUpRecord | null;
  last_follow_at?: string | null;
  next_follow_at?: string | null;
  follow_up_state?: "none" | "upcoming" | "due" | "overdue" | string;
  source_summary?: CustomerSourceSummary;
  latest_source?: CustomerSourceRecord | null;
  source_tags?: string[];
  has_old_customer_new_lead?: boolean;
  has_platform_new_lead?: boolean;
  has_employee_share?: boolean;
};

type EmployeeOption = {
  id: string;
  name: string | null;
  phone: string | null;
};

type CustomerMode = "create" | "edit";

const statusOptions = CUSTOMER_STATUS_VALUES.map((value) => [
  value,
  CustomerStatusConfig[value].label,
] as const);

const sourceOptions = CUSTOMER_SOURCE_VALUES.map((value) => [
  value,
  CustomerSourceConfig[value].label,
] as const);

const CustomerFormSchema = z.object({
  name: z.string().trim().min(1, "请输入客户姓名"),
  avatar: z.string(),
  phone: z.string().trim().regex(/^1[3-9]\d{9}$/, "请输入有效手机号"),
  status: z.enum(CUSTOMER_STATUS_VALUES),
  source: z.enum(CUSTOMER_SOURCE_VALUES),
  owner_id: z.string(),
  douyin_screenshot_images: z.string(),
  community: z.string(),
  building_info: z.string(),
  area: z.string().refine((value) => {
    if (!value.trim()) return true;
    const amount = Number(value);
    return Number.isFinite(amount) && amount >= 0;
  }, "请输入有效面积"),
  layout: z.string(),
});

type CustomerFormValues = z.infer<typeof CustomerFormSchema>;

const SELECT_CLASS_NAME =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";
const MAX_AVATAR_SIZE = 2 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function isCustomerStatusValue(value: string | null | undefined): value is CustomerFormValues["status"] {
  return isCustomerStatus(value);
}

function isCustomerSourceValue(value: string | null | undefined): value is CustomerFormValues["source"] {
  return isCustomerSource(value);
}

function SelectField({
  id,
  value,
  options,
  disabled,
  placeholder,
  onChange,
}: {
  id: string;
  value: string;
  options: ReadonlyArray<readonly [string, string]>;
  disabled: boolean;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <FormSelect
      id={id}
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      options={options.map(([optionValue, label]) => ({
        value: optionValue,
        label,
      }))}
      onChange={onChange}
    />
  );
}

function ownerName(value: Owner | Owner[] | null | undefined) {
  const item = relationOne(value);
  return item?.name || item?.phone || "-";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getSourceBadges(customer: Pick<CustomerRecord, "has_old_customer_new_lead" | "has_platform_new_lead" | "has_employee_share">) {
  return [
    customer.has_old_customer_new_lead
      ? { key: "old_customer_new_lead", label: "老客户新线索", variant: "warning" as const }
      : null,
    customer.has_platform_new_lead
      ? { key: "platform_new_lead", label: "平台新线索", variant: "default" as const }
      : null,
    customer.has_employee_share
      ? { key: "employee_share", label: "员工分享", variant: "secondary" as const }
      : null,
  ].filter((item): item is { key: string; label: string; variant: "warning" | "default" | "secondary" } => Boolean(item));
}

function SourceTags({ customer }: { customer: CustomerRecord }) {
  const badges = getSourceBadges(customer);
  if (badges.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1">
      {badges.map((badge) => (
        <Badge key={badge.key} variant={badge.variant}>{badge.label}</Badge>
      ))}
    </div>
  );
}

function sourceActorName(source: CustomerSourceRecord) {
  return source.source_employee?.name
    || source.assigned_by?.name
    || source.source_employee?.phone
    || source.assigned_by?.phone
    || "-";
}

function getPayloadMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

async function requestCustomer(input: {
  path: string;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  payload?: unknown;
}) {
  const response = await fetch(`/api/backend${input.path}`, {
    method: input.method || "GET",
    headers: input.payload ? { "content-type": "application/json" } : undefined,
    body: input.payload ? JSON.stringify(input.payload) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(getPayloadMessage(payload, "操作失败"));
  }
  return payload.data;
}

async function uploadCustomerAvatar(file: File) {
  if (!ALLOWED_AVATAR_TYPES.has(file.type)) {
    throw new Error("头像仅支持 JPG、PNG、WebP、HEIC、HEIF");
  }

  if (file.size > MAX_AVATAR_SIZE) {
    throw new Error("头像图片不能超过 2MB");
  }

  const formData = new FormData();
  formData.append("scene", "customer_avatar");
  formData.append("files", file);

  const response = await fetch("/api/backend/uploads/images", {
    method: "POST",
    body: formData,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(getPayloadMessage(payload, "上传头像失败"));
  }

  const uploaded = payload.data?.list?.[0] || {};
  const storageValue = uploaded.storage_path || uploaded.object_key || uploaded.path || uploaded.url;
  const previewUrl = uploaded.url || storageValue;
  if (typeof storageValue !== "string" || !storageValue) {
    throw new Error("头像上传成功但未返回图片地址");
  }

  return {
    value: storageValue,
    previewUrl: typeof previewUrl === "string" ? previewUrl : storageValue,
  };
}

function buildDefaults(customer?: CustomerRecord): CustomerFormValues {
  const primaryProperty = (customer?.properties || []).find((item) => item.is_primary) ||
    customer?.properties?.[0];

  return {
    name: customer?.name || "",
    avatar: customer?.avatar || "",
    phone: customer?.phone || "",
    status: isCustomerStatusValue(customer?.status) ? customer.status : "potential",
    source: isCustomerSourceValue(customer?.source) ? customer.source : "walk_in",
    owner_id: customer?.owner_id || relationOne(customer?.owner)?.id || "",
    douyin_screenshot_images: (customer?.douyin_screenshot_images || []).join("\n"),
    community: customer?.community || primaryProperty?.community || "",
    building_info: customer?.building_info || primaryProperty?.building_info || "",
    area: customer?.area != null
      ? String(customer.area)
      : primaryProperty?.area != null
        ? String(primaryProperty.area)
        : "",
    layout: customer?.layout || primaryProperty?.layout || "",
  };
}

function useEmployeeOptions(open: boolean, customer?: CustomerRecord) {
  const [options, setOptions] = useState<EmployeeOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    requestCustomer({ path: "/employees?page=1&pageSize=100&status=active" })
      .then((data) => {
        if (cancelled) return;
        setOptions((data?.list || []).map((item: any) => ({
          id: item.id,
          name: item.name ?? null,
          phone: item.phone ?? null,
        })));
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "负责人加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  const fallback = useMemo(() => {
    const owner = relationOne(customer?.owner);
    return owner?.id ? {
      id: owner.id,
      name: owner.name ?? null,
      phone: owner.phone ?? null,
    } : null;
  }, [customer]);

  if (fallback && !options.some((item) => item.id === fallback.id)) {
    return { options: [fallback, ...options], loading, error };
  }

  return { options, loading, error };
}

function CustomerDialog({
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
      status: CustomerFormValues["status"];
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
      status: values.status,
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

    setError("");
    startTransition(async () => {
      try {
        await requestCustomer({
          path: mode === "create" ? "/customers" : `/customers/${customer?.id}`,
          method: mode === "create" ? "POST" : "PATCH",
          payload,
        });
        onOpenChange(false);
        router.refresh();
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
              name="status"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={`${mode}-customer-status`}>状态</FieldLabel>
                  <SelectField
                    id={`${mode}-customer-status`}
                    value={field.value}
                    options={statusOptions}
                    disabled={pending}
                    onChange={field.onChange}
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
                  <select
                    id={`${mode}-customer-owner`}
                    value={field.value}
                    disabled={pending || employees.loading}
                    aria-invalid={fieldState.invalid}
                    className={SELECT_CLASS_NAME}
                    onChange={field.onChange}
                  >
                    <option value="">{employees.loading ? "负责人加载中" : "默认当前账号"}</option>
                    {employees.options.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.name || employee.phone || employee.id}
                      </option>
                    ))}
                  </select>
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

function CustomerDetailDialog({
  customer,
  onClose,
}: {
  customer: CustomerRecord;
  onClose: () => void;
}) {
  const [followUps, setFollowUps] = useState<CustomerFollowUpRecord[]>([]);
  const [sources, setSources] = useState<CustomerSourceRecord[]>([]);
  const [followUpsLoading, setFollowUpsLoading] = useState(false);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [followUpsError, setFollowUpsError] = useState("");
  const [sourcesError, setSourcesError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setFollowUpsLoading(true);
    setSourcesLoading(true);
    setFollowUpsError("");
    setSourcesError("");
    requestCustomer({ path: `/customers/${customer.id}/follow_ups?page=1&pageSize=10` })
      .then((data) => {
        if (!cancelled) setFollowUps(data?.list || []);
      })
      .catch((err) => {
        if (!cancelled) {
          setFollowUpsError(err instanceof Error ? err.message : "跟进记录加载失败");
        }
      })
      .finally(() => {
        if (!cancelled) setFollowUpsLoading(false);
      });
    requestCustomer({ path: `/customers/${customer.id}/sources?page=1&pageSize=20` })
      .then((data) => {
        if (!cancelled) setSources(data?.list || []);
      })
      .catch((err) => {
        if (!cancelled) {
          setSourcesError(err instanceof Error ? err.message : "来源时间线加载失败");
        }
      })
      .finally(() => {
        if (!cancelled) setSourcesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [customer.id]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-[820px] overflow-hidden p-0">
        <DialogHeader className="flex-row items-start justify-between gap-4 border-b p-5 text-left">
          <div>
            <DialogTitle>{customer.name || "未命名客户"}</DialogTitle>
            <DialogDescription>{customer.id}</DialogDescription>
          </div>
          <Button type="button" variant="outline" onClick={onClose}>关闭</Button>
        </DialogHeader>
        <div className="flex max-h-[calc(88vh-82px)] flex-col gap-5 overflow-y-auto p-5">
          <div className="grid gap-3 md:grid-cols-4">
            <InfoItem label="手机号" value={customer.phone || customer.phone_masked || "-"} />
            <InfoItem label="负责人" value={ownerName(customer.owner)} />
            <InfoItem label="来源" value={sourceOptions.find(([value]) => value === customer.source)?.[1] || customer.source || "-"} />
            <InfoItem label="创建时间" value={formatDate(customer.created_at)} />
            <InfoItem label="最近跟进" value={formatDateTime(customer.last_follow_at)} />
            <InfoItem label="下次跟进" value={formatDateTime(customer.next_follow_at)} />
            <InfoItem label="主小区" value={customer.community || "-"} />
            <InfoItem label="楼栋门牌" value={customer.building_info || "-"} />
            <InfoItem label="面积" value={customer.area != null ? `${customer.area}㎡` : "-"} />
            <InfoItem label="户型" value={customer.layout || "-"} />
          </div>
          {customer.latest_source || getSourceBadges(customer).length > 0 ? (
            <section className="rounded-md border bg-muted/20 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Tags />
                  线索来源
                </div>
                <SourceTags customer={customer} />
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <InfoItem
                  label="最近来源"
                  value={customer.latest_source?.display_label || customer.source_summary?.latest_source?.display_label || "-"}
                />
                <InfoItem
                  label="来源时间"
                  value={formatDateTime(customer.latest_source?.created_at || customer.source_summary?.latest_source?.created_at)}
                />
                <InfoItem
                  label="来源总数"
                  value={String(customer.source_summary?.total ?? sources.length ?? 0)}
                />
              </div>
            </section>
          ) : null}
          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">来源时间线</h3>
              <Badge variant="outline">最近 20 条</Badge>
            </div>
            {sourcesError ? <StatusAlert>{sourcesError}</StatusAlert> : null}
            {sourcesLoading ? (
              <div className="flex h-24 items-center justify-center rounded-md border text-sm text-muted-foreground">
                <Loader2 className="mr-2 animate-spin" />
                正在加载来源记录
              </div>
            ) : sources.length > 0 ? (
              <div className="relative ml-3 flex flex-col gap-4 border-l pl-5">
                {sources.map((item) => (
                  <div key={item.id} className="relative rounded-md border bg-background p-3">
                    <span className="absolute -left-[27px] top-4 flex size-4 rounded-full border-2 border-background bg-secondary" />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Share2 />
                        {item.display_label || item.source}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(item.created_at)}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {item.is_old_customer_new_lead ? <Badge variant="warning">老客户新线索</Badge> : null}
                      {item.is_platform_new_lead ? <Badge variant="default">平台新线索</Badge> : null}
                      {item.is_employee_share ? <Badge variant="secondary">员工分享</Badge> : null}
                    </div>
                    <div className="mt-3 grid gap-2 text-xs text-muted-foreground md:grid-cols-3">
                      <div>操作人：{sourceActorName(item)}</div>
                      <div>去重：{item.dedupe_result || "-"}</div>
                      <div>平台线索：{item.platform_lead?.name || item.platform_lead?.phone || "-"}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-md border p-4 text-sm text-muted-foreground">
                暂无来源记录。
              </div>
            )}
          </section>
          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">跟进记录</h3>
              <Badge variant="outline">最近 10 条</Badge>
            </div>
            {followUpsError ? <StatusAlert>{followUpsError}</StatusAlert> : null}
            {followUpsLoading ? (
              <div className="flex h-28 items-center justify-center rounded-md border text-sm text-muted-foreground">
                <Loader2 className="mr-2 size-4 animate-spin" />
                正在加载跟进记录
              </div>
            ) : followUps.length > 0 ? (
              <div className="relative ml-3 flex flex-col gap-4 border-l pl-5">
                {followUps.map((item) => (
                  <div key={item.id} className="relative rounded-md border bg-background p-3">
                    <span className="absolute -left-[27px] top-4 flex size-4 rounded-full border-2 border-background bg-primary" />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <MessageSquareText className="size-4 text-primary" />
                        {item.employee_name || ownerName(item.employee) || "未知员工"}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(item.created_at)}
                      </span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">
                      {item.content}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <CalendarClock className="size-3.5" />
                      下次跟进 {formatDateTime(item.next_follow_at)}
                      {item.comment_count ? (
                        <Badge variant="outline">评论 {item.comment_count}</Badge>
                      ) : null}
                    </div>
                    {item.latest_comment_preview ? (
                      <div className="mt-2 rounded-md bg-muted/60 p-2 text-xs text-muted-foreground">
                        最新评论：{item.latest_comment_preview.author_employee_name || "员工"}：
                        {item.latest_comment_preview.content}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-md border p-4 text-sm text-muted-foreground">
                暂无跟进记录。
              </div>
            )}
          </section>
          <section>
            <h3 className="mb-3 text-sm font-semibold">房产列表</h3>
            <div className="grid gap-2 md:grid-cols-2">
              {(customer.properties || []).map((property) => (
              <div key={property.id} className="rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium">{property.community || "-"}</div>
                    {property.is_primary ? <Badge variant="success">主房产</Badge> : null}
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {[property.building_info, property.layout, property.area != null ? `${property.area}㎡` : null]
                      .filter(Boolean)
                      .join(" · ") || "-"}
                  </div>
                </div>
              ))}
              {(customer.properties || []).length === 0 ? (
                <div className="rounded-md border p-4 text-sm text-muted-foreground">
                  暂无房产
                </div>
              ) : null}
            </div>
          </section>
          {customer.douyin_screenshot_images?.length ? (
            <section>
              <h3 className="mb-3 text-sm font-semibold">抖音截图</h3>
              <div className="flex flex-col gap-2">
                {customer.douyin_screenshot_images.map((image) => (
                  <a
                    key={image}
                    href={image}
                    target="_blank"
                    rel="noreferrer"
                    className="block truncate rounded-md border p-3 text-sm text-primary"
                  >
                    {image}
                  </a>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-sm font-medium">{value}</div>
    </div>
  );
}

export function CreateCustomerButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus />
        新增客户
      </Button>
      <CustomerDialog mode="create" open={open} onOpenChange={setOpen} />
    </>
  );
}

export function CustomerRowActions({ customer }: { customer: CustomerRecord }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [detail, setDetail] = useState<CustomerRecord | null>(null);
  const disabled = pending || customer.status === "invalid";

  function openDetail() {
    setError("");
    startTransition(async () => {
      try {
        const data = await requestCustomer({ path: `/customers/${customer.id}/detail` });
        setDetail(data as CustomerRecord);
      } catch (err) {
        setError(err instanceof Error ? err.message : "详情加载失败");
      }
    });
  }

  function deleteCustomer() {
    if (!window.confirm(`确认作废客户「${customer.name || customer.phone_masked || customer.id}」？`)) return;
    setError("");
    startTransition(async () => {
      try {
        await requestCustomer({
          path: `/customers/${customer.id}`,
          method: "DELETE",
        });
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "作废失败");
      }
    });
  }

  return (
    <div className="relative flex min-w-24 justify-end whitespace-nowrap">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm" disabled={pending}>
            {pending ? (
              <Loader2 className="animate-spin" data-icon="inline-start" />
            ) : (
              <MoreHorizontal data-icon="inline-start" />
            )}
            操作
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="left" sideOffset={8} className="w-36">
          <DropdownMenuGroup>
            <DropdownMenuItem disabled={pending} onSelect={openDetail}>
              <Eye />
              详情
            </DropdownMenuItem>
            <DropdownMenuItem disabled={disabled} onSelect={() => setEditOpen(true)}>
              <Edit3 />
              编辑
            </DropdownMenuItem>
            <DropdownMenuItem disabled={disabled} onSelect={deleteCustomer}>
              <Trash2 />
              作废
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <CustomerDialog
        mode="edit"
        customer={customer}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      {detail ? <CustomerDetailDialog customer={detail} onClose={() => setDetail(null)} /> : null}
      {error ? (
        <div className="absolute right-5 mt-10 max-w-[360px] rounded-md border border-destructive/50 bg-background px-3 py-2 text-xs text-destructive shadow-sm">
          {error}
        </div>
      ) : null}
    </div>
  );
}
