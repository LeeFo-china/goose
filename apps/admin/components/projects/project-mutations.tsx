"use client";

import { FormEvent, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Edit3,
  Eye,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type RelationPerson = {
  id?: string | null;
  name?: string | null;
  phone?: string | null;
  avatar?: string | null;
};

type CustomerRelation = {
  id?: string | null;
  name?: string | null;
  phone?: string | null;
  phone_masked?: string | null;
  owner?: RelationPerson | RelationPerson[] | null;
};

type PropertyRelation = {
  id?: string | null;
  community?: string | null;
  building_info?: string | null;
  area?: number | null;
  layout?: string | null;
};

export type ProjectRecord = {
  id: string;
  name: string;
  status: string | null;
  budget: number | null;
  signed_amount?: number | null;
  start_date: string | null;
  created_at: string | null;
  address: string | null;
  customer_id?: string | null;
  property_id?: string | null;
  designer_id?: string | null;
  supervisor_id?: string | null;
  style_tags?: string[];
  visibility_status?: string | null;
  customer?: CustomerRelation | CustomerRelation[] | null;
  property?: PropertyRelation | PropertyRelation[] | null;
  designer?: RelationPerson | RelationPerson[] | null;
  supervisor?: RelationPerson | RelationPerson[] | null;
  members?: Array<{
    id: string;
    role_name: string;
    role_code: string;
    employee?: RelationPerson | null;
    is_primary?: boolean;
    is_virtual?: boolean;
  }>;
};

type Option = {
  id: string;
  label: string;
  description?: string | null;
};

type ProjectMode = "create" | "edit";

type ProjectFormState = {
  name: string;
  status: string;
  customer_id: string;
  designer_id: string;
  supervisor_id: string;
  budget: string;
  signed_amount: string;
  start_date: string;
  address: string;
  visibility_status: string;
  style_tags: string;
};

const statusOptions = [
  ["lead", "线索客户"],
  ["measure", "量房中"],
  ["negotiating", "谈单中"],
  ["signed", "已签约"],
  ["designing", "设计中"],
  ["constructing", "施工中"],
  ["on_hold", "已暂停"],
  ["acceptance", "验收中"],
  ["completed", "已完工"],
  ["after_sale", "售后中"],
  ["invalid", "无效客户"],
] as const;

const visibilityOptions = [
  ["inherit", "跟随状态"],
  ["public", "强制展示"],
  ["hidden", "隐藏"],
] as const;

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function personName(value: RelationPerson | RelationPerson[] | null | undefined) {
  const item = relationOne(value);
  return item?.name || item?.phone || "-";
}

function customerName(value: CustomerRelation | CustomerRelation[] | null | undefined) {
  const item = relationOne(value);
  return item?.name || item?.phone_masked || item?.phone || "-";
}

function propertyLabel(value: PropertyRelation | PropertyRelation[] | null | undefined) {
  const item = relationOne(value);
  if (!item) return "-";
  return [item.community, item.building_info].filter(Boolean).join(" ") || "-";
}

function formatMoney(value: number | string | null | undefined) {
  const amount = Number(value || 0);
  return amount.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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

async function requestProject(input: {
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

function buildDefaults(project?: ProjectRecord): ProjectFormState {
  return {
    name: project?.name || "",
    status: project?.status || "lead",
    customer_id: project?.customer_id || relationOne(project?.customer)?.id || "",
    designer_id: project?.designer_id || relationOne(project?.designer)?.id || "",
    supervisor_id: project?.supervisor_id || relationOne(project?.supervisor)?.id || "",
    budget: project?.budget != null ? String(project.budget) : "",
    signed_amount: project?.signed_amount != null ? String(project.signed_amount) : "",
    start_date: project?.start_date ? project.start_date.slice(0, 10) : "",
    address: project?.address || "",
    visibility_status: project?.visibility_status || "inherit",
    style_tags: (project?.style_tags || []).join(","),
  };
}

function useSelectOptions(open: boolean, project?: ProjectRecord) {
  const [customers, setCustomers] = useState<Option[]>([]);
  const [designers, setDesigners] = useState<Option[]>([]);
  const [supervisors, setSupervisors] = useState<Option[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    Promise.all([
      requestProject({ path: "/projects/create/customers?page=1&pageSize=80" }),
      requestProject({ path: "/projects/create/employees?scene=project_designer&page=1&pageSize=80" }),
      requestProject({ path: "/projects/create/employees?scene=project_supervisor&page=1&pageSize=80" }),
    ])
      .then(([customerData, designerData, supervisorData]) => {
        if (cancelled) return;
        setCustomers((customerData?.list || []).map((item: any) => ({
          id: item.id,
          label: item.name || item.phone_masked || item.id,
          description: item.phone_masked || null,
        })));
        setDesigners((designerData?.list || []).map((item: any) => ({
          id: item.id,
          label: item.name || item.phone || item.id,
          description: item.post_name || item.department_name || null,
        })));
        setSupervisors((supervisorData?.list || []).map((item: any) => ({
          id: item.id,
          label: item.name || item.phone || item.id,
          description: item.post_name || item.department_name || null,
        })));
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "选项加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  const customerFallback = useMemo(() => {
    const customer = relationOne(project?.customer);
    return customer?.id ? {
      id: customer.id,
      label: customerName(customer),
      description: customer.phone_masked || customer.phone || null,
    } : null;
  }, [project]);
  const designerFallback = useMemo(() => {
    const designer = relationOne(project?.designer);
    return designer?.id ? {
      id: designer.id,
      label: personName(designer),
      description: null,
    } : null;
  }, [project]);
  const supervisorFallback = useMemo(() => {
    const supervisor = relationOne(project?.supervisor);
    return supervisor?.id ? {
      id: supervisor.id,
      label: personName(supervisor),
      description: null,
    } : null;
  }, [project]);

  return {
    loading,
    error,
    customers: mergeFallback(customers, customerFallback),
    designers: mergeFallback(designers, designerFallback),
    supervisors: mergeFallback(supervisors, supervisorFallback),
  };
}

function mergeFallback(options: Option[], fallback: Option | null) {
  if (!fallback || options.some((item) => item.id === fallback.id)) return options;
  return [fallback, ...options];
}

function OptionSelect({
  id,
  value,
  options,
  disabled,
  placeholder,
  onChange,
}: {
  id: string;
  value: string;
  options: Option[];
  disabled: boolean;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <select
      id={id}
      value={value}
      disabled={disabled}
      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.description ? `${option.label} · ${option.description}` : option.label}
        </option>
      ))}
    </select>
  );
}

function ProjectDialog({
  mode,
  project,
  open,
  onOpenChange,
}: {
  mode: ProjectMode;
  project?: ProjectRecord;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const defaults = useMemo(() => buildDefaults(project), [project]);
  const [formState, setFormState] = useState<ProjectFormState>(defaults);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const options = useSelectOptions(open, project);

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
    const styleTags = formState.style_tags
      .split(/[,，\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
    const payload = {
      name: formState.name.trim(),
      status: formState.status,
      customer_id: formState.customer_id || null,
      designer_id: formState.designer_id || null,
      supervisor_id: formState.supervisor_id || null,
      budget: formState.budget ? Number(formState.budget) : null,
      signed_amount: formState.signed_amount ? Number(formState.signed_amount) : null,
      start_date: formState.start_date || null,
      address: formState.address.trim() || null,
      visibility_status: formState.visibility_status,
      style_tags: styleTags,
    };

    setError("");
    startTransition(async () => {
      try {
        await requestProject({
          path: mode === "create" ? "/projects" : `/projects/${project?.id}`,
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
            {mode === "create" ? "新增项目" : "编辑项目"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            维护项目基础档案、客户、设计师、工程负责人和展示状态。
          </p>
        </div>
        <form className="max-h-[calc(88vh-82px)] space-y-4 overflow-y-auto p-5" onSubmit={submit}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor={`${mode}-project-name`}>项目名称</Label>
              <Input
                id={`${mode}-project-name`}
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
              <Label htmlFor={`${mode}-project-status`}>状态</Label>
              <select
                id={`${mode}-project-status`}
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
              <Label htmlFor={`${mode}-project-visibility`}>展示状态</Label>
              <select
                id={`${mode}-project-visibility`}
                value={formState.visibility_status}
                disabled={pending}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                onChange={(event) => setFormState((current) => ({
                  ...current,
                  visibility_status: event.target.value,
                }))}
              >
                {visibilityOptions.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor={`${mode}-project-customer`}>客户</Label>
              <OptionSelect
                id={`${mode}-project-customer`}
                value={formState.customer_id}
                options={options.customers}
                disabled={pending || options.loading}
                placeholder={options.loading ? "客户加载中" : "不关联客户"}
                onChange={(value) => setFormState((current) => ({
                  ...current,
                  customer_id: value,
                }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${mode}-project-designer`}>设计师</Label>
              <OptionSelect
                id={`${mode}-project-designer`}
                value={formState.designer_id}
                options={options.designers}
                disabled={pending || options.loading}
                placeholder={options.loading ? "设计师加载中" : "未选择"}
                onChange={(value) => setFormState((current) => ({
                  ...current,
                  designer_id: value,
                }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${mode}-project-supervisor`}>工程负责人</Label>
              <OptionSelect
                id={`${mode}-project-supervisor`}
                value={formState.supervisor_id}
                options={options.supervisors}
                disabled={pending || options.loading}
                placeholder={options.loading ? "负责人加载中" : "未选择"}
                onChange={(value) => setFormState((current) => ({
                  ...current,
                  supervisor_id: value,
                }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${mode}-project-budget`}>预算</Label>
              <Input
                id={`${mode}-project-budget`}
                type="number"
                min="0"
                step="0.01"
                value={formState.budget}
                disabled={pending}
                onChange={(event) => setFormState((current) => ({
                  ...current,
                  budget: event.target.value,
                }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${mode}-project-signed-amount`}>签约金额</Label>
              <Input
                id={`${mode}-project-signed-amount`}
                type="number"
                min="0"
                step="0.01"
                value={formState.signed_amount}
                disabled={pending}
                onChange={(event) => setFormState((current) => ({
                  ...current,
                  signed_amount: event.target.value,
                }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${mode}-project-start-date`}>开工日期</Label>
              <Input
                id={`${mode}-project-start-date`}
                type="date"
                value={formState.start_date}
                disabled={pending}
                onChange={(event) => setFormState((current) => ({
                  ...current,
                  start_date: event.target.value,
                }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${mode}-project-tags`}>风格标签</Label>
              <Input
                id={`${mode}-project-tags`}
                value={formState.style_tags}
                placeholder="现代,轻奢"
                disabled={pending}
                onChange={(event) => setFormState((current) => ({
                  ...current,
                  style_tags: event.target.value,
                }))}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor={`${mode}-project-address`}>项目地址</Label>
              <textarea
                id={`${mode}-project-address`}
                value={formState.address}
                disabled={pending}
                className="min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                onChange={(event) => setFormState((current) => ({
                  ...current,
                  address: event.target.value,
                }))}
              />
            </div>
          </div>
          {options.error ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
              {options.error}
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
            <Button type="submit" disabled={pending || options.loading}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              {mode === "create" ? "创建项目" : "保存修改"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ProjectDetailDialog({
  project,
  onClose,
}: {
  project: ProjectRecord;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-4">
      <div className="max-h-[88vh] w-full max-w-[860px] overflow-hidden rounded-lg border bg-card shadow-[0_20px_80px_rgba(15,23,42,0.22)]">
        <div className="flex items-start justify-between gap-4 border-b p-5">
          <div>
            <h2 className="text-base font-semibold">{project.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{project.id}</p>
          </div>
          <Button type="button" variant="outline" onClick={onClose}>关闭</Button>
        </div>
        <div className="max-h-[calc(88vh-82px)] space-y-5 overflow-y-auto p-5">
          <div className="grid gap-3 md:grid-cols-4">
            <InfoItem label="客户" value={customerName(project.customer)} />
            <InfoItem label="房产" value={propertyLabel(project.property)} />
            <InfoItem label="预算" value={`¥${formatMoney(project.budget)}`} />
            <InfoItem label="签约金额" value={`¥${formatMoney(project.signed_amount)}`} />
            <InfoItem label="设计师" value={personName(project.designer)} />
            <InfoItem label="工程负责人" value={personName(project.supervisor)} />
            <InfoItem label="开工日期" value={formatDate(project.start_date)} />
            <InfoItem label="展示状态" value={project.visibility_status || "inherit"} />
          </div>
          <section>
            <h3 className="mb-3 text-sm font-semibold">项目地址</h3>
            <div className="rounded-md border p-4 text-sm text-muted-foreground">
              {project.address || "-"}
            </div>
          </section>
          <section>
            <h3 className="mb-3 text-sm font-semibold">项目成员</h3>
            <div className="grid gap-2 md:grid-cols-2">
              {(project.members || []).map((member) => (
                <div key={member.id} className="rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium">{member.role_name}</div>
                    {member.is_primary ? <Badge variant="success">主责</Badge> : null}
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {personName(member.employee)}
                    {member.is_virtual ? " · 客户归属" : ""}
                  </div>
                </div>
              ))}
              {(project.members || []).length === 0 ? (
                <div className="rounded-md border p-4 text-sm text-muted-foreground">
                  暂无成员
                </div>
              ) : null}
            </div>
          </section>
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

export function CreateProjectButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus />
        新增项目
      </Button>
      <ProjectDialog mode="create" open={open} onOpenChange={setOpen} />
    </>
  );
}

export function ProjectRowActions({ project }: { project: ProjectRecord }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [detail, setDetail] = useState<ProjectRecord | null>(null);
  const disabled = pending || project.status === "invalid";

  function openDetail() {
    setError("");
    startTransition(async () => {
      try {
        const data = await requestProject({ path: `/projects/${project.id}` });
        setDetail(data as ProjectRecord);
      } catch (err) {
        setError(err instanceof Error ? err.message : "详情加载失败");
      }
    });
  }

  function deleteProject() {
    if (!window.confirm(`确认作废项目「${project.name}」？`)) return;
    setError("");
    startTransition(async () => {
      try {
        await requestProject({
          path: `/projects/${project.id}`,
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
      <Button type="button" variant="outline" size="sm" onClick={deleteProject} disabled={disabled}>
        <Trash2 />
        作废
      </Button>
      <ProjectDialog
        mode="edit"
        project={project}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      {detail ? <ProjectDetailDialog project={detail} onClose={() => setDetail(null)} /> : null}
      {error ? (
        <div className="absolute right-5 mt-10 max-w-[360px] rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 shadow-sm">
          {error}
        </div>
      ) : null}
    </div>
  );
}
