"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { StatusAlert } from "@/components/admin/status-alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CustomerServiceTicketActionPanel,
  CustomerServiceTicketActions,
  CustomerServiceTicketImages,
  CustomerServiceTicketInfo,
  CustomerServiceTicketSummary,
} from "@/components/customer-service/customer-service-detail-sections";
import type {
  CustomerServiceTicket,
  EmployeeOption,
} from "@/components/customer-service/customer-service-types";
import { requestBackendJson } from "@/lib/backend-client";

async function requestBackend<T>(path: string, init?: RequestInit) {
  return requestBackendJson<T>(path, init);
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
              <CustomerServiceTicketSummary
                ticket={ticket}
                pending={pending}
                onRefresh={() => {
                  if (ticketId) void loadDetail(ticketId);
                }}
              />
              <CustomerServiceTicketInfo ticket={ticket} />
              <CustomerServiceTicketImages ticket={ticket} />
              <CustomerServiceTicketActionPanel
                pending={pending}
                selectedEmployeeId={selectedEmployeeId}
                employeeOptions={employeeOptions}
                assignedEmployeeId={ticket.assigned_employee_id}
                actionContent={actionContent}
                visibleActions={visibleActions}
                onSelectedEmployeeChange={setSelectedEmployeeId}
                onActionContentChange={setActionContent}
                onAssignEmployee={assignEmployee}
                onExecuteAction={executeAction}
              />
              <CustomerServiceTicketActions ticket={ticket} />
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
