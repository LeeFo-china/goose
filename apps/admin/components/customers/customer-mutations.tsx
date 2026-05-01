"use client";

import { FormEvent, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Edit3, Eye, Loader2, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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

type CustomerFormState = {
  name: string;
  phone: string;
  status: string;
  source: string;
  owner_id: string;
  douyin_screenshot_images: string;
  community: string;
  building_info: string;
  area: string;
  layout: string;
};

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

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
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

function buildDefaults(customer?: CustomerRecord): CustomerFormState {
  const primaryProperty = (customer?.properties || []).find((item) => item.is_primary) ||
    customer?.properties?.[0];

  return {
    name: customer?.name || "",
    phone: customer?.phone || "",
    status: customer?.status || "potential",
    source: customer?.source || "walk_in",
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
  const [formState, setFormState] = useState<CustomerFormState>(defaults);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const employees = useEmployeeOptions(open, customer);

  useEffect(() => {
    if (open) setFormState(defaults);
  }, [open, defaults]);

  if (!open) return null;

  function close() {
    if (pending) return;
    setError("");
    onOpenChange(false);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const images = formState.douyin_screenshot_images
      .split(/[\n,，]/)
      .map((item) => item.trim())
      .filter(Boolean);
    const hasProperty = Boolean(
      formState.community.trim() ||
        formState.building_info.trim() ||
        formState.layout.trim() ||
        formState.area,
    );
    const payload = {
      name: formState.name.trim(),
      phone: formState.phone.trim(),
      status: formState.status,
      source: formState.source,
      owner_id: formState.owner_id || null,
      douyin_screenshot_images: formState.source === "douyin" ? images : [],
      property: hasProperty
        ? {
          community: formState.community.trim(),
          building_info: formState.building_info.trim() || null,
          area: formState.area ? Number(formState.area) : null,
          layout: formState.layout.trim() || null,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-4">
      <div className="max-h-[88vh] w-full max-w-[720px] overflow-hidden rounded-lg border bg-card shadow-[0_20px_80px_rgba(15,23,42,0.22)]">
        <div className="border-b p-5">
          <h2 className="text-base font-semibold">
            {mode === "create" ? "新增客户" : "编辑客户"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            维护客户基础资料、负责人、来源状态和主房产信息。
          </p>
        </div>
        <form className="max-h-[calc(88vh-82px)] space-y-4 overflow-y-auto p-5" onSubmit={submit}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`${mode}-customer-name`}>客户姓名</Label>
              <Input
                id={`${mode}-customer-name`}
                value={formState.name}
                disabled={pending}
                required
                onChange={(event) => setFormState((current) => ({
                  ...current,
                  name: event.target.value,
                }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${mode}-customer-phone`}>手机号</Label>
              <Input
                id={`${mode}-customer-phone`}
                value={formState.phone}
                disabled={pending}
                required
                pattern="^1[3-9]\\d{9}$"
                onChange={(event) => setFormState((current) => ({
                  ...current,
                  phone: event.target.value,
                }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${mode}-customer-status`}>状态</Label>
              <select
                id={`${mode}-customer-status`}
                value={formState.status}
                disabled={pending}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                onChange={(event) => setFormState((current) => ({
                  ...current,
                  status: event.target.value,
                }))}
              >
                {statusOptions.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${mode}-customer-source`}>来源</Label>
              <select
                id={`${mode}-customer-source`}
                value={formState.source}
                disabled={pending}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                onChange={(event) => setFormState((current) => ({
                  ...current,
                  source: event.target.value,
                }))}
              >
                {sourceOptions.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor={`${mode}-customer-owner`}>负责人</Label>
              <select
                id={`${mode}-customer-owner`}
                value={formState.owner_id}
                disabled={pending || employees.loading}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                onChange={(event) => setFormState((current) => ({
                  ...current,
                  owner_id: event.target.value,
                }))}
              >
                <option value="">{employees.loading ? "负责人加载中" : "默认当前账号"}</option>
                {employees.options.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name || employee.phone || employee.id}
                  </option>
                ))}
              </select>
            </div>
            {formState.source === "douyin" ? (
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor={`${mode}-customer-douyin`}>抖音截图 URL</Label>
                <textarea
                  id={`${mode}-customer-douyin`}
                  value={formState.douyin_screenshot_images}
                  placeholder="抖音来源必填，最多 1 张"
                  disabled={pending}
                  className="min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  onChange={(event) => setFormState((current) => ({
                    ...current,
                    douyin_screenshot_images: event.target.value,
                  }))}
                />
              </div>
            ) : null}
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor={`${mode}-customer-community`}>小区名称</Label>
              <Input
                id={`${mode}-customer-community`}
                value={formState.community}
                disabled={pending}
                onChange={(event) => setFormState((current) => ({
                  ...current,
                  community: event.target.value,
                }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${mode}-customer-building`}>楼栋门牌</Label>
              <Input
                id={`${mode}-customer-building`}
                value={formState.building_info}
                disabled={pending}
                onChange={(event) => setFormState((current) => ({
                  ...current,
                  building_info: event.target.value,
                }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${mode}-customer-area`}>面积</Label>
              <Input
                id={`${mode}-customer-area`}
                type="number"
                min="0"
                step="0.01"
                value={formState.area}
                disabled={pending}
                onChange={(event) => setFormState((current) => ({
                  ...current,
                  area: event.target.value,
                }))}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor={`${mode}-customer-layout`}>户型</Label>
              <Input
                id={`${mode}-customer-layout`}
                value={formState.layout}
                disabled={pending}
                onChange={(event) => setFormState((current) => ({
                  ...current,
                  layout: event.target.value,
                }))}
              />
            </div>
          </div>
          {employees.error ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
              {employees.error}
            </div>
          ) : null}
          {error ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="outline" onClick={close} disabled={pending}>
              取消
            </Button>
            <Button type="submit" disabled={pending || employees.loading}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              {mode === "create" ? "创建客户" : "保存修改"}
            </Button>
          </div>
        </form>
      </div>
    </div>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-4">
      <div className="max-h-[88vh] w-full max-w-[820px] overflow-hidden rounded-lg border bg-card shadow-[0_20px_80px_rgba(15,23,42,0.22)]">
        <div className="flex items-start justify-between gap-4 border-b p-5">
          <div>
            <h2 className="text-base font-semibold">{customer.name || "未命名客户"}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{customer.id}</p>
          </div>
          <Button type="button" variant="outline" onClick={onClose}>关闭</Button>
        </div>
        <div className="max-h-[calc(88vh-82px)] space-y-5 overflow-y-auto p-5">
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
              <div className="space-y-2">
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
      </div>
    </div>
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
    <div className="flex items-center justify-end gap-2">
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
        <div className="absolute right-5 mt-10 max-w-[360px] rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 shadow-sm">
          {error}
        </div>
      ) : null}
    </div>
  );
}
