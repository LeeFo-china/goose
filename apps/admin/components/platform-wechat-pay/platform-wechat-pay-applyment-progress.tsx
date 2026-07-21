import { Check, CircleAlert } from "lucide-react";
import {
  formatWechatPayApplymentTime,
  type WechatPayApplymentRecord,
} from "@/components/finance/finance-wechat-pay-applyment-shared";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

const OFFICIAL_STAGES = [
  "平台审核",
  "微信审核",
  "账户验证",
  "商户签约",
  "开通完成",
  "激活收款",
] as const;

const STATUS_STAGE_INDEX: Record<string, number> = {
  draft: 0,
  submitted: 0,
  approved: 1,
  applying: 1,
  reviewing: 1,
  wechat_editing: 1,
  rejected: 1,
  account_verifying: 2,
  signing: 3,
  opening: 4,
  opened: 5,
  active: 5,
  bound: 5,
  suspended: 5,
  closed: 1,
};

const ISSUE_STATUSES = new Set([
  "wechat_editing",
  "rejected",
  "suspended",
  "closed",
]);

type StageState = "done" | "current" | "issue" | "pending";

export function getOfficialApplymentProgress(
  status: string,
  wechatRawState?: string | null,
) {
  const platformRejected = status === "rejected" &&
    wechatRawState !== "APPLYMENT_STATE_REJECTED";
  const currentIndex = platformRejected ? 0 : STATUS_STAGE_INDEX[status] ?? 0;
  const complete = status === "active";
  const stages = OFFICIAL_STAGES.map((label, index) => {
    let state: StageState = "pending";
    if (complete || index < currentIndex) state = "done";
    else if (index === currentIndex) {
      state = ISSUE_STATUSES.has(status) ? "issue" : "current";
    }
    return { label, state };
  });
  return {
    stages,
    value: Math.round(
      ((complete
        ? OFFICIAL_STAGES.length
        : Math.min(OFFICIAL_STAGES.length - 1, currentIndex + 1)) /
        OFFICIAL_STAGES.length) * 100,
    ),
  };
}

export function PlatformWechatPayApplymentProgress({
  applyment,
}: {
  applyment: WechatPayApplymentRecord;
}) {
  const progress = getOfficialApplymentProgress(
    applyment.status,
    applyment.wechat_applyment_state_raw,
  );

  return (
    <Card className="shadow-none">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>官方进件进度</CardTitle>
          <Badge variant="outline">
            {formatWechatRawState(applyment.wechat_applyment_state_raw)}
          </Badge>
        </div>
        <CardDescription>
          平台审核、微信进件、签约与收款激活的实时状态。
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <Progress value={progress.value} aria-label="官方进件完成度" />
        <ol className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3 xl:grid-cols-6">
          {progress.stages.map((stage, index) => (
            <li
              key={stage.label}
              className="flex min-w-0 items-center gap-2"
              data-state={stage.state}
              aria-current={
                stage.state === "current" || stage.state === "issue"
                  ? "step"
                  : undefined
              }
              aria-label={`${stage.label}：${formatStageState(stage.state)}`}
            >
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                  stage.state === "done" && "border-foreground bg-foreground text-background",
                  stage.state === "current" && "border-primary bg-primary text-primary-foreground",
                  stage.state === "issue" && "border-destructive bg-destructive text-destructive-foreground",
                  stage.state === "pending" && "text-muted-foreground",
                )}
              >
                {stage.state === "done" ? (
                  <Check aria-hidden="true" className="size-3.5" />
                ) : stage.state === "issue" ? (
                  <CircleAlert aria-hidden="true" className="size-3.5" />
                ) : index + 1}
              </span>
              <span className="min-w-0 text-sm font-medium">{stage.label}</span>
            </li>
          ))}
        </ol>

        <div className="grid grid-cols-2 gap-4 border-t pt-4 xl:grid-cols-3">
          <Evidence label="微信业务编号" value={applyment.applyment_business_code} />
          <Evidence label="微信申请单号" value={applyment.applyment_id} />
          <Evidence label="子商户号" value={applyment.sub_mchid} />
          <Evidence label="最后请求 ID" value={applyment.last_wechat_request_id} mono />
          <Evidence label="最后同步时间" value={formatWechatPayApplymentTime(applyment.last_wechat_synced_at)} />
          <Evidence label="签约链接" value={applyment.sign_url} className="col-span-2 xl:col-span-1" />
        </div>

        {applyment.applyment_state_message ? (
          <div className="border-t pt-4">
            <div className="text-xs text-muted-foreground">微信状态说明</div>
            <p className="mt-1 text-sm">{applyment.applyment_state_message}</p>
          </div>
        ) : null}

        {applyment.audit_detail.length > 0 ? (
          <div className="border-t pt-4">
            <h3 className="text-sm font-semibold">微信审核明细</h3>
            <div className="mt-3 flex flex-col gap-3">
              {applyment.audit_detail.map((detail, index) => (
                <div
                  key={`${detail.field || "field"}:${index}`}
                  className="border-l-2 border-destructive pl-3"
                >
                  <div className="text-sm font-medium">
                    {detail.field_name || detail.field || "申请资料"}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {detail.reject_reason || "微信未返回具体审核说明"}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Evidence({
  label,
  value,
  mono,
  className,
}: {
  label: string;
  value?: string | null;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("mt-1 break-all text-sm", mono && "font-mono text-xs")}>
        {value || "-"}
      </div>
    </div>
  );
}

function formatWechatRawState(value?: string | null) {
  if (!value) return "尚未提交微信";
  const labels: Record<string, string> = {
    APPLYMENT_STATE_EDITTING: "待修正",
    APPLYMENT_STATE_AUDITING: "审核中",
    APPLYMENT_STATE_REJECTED: "已驳回",
    APPLYMENT_STATE_TO_BE_CONFIRMED: "待账户验证",
    APPLYMENT_STATE_TO_BE_SIGNED: "待签约",
    APPLYMENT_STATE_SIGNING: "开通中",
    APPLYMENT_STATE_FINISHED: "已完成",
    APPLYMENT_STATE_CANCELED: "已取消",
  };
  return labels[value] || value;
}

function formatStageState(state: StageState) {
  if (state === "done") return "已完成";
  if (state === "current") return "当前阶段";
  if (state === "issue") return "需要处理";
  return "未开始";
}
