"use client";

import { type FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, Loader2, Send, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { requestBackendJson } from "@/lib/backend-client";
import { refreshAfterDialogClose } from "@/lib/deferred-refresh";

import {
  fulfillmentRecordTypeOptions,
  getServiceStatusMeta,
  workOrderTransitionOptions,
} from "./platform-service-order-rules";
import type { PlatformServiceWorkOrderListItem } from "./platform-service-order-types";

export function PlatformServiceWorkOrderActions({
  workOrder,
  canManage,
}: {
  workOrder: PlatformServiceWorkOrderListItem;
  canManage: boolean;
}) {
  if (!canManage) return null;

  return (
    <div className="flex justify-end gap-2">
      <AssignWorkOrderButton workOrder={workOrder} />
      <RecordFulfillmentButton workOrder={workOrder} />
      <TransitionWorkOrderButton workOrder={workOrder} />
    </div>
  );
}

function AssignWorkOrderButton({
  workOrder,
}: {
  workOrder: PlatformServiceWorkOrderListItem;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const formData = new FormData(event.currentTarget);
    const assigneeEmployeeId = String(formData.get("assignee_employee_id") || "").trim();
    const remark = String(formData.get("remark") || "").trim();

    startTransition(async () => {
      try {
        await requestBackendJson(
          `/api/backend/platform/billing/service-work-orders/${workOrder.id}/assign`,
          {
            method: "POST",
            body: JSON.stringify({
              assignee_employee_id: assigneeEmployeeId,
              expected_version: workOrder.version ?? 1,
              remark: remark || undefined,
            }),
            fallbackMessage: "分配工单失败",
          },
        );
        setOpen(false);
        refreshAfterDialogClose(router);
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : "分配工单失败");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          <UserPlus data-icon="inline-start" />
          分配
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>分配实施工单</DialogTitle>
          <DialogDescription>{workOrder.order_no}</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`assignee-${workOrder.id}`}>负责人员工 ID</FieldLabel>
              <Input
                id={`assignee-${workOrder.id}`}
                name="assignee_employee_id"
                defaultValue={workOrder.assignee_employee_id || ""}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`assign-remark-${workOrder.id}`}>备注</FieldLabel>
              <Textarea id={`assign-remark-${workOrder.id}`} name="remark" maxLength={1000} />
            </Field>
          </FieldGroup>
          <FieldError>{error}</FieldError>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              取消
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              保存分配
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TransitionWorkOrderButton({
  workOrder,
}: {
  workOrder: PlatformServiceWorkOrderListItem;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [toStatus, setToStatus] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const formData = new FormData(event.currentTarget);
    const remark = String(formData.get("remark") || "").trim();
    const nextStatus = toStatus.trim();
    if (!nextStatus) {
      setError("请选择目标状态");
      return;
    }

    startTransition(async () => {
      try {
        await requestBackendJson(
          `/api/backend/platform/billing/service-work-orders/${workOrder.id}/status-transitions`,
          {
            method: "POST",
            body: JSON.stringify({
              to_status: nextStatus,
              expected_version: workOrder.version ?? 1,
              remark: remark || undefined,
            }),
            fallbackMessage: "推进工单状态失败",
          },
        );
        setOpen(false);
        refreshAfterDialogClose(router);
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : "推进工单状态失败");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          <Send data-icon="inline-start" />
          推进状态
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>推进状态</DialogTitle>
          <DialogDescription>
            当前状态：{getServiceStatusMeta(workOrder.status).label}
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`to-status-${workOrder.id}`}>目标状态</FieldLabel>
              <Select value={toStatus} onValueChange={setToStatus}>
                <SelectTrigger id={`to-status-${workOrder.id}`}>
                  <SelectValue placeholder="选择下一状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {workOrderTransitionOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor={`transition-remark-${workOrder.id}`}>备注</FieldLabel>
              <Textarea id={`transition-remark-${workOrder.id}`} name="remark" maxLength={1000} />
            </Field>
          </FieldGroup>
          <FieldError>{error}</FieldError>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              取消
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              确认推进
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RecordFulfillmentButton({
  workOrder,
}: {
  workOrder: PlatformServiceWorkOrderListItem;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [recordType, setRecordType] = useState("environment_setup");
  const [error, setError] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const formData = new FormData(event.currentTarget);
    const title = String(formData.get("title") || "").trim();
    const content = String(formData.get("content") || "").trim();
    const fileIds = String(formData.get("file_ids") || "")
      .split(/[\n,，\s]+/)
      .map((item) => item.trim())
      .filter(Boolean);

    startTransition(async () => {
      try {
        await requestBackendJson(
          `/api/backend/platform/billing/service-work-orders/${workOrder.id}/fulfillment-records`,
          {
            method: "POST",
            body: JSON.stringify({
              record_type: recordType,
              title,
              content,
              occurred_at: new Date().toISOString(),
              file_ids: fileIds,
            }),
            fallbackMessage: "记录履约失败",
          },
        );
        setOpen(false);
        refreshAfterDialogClose(router);
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : "记录履约失败");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          <ClipboardCheck data-icon="inline-start" />
          记录履约
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>记录履约</DialogTitle>
          <DialogDescription>记录部署、服务器配置、培训或年度运维事实。</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`record-type-${workOrder.id}`}>履约类型</FieldLabel>
              <Select value={recordType} onValueChange={setRecordType}>
                <SelectTrigger id={`record-type-${workOrder.id}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {fulfillmentRecordTypeOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor={`record-title-${workOrder.id}`}>标题</FieldLabel>
              <Input id={`record-title-${workOrder.id}`} name="title" maxLength={120} required />
            </Field>
            <Field>
              <FieldLabel htmlFor={`record-content-${workOrder.id}`}>履约说明</FieldLabel>
              <Textarea
                id={`record-content-${workOrder.id}`}
                name="content"
                maxLength={5000}
                required
                placeholder="例如：客户专属系统环境已部署，服务器配置及首次操作培训已完成。"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`record-files-${workOrder.id}`}>附件 file_id</FieldLabel>
              <Textarea
                id={`record-files-${workOrder.id}`}
                name="file_ids"
                placeholder="可粘贴多个 file_id，用逗号或换行分隔"
              />
            </Field>
          </FieldGroup>
          <FieldError>{error}</FieldError>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              取消
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              保存记录
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

