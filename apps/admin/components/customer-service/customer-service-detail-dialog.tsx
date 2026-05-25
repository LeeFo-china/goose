"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCw, Send, UserRound } from "lucide-react";
import { FormSelect } from "@/components/admin/form-select";
import { ImageAttachmentList } from "@/components/admin/attachment-list";
import { StatusAlert } from "@/components/admin/status-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type {
  CustomerServiceTicket,
  CustomerServiceTicketAction,
  EmployeeOption,
} from "@/components/customer-service/customer-service-types";

type BackendPayload<T> = {
  success?: boolean;
  data?: T;
  message?: string;
};

const statusVariant: Record<string, "default" | "secondary" | "outline" | "success" | "warning" | "danger"> = {
  open: "warning",
  in_progress: "default",
  resolved: "success",
  closed: "secondary",
  cancelled: "danger",
};

function getPayloadMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

async function requestBackend<T>(path: string, init?: RequestInit) {
  const response = await fetch(`/api/backend${path}`, init);
  const payload = await response.json().catch(() => ({})) as BackendPayload<T>;
  if (!response.ok || payload.success === false) {
    throw new Error(getPayloadMessage(payload, "请求失败"));
  }

  return payload.data as T;
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

function normalizeSummaryText(value: string | null | undefined) {
  return value?.replace(/\s+/g, " ").trim() || "";
}

function hasDistinctSummaryTitle(title: string | null | undefined, content: string | null | undefined) {
  const normalizedTitle = normalizeSummaryText(title);
  const normalizedContent = normalizeSummaryText(content);

  return Boolean(
    normalizedTitle &&
      normalizedContent &&
      normalizedTitle !== normalizedContent &&
      !normalizedContent.startsWith(normalizedTitle)
  );
}

function getActionOperatorLabel(action: CustomerServiceTicketAction) {
  if (action.operator_employee?.name) {
    return action.operator_employee.phone_masked
      ? `${action.operator_employee.name} · ${action.operator_employee.phone_masked}`
      : action.operator_employee.name;
  }

  if (action.operator_employee_id) {
    return `员工 ${action.operator_employee_id.slice(0, 8)}`;
  }

  return "客户提交";
}

export function CustomerServiceDetailDialog({
  ticketId,
  open,
  onOpenChange,
  onChanged,
}: {
  ticketId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const [ticket, setTicket] = useState<CustomerServiceTicket | null>(null);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("__none");
  const [actionContent, setActionContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [pending, startTransition] = useTransition();

  const employeeOptions = useMemo(() => [
    { value: "__none", label: "不分配" },
    ...employees.map((item) => ({
      value: item.id,
      label: item.name || item.phone || item.id,
    })),
  ], [employees]);

  async function loadDetail(currentTicketId: string) {
    setLoading(true);
    setError(null);
    try {
      const [detail, employeeData] = await Promise.all([
        requestBackend<CustomerServiceTicket>(
          `/customer-service-tickets/${currentTicketId}`,
        ),
        requestBackend<{ list: EmployeeOption[] }>(
          "/employees?page=1&pageSize=100&status=active",
        ),
      ]);
      setTicket(detail);
      setSelectedEmployeeId(detail.assigned_employee_id || "__none");
      setEmployees(employeeData?.list || []);
      setActionContent("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "客服问题详情加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open && ticketId) {
      void loadDetail(ticketId);
    }
    if (!open) {
      setTicket(null);
      setError(null);
      setActionContent("");
    }
  }, [open, ticketId]);

  function assignEmployee() {
    if (!ticket) return;
    startTransition(async () => {
      try {
        const updated = await requestBackend<CustomerServiceTicket>(
          `/customer-service-tickets/${ticket.id}/assign`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              assigned_employee_id: selectedEmployeeId === "__none"
                ? null
                : selectedEmployeeId,
            }),
          },
        );
        setTicket(updated);
        setSelectedEmployeeId(updated.assigned_employee_id || "__none");
        toast.success("负责人已更新");
        onChanged();
      } catch (assignError) {
        toast.error(assignError instanceof Error ? assignError.message : "分配失败");
      }
    });
  }

  function executeAction(action: string, requiresContent: boolean) {
    if (!ticket) return;
    const content = actionContent.trim();
    if (requiresContent && !content) {
      toast.error("处理结果不能为空");
      return;
    }

    startTransition(async () => {
      try {
        const updated = await requestBackend<CustomerServiceTicket>(
          `/customer-service-tickets/${ticket.id}/action`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              action,
              content: content || null,
            }),
          },
        );
        setTicket(updated);
        setActionContent("");
        toast.success("状态已更新");
        onChanged();
      } catch (actionError) {
        toast.error(actionError instanceof Error ? actionError.message : "操作失败");
      }
    });
  }

  const visibleActions = (ticket?.available_actions || [])
    .filter((item) => item.action !== "assign");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] max-w-[900px] flex-col overflow-hidden p-0">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle>客服问题详情</DialogTitle>
          <DialogDescription>
            {ticket?.ticket_no || "查看客户问题、图片和处理记录"}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-36 w-full" />
            </div>
          ) : null}

          {error ? <StatusAlert>{error}</StatusAlert> : null}

          {!loading && ticket ? (
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={statusVariant[ticket.status] || "outline"}>
                      {ticket.status_label}
                    </Badge>
                    <Badge variant="outline">{ticket.category_label}</Badge>
                    <Badge variant="secondary">{ticket.priority_label}</Badge>
                  </div>
                  {hasDistinctSummaryTitle(ticket.title, ticket.content) ? (
                    <>
                      <h2 className="mt-3 text-base font-semibold tracking-normal">
                        {ticket.title}
                      </h2>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                        {ticket.content}
                      </p>
                    </>
                  ) : (
                    <p className="mt-3 whitespace-pre-wrap text-base font-semibold tracking-normal">
                      {ticket.content || ticket.title}
                    </p>
                  )}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => {
                    if (ticketId) void loadDetail(ticketId);
                  }}
                >
                  <RefreshCw data-icon="inline-start" />
                  刷新
                </Button>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">客户</div>
                  <div className="mt-1 font-medium">{ticket.customer?.name || "未命名客户"}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {ticket.customer?.phone_masked || "-"}
                  </div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">项目</div>
                  <div className="mt-1 font-medium">{ticket.project?.name || "未关联项目"}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {ticket.project?.status || "-"}
                  </div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">时间</div>
                  <div className="mt-1 text-sm">{formatDateTime(ticket.created_at)}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    更新 {formatDateTime(ticket.updated_at)}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <div className="text-sm font-medium">问题图片</div>
                <ImageAttachmentList
                  images={(ticket.image_items || []).map((image, index) => ({
                    id: `${ticket.id}-${index}`,
                    src: image.url,
                    alt: `客服问题图片 ${index + 1}`,
                    label: `图片 ${index + 1}`,
                  }))}
                  emptyText="客户没有上传图片"
                />
              </div>

              <Separator />

              <FieldGroup>
                <Field>
                  <FieldLabel>负责人</FieldLabel>
                  <div className="flex flex-col gap-2 md:flex-row">
                    <div className="md:w-[260px]">
                      <FormSelect
                        id="customer-service-assignee"
                        value={selectedEmployeeId}
                        disabled={pending}
                        options={employeeOptions}
                        onChange={setSelectedEmployeeId}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={pending || selectedEmployeeId === (ticket.assigned_employee_id || "__none")}
                      onClick={assignEmployee}
                    >
                      {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <UserRound data-icon="inline-start" />}
                      保存负责人
                    </Button>
                  </div>
                </Field>

                {visibleActions.length > 0 ? (
                  <Field>
                    <FieldLabel>处理说明</FieldLabel>
                    <Textarea
                      value={actionContent}
                      disabled={pending}
                      rows={3}
                      placeholder="解决问题时必须填写处理结果"
                      onChange={(event) => setActionContent(event.target.value)}
                    />
                    <div className="flex flex-wrap gap-2">
                      {visibleActions.map((action) => (
                        <Button
                          key={action.action}
                          type="button"
                          size="sm"
                          disabled={pending}
                          onClick={() => executeAction(action.action, action.requires_content)}
                        >
                          {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Send data-icon="inline-start" />}
                          {action.label}
                        </Button>
                      ))}
                    </div>
                  </Field>
                ) : null}
              </FieldGroup>

              <Separator />

              <div className="flex flex-col gap-3">
                <div className="text-sm font-medium">处理记录</div>
                {(ticket.actions || []).length > 0 ? (
                  <div className="flex flex-col gap-2">
                    {(ticket.actions || []).map((action) => (
                      <div key={action.id} className="rounded-md border p-3">
                        <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline">{action.action_label}</Badge>
                            {action.from_status_label || action.to_status_label ? (
                              <span className="text-sm text-muted-foreground">
                                {action.from_status_label || "-"} {"->"} {action.to_status_label || "-"}
                              </span>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span>{getActionOperatorLabel(action)}</span>
                            <span>{formatDateTime(action.created_at)}</span>
                          </div>
                        </div>
                        {action.content ? (
                          <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                            {action.content}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                    暂无处理记录
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
