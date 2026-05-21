"use client";

import { FormEvent, useEffect, useMemo, useState, useTransition } from "react";
import {
  ProjectStatusActionConfig,
  PROJECT_STATUS_VALUES,
  ProjectStatusConfig,
} from "@gooes/domain";
import { useRouter } from "next/navigation";
import {
  Check,
  ArrowRight,
  Edit3,
  Eye,
  History,
  Loader2,
  Plus,
  Trash2,
  UserPlus,
} from "lucide-react";
import { ConfirmActionDialog } from "@/components/admin/action-dialogs";
import { FormSelect } from "@/components/admin/form-select";
import { StatusAlert } from "@/components/admin/status-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ProjectLogsPanel } from "@/components/projects/project-logs-dialog";
import { ProjectAcceptancesPanel } from "@/components/projects/project-acceptances-panel";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type RelationPerson = {
  id?: string | null;
  name?: string | null;
  phone?: string | null;
  avatar?: string | null;
  department_name?: string | null;
  post_name?: string | null;
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
    employee_id: string;
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

type EmployeeOption = {
  id: string;
  name: string | null;
  phone: string | null;
  avatar?: string | null;
  department_name?: string | null;
  post_name?: string | null;
};

type ProjectMode = "create" | "edit";
type ProjectDetailTab = "overview" | "members" | "logs" | "acceptances";
type BadgeVariant = "default" | "secondary" | "outline" | "success" | "warning" | "danger";

type ProjectStatusActionItem = {
  action: string;
  label: string;
  from_status: string;
  to_status: string;
  requires_reason?: boolean;
};

type ProjectStatusActionsResponse = {
  current_status: string;
  paused_from_status?: string | null;
  actions: ProjectStatusActionItem[];
};

type ProjectStatusTransitionRecord = {
  id: string;
  from_status: string | null;
  to_status: string;
  action: string;
  reason: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
};

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
  ...PROJECT_STATUS_VALUES.map((value) => [
    value,
    ProjectStatusConfig[value].label,
  ] as const),
];

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

function statusVariant(type: string | null | undefined): BadgeVariant {
  if (type === "success") return "success";
  if (type === "warning") return "warning";
  if (type === "danger") return "danger";
  if (type === "primary") return "default";
  return "secondary";
}

function projectStatusLabel(status: string | null | undefined) {
  return status && status in ProjectStatusConfig
    ? ProjectStatusConfig[status as keyof typeof ProjectStatusConfig].label
    : status || "-";
}

function projectStatusBadgeVariant(status: string | null | undefined) {
  return status && status in ProjectStatusConfig
    ? statusVariant(ProjectStatusConfig[status as keyof typeof ProjectStatusConfig].type)
    : "outline";
}

function projectActionLabel(action: string) {
  return action in ProjectStatusActionConfig
    ? ProjectStatusActionConfig[action as keyof typeof ProjectStatusActionConfig].label
    : action;
}

function blockedProjectActions(currentStatus: string | null | undefined) {
  if (currentStatus === "negotiating") {
    return [
      {
        action: "sign_contract",
        label: "项目签约",
        reason: "需先开始设计",
      },
    ];
  }

  return [];
}

