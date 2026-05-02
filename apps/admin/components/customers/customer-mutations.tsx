"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { z } from "zod";
import { Edit3, Eye, Loader2, Plus, Trash2 } from "lucide-react";
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

export type CustomerRecord = {
  id: string;
  name: string | null;
  phone?: string | null;
  phone_masked?: string | null;
  can_view_phone?: boolean;
  can_call_phone?: boolean;
  can_copy_phone?: boolean;
  owner_id: string | null;
  owner?: Owner | Owner[] | null;
  owner_name?: string | null;
  source: string | null;
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
};

type EmployeeOption = {
  id: string;
  name: string | null;
  phone: string | null;
};

type CustomerMode = "create" | "edit";

const CUSTOMER_STATUS_VALUES = [
  "potential",
  "following",
  "arrived",
  "ordered",
  "contracted",
  "dormant",
  "invalid",
] as const;

const CUSTOMER_SOURCE_VALUES = [
  "douyin",
  "referral",
  "walk_in",
  "telemarketing",
  "platform",
] as const;

const statusOptions = [
  ["potential", "潜在客户"],
  ["following", "跟进中"],
  ["arrived", "已到店"],
  ["ordered", "已下定"],
  ["contracted", "已签约"],
  ["dormant", "沉睡客户"],
  ["invalid", "无效客户"],
] as const;

const sourceOptions = [
  ["douyin", "抖音/短视频"],
  ["referral", "老客介绍"],
  ["walk_in", "自然进店"],
  ["telemarketing", "电销开发"],
  ["platform", "装修平台"],
] as const;

const CustomerFormSchema = z.object({
  name: z.string().trim().min(1, "请输入客户姓名"),
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

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function isCustomerStatusValue(value: string | null | undefined): value is CustomerFormValues["status"] {
  return CUSTOMER_STATUS_VALUES.includes(value as CustomerFormValues["status"]);
}

function isCustomerSourceValue(value: string | null | undefined): value is CustomerFormValues["source"] {
  return CUSTOMER_SOURCE_VALUES.includes(value as CustomerFormValues["source"]);
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

function buildDefaults(customer?: CustomerRecord): CustomerFormValues {
  const primaryProperty = (customer?.properties || []).find((item) => item.is_primary) ||
    customer?.properties?.[0];

  return {
    name: customer?.name || "",
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
  const employees = useEmployeeOptions(open, customer);
  const form = useForm<CustomerFormValues>({
    resolver: zodResolver(CustomerFormSchema as never) as Resolver<CustomerFormValues>,
    defaultValues: defaults,
  });
  const selectedSource = form.watch("source");

  useEffect(() => {
    if (open) form.reset(defaults);
  }, [open, defaults, form]);

  function close() {
    if (pending) return;
    setError("");
    onOpenChange(false);
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
    const payload = {
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
            <InfoItem label="主小区" value={customer.community || "-"} />
            <InfoItem label="楼栋门牌" value={customer.building_info || "-"} />
            <InfoItem label="面积" value={customer.area != null ? `${customer.area}㎡` : "-"} />
            <InfoItem label="户型" value={customer.layout || "-"} />
          </div>
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
    <div className="flex min-w-[228px] flex-nowrap items-center justify-end gap-2 whitespace-nowrap">
      <Button type="button" variant="outline" size="sm" onClick={openDetail} disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <Eye />}
        详情
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => setEditOpen(true)} disabled={disabled}>
        <Edit3 />
        编辑
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={deleteCustomer} disabled={disabled}>
        <Trash2 />
        作废
      </Button>
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
