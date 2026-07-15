"use client";

import { useState } from "react";
import { Check, FilePenLine, Loader2, RefreshCw, SearchCheck, X } from "lucide-react";

import { FormSelect } from "@/components/admin/form-select";
import type { TenantOnboardingApplicationDetail } from "@/components/tenant-onboarding/tenant-onboarding-types";
import { StatusAlert } from "@/components/admin/status-alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type ActionKind = "start" | "assist" | "supplement" | "approve" | "reject";
type MutationPaths = Record<ActionKind, string>;
type RequestMutation = (path: string, body: Record<string, unknown>) => Promise<unknown>;

const supplementFields = [
  ["company_name", "公司名称"],
  ["unified_social_credit_code", "统一社会信用代码"],
  ["business_license_file_id", "营业执照"],
  ["admin_name", "管理员姓名"],
  ["company_location", "公司地址与定位"],
  ["service_region_codes", "服务区域"],
] as const;

const attributionOptions = [
  { value: "auto", label: "按当前区域自动归因" },
  { value: "partner", label: "指定城市合伙人" },
  { value: "unassigned", label: "暂不归因" },
] as const;

export function TenantOnboardingDecisionControls({
  application,
  paths,
  requestMutation,
  onConflictRefresh,
  onCompleted,
}: {
  application: TenantOnboardingApplicationDetail;
  paths: MutationPaths;
  requestMutation: RequestMutation;
  onConflictRefresh: () => Promise<void>;
  onCompleted: () => void;
}) {
  const [kind, setKind] = useState<ActionKind | null>(null);

  if (application.status === "submitted") {
    return (
      <>
        <Button type="button" onClick={() => setKind("start")}>
          <SearchCheck data-icon="inline-start" />
          开始审核
        </Button>
        <DecisionDialog
          application={application}
          kind={kind}
          paths={paths}
          requestMutation={requestMutation}
          onConflictRefresh={onConflictRefresh}
          onOpenChange={(open) => setKind(open ? "start" : null)}
          onCompleted={onCompleted}
        />
      </>
    );
  }

  if (application.status !== "reviewing") return null;
  const canRequestAssist = !application.candidate_partner_id
    && application.partner_assist_status !== "pending";

  return (
    <>
      <div className="flex flex-wrap justify-end gap-2">
        {canRequestAssist ? (
          <Button type="button" variant="outline" onClick={() => setKind("assist")}>
            <SearchCheck data-icon="inline-start" />
            请求合伙人协查
          </Button>
        ) : null}
        <Button type="button" variant="outline" onClick={() => setKind("supplement")}>
          <FilePenLine data-icon="inline-start" />
          要求补充资料
        </Button>
        <Button type="button" variant="destructive" onClick={() => setKind("reject")}>
          <X data-icon="inline-start" />
          拒绝入驻
        </Button>
        <Button type="button" onClick={() => setKind("approve")}>
          <Check data-icon="inline-start" />
          通过入驻
        </Button>
      </div>
      <DecisionDialog
        application={application}
        kind={kind}
        paths={paths}
        requestMutation={requestMutation}
        onConflictRefresh={onConflictRefresh}
        onOpenChange={(open) => {
          if (!open) setKind(null);
        }}
        onCompleted={onCompleted}
      />
    </>
  );
}

