"use client";

import { type FormEvent, useEffect, useState, useTransition } from "react";
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
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
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

import type {
  PageData as PlatformOperatorPageData,
  PlatformOperator,
} from "../platform-operators/platform-operator-types";
import {
  fulfillmentRecordTypeOptions,
  getWorkOrderNextStatusOptions,
  getServiceStatusMeta,
} from "./platform-service-order-rules";
import {
  PlatformServiceFulfillmentAttachmentUploadField,
  type UploadedFulfillmentAttachment,
} from "./platform-service-fulfillment-attachment-upload-field";
import { PlatformServiceAcceptancePreparationAction } from "./platform-service-acceptance-preparation-action";
import { PlatformServiceOverdueAcceptanceAction } from "./platform-service-overdue-acceptance-action";
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
      <PlatformServiceAcceptancePreparationAction workOrder={workOrder} />
      <PlatformServiceOverdueAcceptanceAction workOrder={workOrder} />
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
  const [assigneeEmployeeId, setAssigneeEmployeeId] = useState(
    workOrder.assignee_employee_id || "",
  );
  const [operators, setOperators] = useState<PlatformOperator[]>([]);
  const [operatorsLoaded, setOperatorsLoaded] = useState(false);
  const [loadingOperators, setLoadingOperators] = useState(false);
  const [operatorLoadError, setOperatorLoadError] = useState("");
  const [error, setError] = useState("");
  const assignAction = workOrder.available_actions?.assign;
  const canAssign = assignAction?.enabled ?? true;
  const disabledReason = assignAction?.disabled_reason ?? undefined;
  const hasAssignableOperators = operators.length > 0;
  const operatorHint = loadingOperators
    ? "正在加载可分配的平台人员。"
    : operatorsLoaded
      ? hasAssignableOperators
        ? "仅显示可用的平台人员。"
        : "暂无可分配的平台人员，请先在平台人员中新增或启用人员。"
      : "打开弹窗后自动加载可分配的平台人员。";

  useEffect(() => {
    if (!open || operatorsLoaded || loadingOperators || operatorLoadError) return;

    let cancelled = false;
    setLoadingOperators(true);
    setOperatorLoadError("");
    requestBackendJson<PlatformOperatorPageData<PlatformOperator>>(
      "/platform/operators?page=1&pageSize=100&status=active",
      { fallbackMessage: "负责人列表加载失败" },
    )
      .then((data) => {
        if (cancelled) return;
        setOperators(data.list);
        setOperatorsLoaded(true);
      })
      .catch((caught) => {
        if (cancelled) return;
        setOperatorLoadError(
          caught instanceof Error ? caught.message : "负责人列表加载失败",
        );
      })
      .finally(() => {
        if (!cancelled) setLoadingOperators(false);
      });

    return () => {
      cancelled = true;
    };
  }, [loadingOperators, open, operatorLoadError, operatorsLoaded]);

  function handleOpenChange(nextOpen: boolean) {
    if (!canAssign) return;
    setOpen(nextOpen);
    if (nextOpen) {
      setAssigneeEmployeeId(workOrder.assignee_employee_id || "");
      setError("");
      setOperatorLoadError("");
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const formData = new FormData(event.currentTarget);
    const remark = String(formData.get("remark") || "").trim();
    const selectedAssigneeEmployeeId = assigneeEmployeeId.trim();
    if (!selectedAssigneeEmployeeId) {
      setError("请选择负责人");
      return;
    }

    startTransition(async () => {
      try {
        await requestBackendJson(
          `/api/backend/platform/billing/service-work-orders/${workOrder.id}/assign`,
          {
            method: "POST",
            body: JSON.stringify({
              assignee_employee_id: selectedAssigneeEmployeeId,
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
    <Dialog open={canAssign ? open : false} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!canAssign}
          title={disabledReason}
        >
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
              <FieldLabel htmlFor={`assignee-${workOrder.id}`}>负责人</FieldLabel>
              <Select
                value={assigneeEmployeeId}
                onValueChange={setAssigneeEmployeeId}
                disabled={pending || loadingOperators || Boolean(operatorLoadError)}
              >
                <SelectTrigger id={`assignee-${workOrder.id}`}>
                  <SelectValue
                    placeholder={loadingOperators ? "加载负责人列表..." : "请选择负责人"}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {operators.map((operator) => (
                      <SelectItem key={operator.id} value={operator.id}>
                        {formatPlatformOperatorOption(operator)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription>{operatorHint}</FieldDescription>
              <FieldError>{operatorLoadError}</FieldError>
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
            <Button
              type="submit"
              disabled={pending || loadingOperators || Boolean(operatorLoadError) || !hasAssignableOperators}
            >
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              保存分配
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function formatPlatformOperatorOption(operator: PlatformOperator): string {
  const name = operator.name?.trim() || "未命名平台人员";
  const phone = operator.phone_masked || operator.phone || "";
  return phone ? `${name}（${phone}）` : name;
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
  const transitionAction = workOrder.available_actions?.transition;
  const nextStatusOptions = getWorkOrderNextStatusOptions(workOrder.status);
  const canTransition = (transitionAction?.enabled ?? true) &&
    nextStatusOptions.length > 0;
  const disabledReason = transitionAction?.disabled_reason ??
    (nextStatusOptions.length === 0 ? "当前状态没有可推进的下一步" : undefined);

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
    <Dialog open={canTransition ? open : false} onOpenChange={(nextOpen) => {
      if (canTransition) setOpen(nextOpen);
    }}>
      <DialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!canTransition}
          title={disabledReason}
        >
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
                    {nextStatusOptions.map((option) => (
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
  const [uploading, setUploading] = useState(false);
  const [uploadedAttachments, setUploadedAttachments] = useState<
    UploadedFulfillmentAttachment[]
  >([]);
  const [error, setError] = useState("");

  function resetRecordFormState() {
    setError("");
    setUploadedAttachments([]);
  }

  function handleDialogOpenChange(nextOpen: boolean) {
    if (!nextOpen && (pending || uploading)) return;
    setOpen(nextOpen);
    if (!nextOpen) resetRecordFormState();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const formData = new FormData(event.currentTarget);
    const title = String(formData.get("title") || "").trim();
    const content = String(formData.get("content") || "").trim();
    const fileIds = uploadedAttachments.map((attachment) => attachment.fileId);

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
        setUploadedAttachments([]);
        refreshAfterDialogClose(router);
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : "记录履约失败");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
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
            <PlatformServiceFulfillmentAttachmentUploadField
              inputId={`record-files-${workOrder.id}`}
              disabled={pending}
              attachments={uploadedAttachments}
              onAttachmentsChange={setUploadedAttachments}
              onUploadingChange={setUploading}
            />
          </FieldGroup>
          <FieldError>{error}</FieldError>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleDialogOpenChange(false)}
              disabled={pending || uploading}
            >
              取消
            </Button>
            <Button type="submit" disabled={pending || uploading}>
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              保存记录
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
