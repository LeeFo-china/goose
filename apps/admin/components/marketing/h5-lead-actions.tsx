"use client";

import { useState, useTransition } from "react";
import { Loader2, MessageSquareText, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { FormSelect } from "@/components/admin/form-select";
import { h5MarketingLeadStatusOptions } from "@/components/marketing/marketing-constants";
import type { H5MarketingLeadRecord, H5MarketingLeadStatus } from "@/components/marketing/marketing-types";
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
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { requestBackendJson } from "@/lib/backend-client";

export type LeadUpdatedHandler = (lead: H5MarketingLeadRecord) => void;

async function requestLeadUpdate(input: {
  id: string;
  lead_status: H5MarketingLeadStatus;
  follow_remark: string | null;
}) {
  return requestBackendJson<H5MarketingLeadRecord>(`/marketing-leads/${input.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      lead_status: input.lead_status,
      follow_remark: input.follow_remark,
    }),
    fallbackMessage: "更新线索失败",
  });
}

async function requestLeadConvert(input: {
  id: string;
  follow_remark: string | null;
}) {
  return requestBackendJson<{
    lead?: H5MarketingLeadRecord;
    created?: boolean;
  }>(`/marketing-leads/${input.id}/convert-customer`, {
    method: "POST",
    body: JSON.stringify({
      follow_remark: input.follow_remark,
    }),
    fallbackMessage: "转客户失败",
  });
}

export function LeadFollowAction({
  lead,
  onLeadUpdated,
}: {
  lead: H5MarketingLeadRecord;
  onLeadUpdated?: (lead: H5MarketingLeadRecord) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<H5MarketingLeadStatus>(lead.lead_status || "new");
  const [remark, setRemark] = useState(lead.follow_remark || "");

  function submit() {
    startTransition(async () => {
      try {
        const updatedLead = await requestLeadUpdate({
          id: lead.id,
          lead_status: status,
          follow_remark: remark.trim() || null,
        });
        toast.success("线索跟进状态已更新");
        setOpen(false);
        onLeadUpdated?.(updatedLead);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "更新线索失败");
      }
    });
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <MessageSquareText data-icon="inline-start" />
        跟进
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>线索跟进</DialogTitle>
            <DialogDescription>
              标记当前 H5 营销线索的处理状态，备注会保留在列表中方便销售继续跟进。
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel>线索状态</FieldLabel>
              <FormSelect
                id={`lead-status-${lead.id}`}
                value={status}
                options={h5MarketingLeadStatusOptions.map(([value, label]) => ({ value, label }))}
                onChange={(value) => setStatus(value as H5MarketingLeadStatus)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`lead-remark-${lead.id}`}>跟进备注</FieldLabel>
              <Textarea
                id={`lead-remark-${lead.id}`}
                value={remark}
                rows={4}
                onChange={(event) => setRemark(event.target.value)}
                placeholder="例如：已电话联系，客户希望周末到店了解活动权益"
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button type="button" disabled={pending} onClick={submit}>
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function LeadConvertAction({
  lead,
  onLeadUpdated,
}: {
  lead: H5MarketingLeadRecord;
  onLeadUpdated?: (lead: H5MarketingLeadRecord) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [remark, setRemark] = useState(lead.follow_remark || "");

  function submit() {
    startTransition(async () => {
      try {
        const data = await requestLeadConvert({
          id: lead.id,
          follow_remark: remark.trim() || lead.follow_remark || null,
        });
        toast.success(data.created ? "已创建客户并绑定线索" : "已绑定已有客户");
        setOpen(false);
        if (data.lead) {
          onLeadUpdated?.(data.lead);
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "转客户失败");
      }
    });
  }

  const disabled = lead.lead_status === "converted";

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <UserPlus data-icon="inline-start" />
        转客户
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>转为客户</DialogTitle>
            <DialogDescription>
              系统会先按手机号匹配已有客户；如果没有匹配到，会创建新客户并把该线索标记为已转化。
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel>手机号</FieldLabel>
              <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                {lead.phone || "未填写手机号"}
              </div>
            </Field>
            <Field>
              <FieldLabel htmlFor={`lead-convert-remark-${lead.id}`}>转化备注</FieldLabel>
              <Textarea
                id={`lead-convert-remark-${lead.id}`}
                value={remark}
                rows={4}
                onChange={(event) => setRemark(event.target.value)}
                placeholder="例如：确认有效线索，已转入客户池继续跟进"
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button type="button" disabled={pending || !lead.phone} onClick={submit}>
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <UserPlus data-icon="inline-start" />}
              确认转客户
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function LeadInvalidateAction({
  lead,
  onLeadUpdated,
}: {
  lead: H5MarketingLeadRecord;
  onLeadUpdated?: (lead: H5MarketingLeadRecord) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const disabled = lead.lead_status === "invalid" || lead.lead_status === "converted";

  function submit() {
    startTransition(async () => {
      try {
        const updatedLead = await requestLeadUpdate({
          id: lead.id,
          lead_status: "invalid",
          follow_remark: lead.follow_remark || "线索已作废",
        });
        toast.success("线索已作废");
        setOpen(false);
        onLeadUpdated?.(updatedLead);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "作废线索失败");
      }
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <Trash2 data-icon="inline-start" />
        作废
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>作废线索</DialogTitle>
            <DialogDescription>
              确认作废该线索？作废后不会计入有效线索统计，但仍可通过状态筛选查看。
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <div className="font-medium">{lead.name || "未填写姓名"}</div>
            <div className="mt-1 text-muted-foreground">{lead.phone || "未填写手机号"}</div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button type="button" variant="destructive" disabled={pending} onClick={submit}>
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Trash2 data-icon="inline-start" />}
              确认作废
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
