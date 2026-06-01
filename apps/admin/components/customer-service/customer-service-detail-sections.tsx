"use client";

import { Loader2, RefreshCw, Send, UserRound } from "lucide-react";
import { FormSelect } from "@/components/admin/form-select";
import { ImageAttachmentList } from "@/components/admin/attachment-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import type {
  CustomerServiceAvailableAction,
  CustomerServiceTicket,
  CustomerServiceTicketAction,
} from "@/components/customer-service/customer-service-types";

const statusVariant: Record<string, "default" | "secondary" | "outline" | "success" | "warning" | "danger"> = {
  open: "warning",
  in_progress: "default",
  resolved: "success",
  closed: "secondary",
  cancelled: "danger",
};

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

export function CustomerServiceTicketSummary({
  ticket,
  pending,
  onRefresh,
}: {
  ticket: CustomerServiceTicket;
  pending: boolean;
  onRefresh: () => void;
}) {
  return (
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
        onClick={onRefresh}
      >
        <RefreshCw data-icon="inline-start" />
        刷新
      </Button>
    </div>
  );
}

export function CustomerServiceTicketInfo({ ticket }: { ticket: CustomerServiceTicket }) {
  return (
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
  );
}

export function CustomerServiceTicketImages({ ticket }: { ticket: CustomerServiceTicket }) {
  return (
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
  );
}

export function CustomerServiceTicketActionPanel({
  pending,
  selectedEmployeeId,
  employeeOptions,
  assignedEmployeeId,
  actionContent,
  visibleActions,
  onSelectedEmployeeChange,
  onActionContentChange,
  onAssignEmployee,
  onExecuteAction,
}: {
  pending: boolean;
  selectedEmployeeId: string;
  employeeOptions: Array<{ value: string; label: string }>;
  assignedEmployeeId: string | null | undefined;
  actionContent: string;
  visibleActions: CustomerServiceAvailableAction[];
  onSelectedEmployeeChange: (value: string) => void;
  onActionContentChange: (value: string) => void;
  onAssignEmployee: () => void;
  onExecuteAction: (action: string, requiresContent: boolean) => void;
}) {
  return (
    <>
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
                onChange={onSelectedEmployeeChange}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={pending || selectedEmployeeId === (assignedEmployeeId || "__none")}
              onClick={onAssignEmployee}
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
              onChange={(event) => onActionContentChange(event.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              {visibleActions.map((action) => (
                <Button
                  key={action.action}
                  type="button"
                  size="sm"
                  disabled={pending}
                  onClick={() => onExecuteAction(action.action, action.requires_content)}
                >
                  {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Send data-icon="inline-start" />}
                  {action.label}
                </Button>
              ))}
            </div>
          </Field>
        ) : null}
      </FieldGroup>
    </>
  );
}

export function CustomerServiceTicketActions({ ticket }: { ticket: CustomerServiceTicket }) {
  return (
    <>
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
    </>
  );
}