function isProjectStatusActionVisible(
  actions: ProjectStatusActionItem[],
  action: string,
) {
  return actions.some((item) => item.action === action);
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

function ProjectStatusPanel({
  project,
  onChanged,
}: {
  project: ProjectRecord;
  onChanged: () => Promise<void>;
}) {
  const [actionsData, setActionsData] = useState<ProjectStatusActionsResponse | null>(null);
  const [transitions, setTransitions] = useState<ProjectStatusTransitionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [selectedAction, setSelectedAction] = useState<ProjectStatusActionItem | null>(null);
  const [reason, setReason] = useState("");
  const [signedAmount, setSignedAmount] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    Promise.all([
      requestProject({ path: `/projects/${project.id}/status-actions` }),
      requestProject({ path: `/projects/${project.id}/status-transitions?page=1&pageSize=20` }),
    ])
      .then(([actions, timeline]) => {
        if (cancelled) return;
        setActionsData(actions as ProjectStatusActionsResponse);
        setTransitions((timeline?.rows || []) as ProjectStatusTransitionRecord[]);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "状态信息加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [project.id, project.status]);

  function closeActionDialog() {
    if (pending) return;
    setSelectedAction(null);
    setReason("");
    setSignedAmount("");
  }

  function openActionDialog(action: ProjectStatusActionItem) {
    setError("");
    setSelectedAction(action);
    setReason("");
    setSignedAmount(action.action === "sign_contract" && project.signed_amount
      ? String(project.signed_amount)
      : "");
  }

  function submitAction() {
    if (!selectedAction) return;
    const normalizedReason = reason.trim();
    const normalizedSignedAmount = Number(signedAmount);
    if (selectedAction.requires_reason && !normalizedReason) {
      setError("该状态动作必须填写原因");
      return;
    }
    if (
      selectedAction.action === "sign_contract" &&
      (!Number.isFinite(normalizedSignedAmount) || normalizedSignedAmount <= 0)
    ) {
      setError("项目签约时必须填写有效签约金额");
      return;
    }

    setError("");
    startTransition(async () => {
      try {
        await requestProject({
          path: `/projects/${project.id}/status-transition`,
          method: "POST",
          payload: {
            action: selectedAction.action,
            reason: normalizedReason || undefined,
            signed_amount: selectedAction.action === "sign_contract"
              ? normalizedSignedAmount
              : undefined,
            metadata: { source: "admin" },
          },
        });
        setSelectedAction(null);
        setReason("");
        setSignedAmount("");
        await onChanged();
      } catch (err) {
        setError(err instanceof Error ? err.message : "状态变更失败");
      }
    });
  }

  const currentStatus = actionsData?.current_status || project.status;
  const actions = actionsData?.actions || [];
  const blockedActions = blockedProjectActions(currentStatus).filter((item) =>
    !isProjectStatusActionVisible(actions, item.action)
  );

  return (
    <section className="rounded-md border bg-muted/20 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-sm font-semibold">状态流转</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant={projectStatusBadgeVariant(currentStatus)}>
              {projectStatusLabel(currentStatus)}
            </Badge>
            {actionsData?.paused_from_status ? (
              <Badge variant="outline">
                暂停前：{projectStatusLabel(actionsData.paused_from_status)}
              </Badge>
            ) : null}
            {loading ? (
              <Badge variant="secondary">
                <Loader2 className="animate-spin" data-icon="inline-start" />
                正在加载
              </Badge>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {actions.map((action) => (
            <Button
              key={action.action}
              type="button"
              size="sm"
              variant={action.action === "mark_invalid" ? "destructive" : "outline"}
              disabled={loading || pending}
              onClick={() => openActionDialog(action)}
            >
              {action.label}
            </Button>
          ))}
          {blockedActions.map((action) => (
            <Button
              key={action.action}
              type="button"
              size="sm"
              variant="outline"
              disabled
              title={action.reason}
            >
              {action.label}
              <span className="text-xs text-muted-foreground">({action.reason})</span>
            </Button>
          ))}
          {!loading && actions.length === 0 ? (
            <Badge variant="outline">暂无可执行动作</Badge>
          ) : null}
        </div>
      </div>
      {error ? (
        <div className="mt-3">
          <StatusAlert>{error}</StatusAlert>
        </div>
      ) : null}
      <div className="mt-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <History />
            状态时间线
          </div>
          <Badge variant="outline">最近 20 条</Badge>
        </div>
        {transitions.length > 0 ? (
          <div className="relative ml-3 flex flex-col gap-3 border-l pl-5">
            {transitions.map((item) => (
              <div key={item.id} className="relative rounded-md border bg-background p-3">
                <span className="absolute -left-[27px] top-4 flex size-4 rounded-full border-2 border-background bg-primary" />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    <Badge variant={projectStatusBadgeVariant(item.from_status)}>
                      {projectStatusLabel(item.from_status)}
                    </Badge>
                    <ArrowRight />
                    <Badge variant={projectStatusBadgeVariant(item.to_status)}>
                      {projectStatusLabel(item.to_status)}
                    </Badge>
                    <span>{projectActionLabel(item.action)}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(item.created_at)}
                  </span>
                </div>
                {item.reason ? (
                  <p className="mt-2 text-sm text-muted-foreground">{item.reason}</p>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-md border bg-background p-4 text-sm text-muted-foreground">
            暂无状态流转记录。
          </div>
        )}
      </div>
      <Dialog open={Boolean(selectedAction)} onOpenChange={(open) => !open && closeActionDialog()}>
        <DialogContent className="max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{selectedAction?.label || "状态变更"}</DialogTitle>
            <DialogDescription>
              {selectedAction
                ? `${projectStatusLabel(selectedAction.from_status)} -> ${projectStatusLabel(selectedAction.to_status)}`
                : "确认执行该状态动作。"}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            {selectedAction?.action === "sign_contract" ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor="project-status-signed-amount">签约金额</Label>
                <Input
                  id="project-status-signed-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={signedAmount}
                  disabled={pending}
                  onChange={(event) => setSignedAmount(event.target.value)}
                />
              </div>
            ) : null}
            <div className="flex flex-col gap-2">
              <Label htmlFor="project-status-reason">
                {selectedAction?.requires_reason ? "原因" : "备注"}
              </Label>
              <Textarea
                id="project-status-reason"
                value={reason}
                disabled={pending}
                placeholder={selectedAction?.requires_reason ? "请输入原因" : "可选"}
                className="min-h-[96px]"
                onChange={(event) => setReason(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={closeActionDialog}>
              取消
            </Button>
            <Button
              type="button"
              variant={selectedAction?.action === "mark_invalid" ? "destructive" : "default"}
              disabled={pending}
              onClick={submitAction}
            >
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              确认执行
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
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
    <FormSelect
      id={id}
      value={value || "__none"}
      disabled={disabled}
      options={[
        { value: "__none", label: placeholder },
        ...options.map((option) => ({
          value: option.id,
          label: option.description
            ? `${option.label} · ${option.description}`
            : option.label,
        })),
      ]}
      onChange={(nextValue) => onChange(nextValue === "__none" ? "" : nextValue)}
    />
  );
}

function getEmployeeOptionLabel(employee: EmployeeOption | RelationPerson | null | undefined) {
  if (!employee) return "-";
  return employee.name || employee.phone || employee.id || "-";
}

function getEmployeeMeta(employee: EmployeeOption | RelationPerson | null | undefined) {
  if (!employee) return "";
  return [
    employee.department_name,
    employee.post_name,
    employee.phone,
  ].filter(Boolean).join(" · ");
}

function AddProjectMemberDialog({
  projectId,
  existingEmployeeIds,
  onAdded,
}: {
  projectId: string;
  existingEmployeeIds: string[];
  onAdded: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [candidates, setCandidates] = useState<EmployeeOption[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [loading, setLoading] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const existingEmployeeIdSet = useMemo(
    () => new Set(existingEmployeeIds),
    [existingEmployeeIds],
  );
  const availableCandidates = useMemo(
    () => candidates.filter((item) => !existingEmployeeIdSet.has(item.id)),
    [candidates, existingEmployeeIdSet],
  );
  const selectedEmployee = availableCandidates.find(
    (item) => item.id === selectedEmployeeId,
  );

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const query = new URLSearchParams({
        page: "1",
        pageSize: "20",
      });
      const normalizedKeyword = keyword.trim();
      if (normalizedKeyword) query.set("keyword", normalizedKeyword);

      setLoading(true);
      setError("");
      fetch(`/api/backend/projects/${projectId}/member-candidates?${query.toString()}`, {
        signal: controller.signal,
        cache: "no-store",
      })
        .then((response) => response.json().then((payload) => ({ response, payload })))
        .then(({ response, payload }) => {
          if (!response.ok || payload.success === false) {
            throw new Error(getPayloadMessage(payload, "员工候选加载失败"));
          }
          setCandidates((payload.data?.list || []) as EmployeeOption[]);
        })
        .catch((err) => {
          if (err instanceof DOMException && err.name === "AbortError") return;
          setCandidates([]);
          setError(err instanceof Error ? err.message : "员工候选加载失败");
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, keyword, projectId]);

  function resetAndClose() {
    setOpen(false);
    setKeyword("");
    setSelectedEmployeeId("");
    setError("");
  }

  function close() {
    if (pending) return;
    resetAndClose();
  }

  function submit() {
    if (!selectedEmployeeId) {
      setError("请选择员工");
      return;
    }

    setError("");
    startTransition(async () => {
      try {
        await requestProject({
          path: `/projects/${projectId}/members`,
          method: "POST",
          payload: {
            employee_id: selectedEmployeeId,
            is_primary: false,
          },
        });
        await onAdded();
        resetAndClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "添加成员失败");
      }
    });
  }

  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        <UserPlus data-icon="inline-start" />
        添加员工
      </Button>
      <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? setOpen(true) : close())}>
        <DialogContent className="max-w-[520px] p-0">
          <DialogHeader className="border-b p-5">
            <DialogTitle>添加项目成员</DialogTitle>
            <DialogDescription>
              直接选择租户员工加入项目，不需要配置项目角色。
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 p-5">
            <Command shouldFilter={false} className="rounded-md border">
              <CommandInput
                value={keyword}
                onValueChange={setKeyword}
                placeholder="搜索员工姓名或手机号"
              />
              <CommandList className="max-h-[320px]">
                <CommandEmpty>
                  {loading ? "加载中..." : "没有可添加的员工"}
                </CommandEmpty>
                <CommandGroup>
                  {availableCandidates.map((employee) => {
                    const selected = employee.id === selectedEmployeeId;
                    return (
                      <CommandItem
                        key={employee.id}
                        value={`${employee.name || ""} ${employee.phone || ""} ${employee.department_name || ""} ${employee.post_name || ""}`}
                        onSelect={() => setSelectedEmployeeId(employee.id)}
                        className="cursor-pointer"
                      >
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-sm font-medium">
                            {getEmployeeOptionLabel(employee)}
                          </span>
                          <span className="truncate text-xs text-muted-foreground">
                            {getEmployeeMeta(employee) || "暂无部门岗位信息"}
                          </span>
                        </span>
                        {selected ? <Check data-icon="inline-end" /> : null}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
            {selectedEmployee ? (
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                <span className="font-medium">{getEmployeeOptionLabel(selectedEmployee)}</span>
                <span className="ml-2 text-muted-foreground">
                  {getEmployeeMeta(selectedEmployee)}
                </span>
              </div>
            ) : null}
            {error ? <StatusAlert>{error}</StatusAlert> : null}
          </div>
          <DialogFooter className="border-t p-5">
            <Button type="button" variant="outline" onClick={close} disabled={pending}>
              取消
            </Button>
            <Button type="button" onClick={submit} disabled={pending || !selectedEmployeeId}>
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              添加
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
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
    const payload: {
      name: string;
      status?: string;
      customer_id: string | null;
      designer_id: string | null;
      supervisor_id: string | null;
      budget: number | null;
      signed_amount: number | null;
      start_date: string | null;
      address: string | null;
      visibility_status: string;
      style_tags: string[];
    } = {
      name: formState.name.trim(),
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
    if (mode === "create") {
      payload.status = formState.status;
    }

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
    <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? onOpenChange(true) : close())}>
      <DialogContent className="max-h-[88vh] max-w-[720px] overflow-hidden p-0">
        <DialogHeader className="border-b p-5">
          <DialogTitle>
            {mode === "create" ? "新增项目" : "编辑项目"}
          </DialogTitle>
          <DialogDescription>
            维护项目基础档案、客户、设计师、工程负责人和展示状态。
          </DialogDescription>
        </DialogHeader>
        <form className="flex max-h-[calc(88vh-82px)] flex-col gap-4 overflow-y-auto p-5" onSubmit={submit}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2 md:col-span-2">
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
            {mode === "create" ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor={`${mode}-project-status`}>初始状态</Label>
                <FormSelect
                  id={`${mode}-project-status`}
                  value={formState.status}
                  disabled={pending}
                  options={statusOptions.map(([value, label]) => ({
                    value,
                    label,
                  }))}
                  onChange={(value) => setFormState((current) => ({
                    ...current,
                    status: value,
                  }))}
                />
              </div>
            ) : null}
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${mode}-project-visibility`}>展示状态</Label>
              <FormSelect
                id={`${mode}-project-visibility`}
                value={formState.visibility_status}
                disabled={pending}
                options={visibilityOptions.map(([value, label]) => ({
                  value,
                  label,
                }))}
                onChange={(value) => setFormState((current) => ({
                  ...current,
                  visibility_status: value,
                }))}
              />
            </div>
            <div className="flex flex-col gap-2 md:col-span-2">
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
            <div className="flex flex-col gap-2">
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
            <div className="flex flex-col gap-2">
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
            <div className="flex flex-col gap-2">
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
            <div className="flex flex-col gap-2">
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
            <div className="flex flex-col gap-2">
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
            <div className="flex flex-col gap-2">
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
            <div className="flex flex-col gap-2 md:col-span-2">
              <Label htmlFor={`${mode}-project-address`}>项目地址</Label>
              <Textarea
                id={`${mode}-project-address`}
                value={formState.address}
                disabled={pending}
                className="min-h-[72px]"
                onChange={(event) => setFormState((current) => ({
                  ...current,
                  address: event.target.value,
                }))}
              />
            </div>
          </div>
          {options.error ? (
            <StatusAlert tone="warning">{options.error}</StatusAlert>
          ) : null}
          {error ? (
            <StatusAlert>{error}</StatusAlert>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close} disabled={pending}>
              取消
            </Button>
            <Button type="submit" disabled={pending || options.loading}>
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              {mode === "create" ? "创建项目" : "保存修改"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ProjectDetailDialog({
  project,
  initialTab,
  onClose,
}: {
  project: ProjectRecord;
  initialTab: ProjectDetailTab;
  onClose: () => void;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ProjectDetailTab>(initialTab);
  const [currentProject, setCurrentProject] = useState(project);
  const [refreshing, setRefreshing] = useState(false);
  const members = currentProject.members || [];
  const existingEmployeeIds = members
    .map((member) => member.employee?.id || member.employee_id)
    .filter((item): item is string => Boolean(item));

  useEffect(() => {
    setCurrentProject(project);
  }, [project]);

  async function refreshProject() {
    setRefreshing(true);
    try {
      const data = await requestProject({ path: `/projects/${currentProject.id}` });
      setCurrentProject(data as ProjectRecord);
      router.refresh();
    } finally {
      setRefreshing(false);
    }
  }

  const updateActiveTab = (value: string) => {
    if (
      value === "overview" ||
      value === "members" ||
      value === "logs" ||
      value === "acceptances"
    ) {
      setActiveTab(value);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex h-[88vh] max-w-[920px] flex-col overflow-hidden p-0">
        <DialogHeader className="flex-row items-start justify-between gap-4 border-b p-5 text-left">
          <div>
            <DialogTitle>{currentProject.name}</DialogTitle>
            <DialogDescription>{currentProject.id}</DialogDescription>
          </div>
          <Button type="button" variant="outline" onClick={onClose}>关闭</Button>
        </DialogHeader>
        <Tabs
          value={activeTab}
          onValueChange={updateActiveTab}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <div className="shrink-0 border-b px-5 pt-4">
            <TabsList>
              <TabsTrigger value="overview">概览</TabsTrigger>
              <TabsTrigger value="members">成员</TabsTrigger>
              <TabsTrigger value="logs">施工日志</TabsTrigger>
              <TabsTrigger value="acceptances">工序验收</TabsTrigger>
            </TabsList>
          </div>
          <div
            className={cn(
              "min-h-0 flex-1 p-5",
              activeTab === "acceptances"
                ? "overflow-hidden"
                : "overflow-y-auto [scrollbar-gutter:stable]",
            )}
          >
            <TabsContent value="overview" className="flex flex-col gap-5">
              <ProjectStatusPanel project={currentProject} onChanged={refreshProject} />
              <div className="grid gap-3 md:grid-cols-4">
                <InfoItem label="客户" value={customerName(currentProject.customer)} />
                <InfoItem label="房产" value={propertyLabel(currentProject.property)} />
                <InfoItem label="预算" value={`¥${formatMoney(currentProject.budget)}`} />
                <InfoItem label="签约金额" value={`¥${formatMoney(currentProject.signed_amount)}`} />
                <InfoItem label="设计师" value={personName(currentProject.designer)} />
                <InfoItem label="工程负责人" value={personName(currentProject.supervisor)} />
                <InfoItem label="开工日期" value={formatDate(currentProject.start_date)} />
                <InfoItem label="展示状态" value={currentProject.visibility_status || "inherit"} />
              </div>
              <section>
                <h3 className="mb-3 text-sm font-semibold">项目地址</h3>
                <div className="rounded-md border p-4 text-sm text-muted-foreground">
                  {currentProject.address || "-"}
                </div>
              </section>
            </TabsContent>
            <TabsContent value="members">
              <section className="flex flex-col gap-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="text-sm font-semibold">项目成员</h3>
                  <div className="flex items-center gap-2">
                    {refreshing ? (
                      <Badge variant="secondary">
                        <Loader2 className="animate-spin" data-icon="inline-start" />
                        正在刷新
                      </Badge>
                    ) : null}
                    <AddProjectMemberDialog
                      projectId={currentProject.id}
                      existingEmployeeIds={existingEmployeeIds}
                      onAdded={refreshProject}
                    />
                  </div>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  {members.map((member) => (
                    <div key={member.id} className="rounded-md border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate font-medium">
                            {personName(member.employee)}
                          </div>
                          <div className="mt-1 truncate text-sm text-muted-foreground">
                            {getEmployeeMeta(member.employee) || "暂无部门岗位信息"}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {member.is_primary ? <Badge variant="success">主责</Badge> : null}
                          {member.is_virtual ? <Badge variant="secondary">客户归属</Badge> : null}
                        </div>
                      </div>
                    </div>
                  ))}
                  {members.length === 0 ? (
                    <div className="rounded-md border p-4 text-sm text-muted-foreground">
                      暂无成员
                    </div>
                  ) : null}
                </div>
              </section>
            </TabsContent>
            <TabsContent value="logs">
              <ProjectLogsPanel project={currentProject} active={activeTab === "logs"} />
            </TabsContent>
            <TabsContent value="acceptances" className="h-full min-h-0">
              <ProjectAcceptancesPanel
                project={currentProject}
                active={activeTab === "acceptances"}
              />
            </TabsContent>
          </div>
        </Tabs>
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
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [detail, setDetail] = useState<{
    project: ProjectRecord;
    initialTab: ProjectDetailTab;
  } | null>(null);
  const disabled = pending || project.status === "invalid";

  function openDetail(initialTab: ProjectDetailTab = "overview") {
    setError("");
    startTransition(async () => {
      try {
        const data = await requestProject({ path: `/projects/${project.id}` });
        setDetail({
          project: data as ProjectRecord,
          initialTab,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "详情加载失败");
      }
    });
  }

  function deleteProject() {
    setError("");
    startTransition(async () => {
      try {
        await requestProject({
          path: `/projects/${project.id}`,
          method: "DELETE",
        });
        setDeleteOpen(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "作废失败");
      }
    });
  }

  return (
    <div className="flex min-w-[220px] flex-nowrap items-center justify-end gap-2 whitespace-nowrap">
      <Button type="button" variant="outline" size="sm" onClick={() => openDetail()} disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <Eye />}
        详情
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => setEditOpen(true)} disabled={disabled}>
        <Edit3 />
        编辑
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => setDeleteOpen(true)} disabled={disabled}>
        <Trash2 />
        作废
      </Button>
      <ProjectDialog
        mode="edit"
        project={project}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      {detail ? (
        <ProjectDetailDialog
          project={detail.project}
          initialTab={detail.initialTab}
          onClose={() => setDetail(null)}
        />
      ) : null}
      <ConfirmActionDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="作废项目"
        description={`确认作废项目「${project.name}」？`}
        confirmLabel="确认作废"
        destructive
        pending={pending}
        onConfirm={deleteProject}
      />
      {error ? (
        <div className="absolute right-5 mt-10 max-w-[360px] rounded-md border border-destructive/50 bg-background px-3 py-2 text-xs text-destructive shadow-sm">
          {error}
        </div>
      ) : null}
    </div>
  );
}