function DecisionDialog({
  application,
  kind,
  paths,
  requestMutation,
  onConflictRefresh,
  onOpenChange,
  onCompleted,
}: {
  application: TenantOnboardingApplicationDetail;
  kind: ActionKind | null;
  paths: MutationPaths;
  requestMutation: RequestMutation;
  onConflictRefresh: () => Promise<void>;
  onOpenChange: (open: boolean) => void;
  onCompleted: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [refreshPending, setRefreshPending] = useState(false);
  const [error, setError] = useState<RequestError | null>(null);
  const [remark, setRemark] = useState("");
  const [partnerId, setPartnerId] = useState("");
  const [attributionMode, setAttributionMode] = useState("auto");
  const [requiredFields, setRequiredFields] = useState<string[]>([]);
  const config = kind ? actionConfig[kind] : null;

  function close(open: boolean) {
    if (!open && (pending || refreshPending)) return;
    if (!open) {
      setError(null);
      setRemark("");
      setPartnerId("");
      setAttributionMode("auto");
      setRequiredFields([]);
    }
    onOpenChange(open);
  }

  async function submit() {
    if (!kind) return;
    setPending(true);
    setError(null);
    try {
      await requestMutation(paths[kind], buildBody({
        application,
        kind,
        remark: remark.trim(),
        partnerId: partnerId.trim(),
        attributionMode,
        requiredFields,
      }));
      onCompleted();
    } catch (caught) {
      setError(toRequestError(caught));
    } finally {
      setPending(false);
    }
  }

  async function refreshConflict() {
    setRefreshPending(true);
    try {
      await onConflictRefresh();
      setError(null);
    } catch (caught) {
      setError(toRequestError(caught));
    } finally {
      setRefreshPending(false);
    }
  }

  const invalid = kind ? !isValid({ kind, remark, partnerId, attributionMode, requiredFields }) : true;
  return (
    <Dialog open={kind !== null} onOpenChange={close}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{config?.title || "审核操作"}</DialogTitle>
          <DialogDescription>{config?.description}</DialogDescription>
        </DialogHeader>
        {kind && kind !== "start" ? (
          <FieldGroup>
            {kind === "assist" ? (
              <Field data-invalid={!partnerId.trim()}>
                <FieldLabel htmlFor="assist-partner-id">城市合伙人 ID</FieldLabel>
                <Input
                  id="assist-partner-id"
                  value={partnerId}
                  placeholder="输入覆盖申请服务区域的合伙人 ID"
                  disabled={pending}
                  aria-invalid={!partnerId.trim()}
                  onChange={(event) => setPartnerId(event.target.value)}
                />
                <FieldDescription>后端会在提交时重新校验合伙人状态和区域覆盖。</FieldDescription>
              </Field>
            ) : null}
            {kind === "supplement" ? (
              <fieldset className="flex flex-col gap-2">
                <legend className="text-sm font-medium">需要补充的资料</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {supplementFields.map(([value, label]) => (
                    <label key={value} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                      <Checkbox
                        checked={requiredFields.includes(value)}
                        disabled={pending}
                        onCheckedChange={(checked) => setRequiredFields((current) => checked
                          ? [...current, value]
                          : current.filter((field) => field !== value))}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : null}
            {kind === "approve" ? (
              <Field>
                <FieldLabel htmlFor="approval-attribution-mode">城市合伙人归因</FieldLabel>
                <FormSelect
                  id="approval-attribution-mode"
                  value={attributionMode}
                  options={attributionOptions}
                  disabled={pending}
                  onChange={setAttributionMode}
                />
              </Field>
            ) : null}
            {kind === "approve" && attributionMode === "partner" ? (
              <Field data-invalid={!partnerId.trim()}>
                <FieldLabel htmlFor="approval-partner-id">最终归因合伙人 ID</FieldLabel>
                <Input
                  id="approval-partner-id"
                  value={partnerId}
                  disabled={pending}
                  aria-invalid={!partnerId.trim()}
                  onChange={(event) => setPartnerId(event.target.value)}
                />
                <FieldDescription>只能指定当前仍有效并覆盖申请服务区域的合伙人。</FieldDescription>
              </Field>
            ) : null}
            <Field data-invalid={kind !== "assist" && !remark.trim()}>
              <FieldLabel htmlFor="tenant-onboarding-review-remark">
                {kind === "assist" ? "协查说明（选填）" : "审核意见"}
              </FieldLabel>
              <Textarea
                id="tenant-onboarding-review-remark"
                value={remark}
                maxLength={500}
                rows={4}
                placeholder={config?.placeholder}
                disabled={pending}
                aria-invalid={kind !== "assist" && !remark.trim()}
                onChange={(event) => setRemark(event.target.value)}
              />
            </Field>
          </FieldGroup>
        ) : null}
        {error ? <StatusAlert>{error.code ? `${error.message}（${error.code}）` : error.message}</StatusAlert> : null}
        <DialogFooter>
          {error && isConflict(error) ? (
            <Button type="button" variant="outline" disabled={refreshPending} onClick={refreshConflict}>
              <RefreshCw className={refreshPending ? "animate-spin" : undefined} data-icon="inline-start" />
              刷新后重试
            </Button>
          ) : null}
          <Button type="button" variant="outline" disabled={pending || refreshPending} onClick={() => close(false)}>
            取消
          </Button>
          <Button
            type="button"
            variant={kind === "reject" ? "destructive" : "default"}
            disabled={pending || refreshPending || invalid}
            onClick={submit}
          >
            {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
            {config?.submitLabel || "提交"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const actionConfig: Record<ActionKind, {
  title: string;
  description: string;
  placeholder?: string;
  submitLabel: string;
}> = {
  start: { title: "开始审核", description: "锁定当前版本并进入平台审核阶段。", submitLabel: "开始审核" },
  assist: { title: "请求城市合伙人协查", description: "协查意见不直接决定平台审批结果。", placeholder: "说明需要重点核验的事项", submitLabel: "发起协查" },
  supplement: { title: "要求补充资料", description: "申请人补充资料后可重新提交。", placeholder: "说明缺失或需要修正的内容", submitLabel: "发送补充要求" },
  approve: { title: "通过入驻", description: "通过后将原子创建装修公司租户和管理员。", placeholder: "填写审批结论和归因依据", submitLabel: "确认通过" },
  reject: { title: "拒绝入驻", description: "拒绝后申请进入终态，请确认原因准确。", placeholder: "填写明确的拒绝原因", submitLabel: "确认拒绝" },
};

function isValid(input: {
  kind: ActionKind;
  remark: string;
  partnerId: string;
  attributionMode: string;
  requiredFields: string[];
}) {
  if (input.kind === "start") return true;
  if (input.kind === "assist") return Boolean(input.partnerId.trim());
  if (input.kind === "supplement" && input.requiredFields.length === 0) return false;
  if (input.kind === "approve" && input.attributionMode === "partner" && !input.partnerId.trim()) return false;
  return Boolean(input.remark.trim());
}

function buildBody(input: {
  application: TenantOnboardingApplicationDetail;
  kind: ActionKind;
  remark: string;
  partnerId: string;
  attributionMode: string;
  requiredFields: string[];
}): Record<string, unknown> {
  const version = input.application.version;
  if (input.kind === "start") return { version };
  if (input.kind === "assist") {
    return { version, partner_id: input.partnerId, remark: input.remark || undefined };
  }
  if (input.kind === "supplement") {
    return { version, required_fields: input.requiredFields, remark: input.remark };
  }
  if (input.kind === "approve") {
    return {
      version,
      attribution_mode: input.attributionMode,
      final_partner_id: input.attributionMode === "partner" ? input.partnerId : undefined,
      review_remark: input.remark,
    };
  }
  return { version, review_remark: input.remark };
}

type RequestError = Error & { code?: string; status?: number };

function toRequestError(error: unknown): RequestError {
  return error instanceof Error
    ? error as RequestError
    : new Error("操作失败，请稍后重试") as RequestError;
}

function isConflict(error: RequestError) {
  return error.status === 409 || error.code === "TENANT_ONBOARDING_STATE_CONFLICT";
}
