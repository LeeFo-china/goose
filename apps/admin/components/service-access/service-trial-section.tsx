"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PlatformServiceTrialStatus } from "@gooes/domain";
import { CircleAlert, CircleCheck, Clock3 } from "lucide-react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

import { formatServiceAccessDateTime } from "./service-access-display";
import {
  canShowServiceTrialApplication,
  completeServiceTrialSubmission,
  formatServiceTrialError,
  loadCurrentOrRecentServiceTrial,
  type ServiceTrial,
} from "./service-trial-api";
import { ServiceTrialForm } from "./service-trial-form";

const STATUS_META = {
  pending_review: { label: "待审核", variant: "warning" },
  scheduled: { label: "待开始", variant: "secondary" },
  active: { label: "试用中", variant: "success" },
  grace_period: { label: "宽限期", variant: "warning" },
  expired: { label: "已到期", variant: "secondary" },
  rejected: { label: "已驳回", variant: "danger" },
  withdrawn: { label: "已撤回", variant: "secondary" },
  revoked: { label: "已撤销", variant: "danger" },
  converted: { label: "已转正式", variant: "success" },
} as const satisfies Record<
  PlatformServiceTrialStatus,
  { label: string; variant: BadgeProps["variant"] }
>;

export function ServiceTrialSection({
  canApply,
  canView,
  summaryTrialStatus,
  onSummaryRefresh,
}: {
  canApply: boolean;
  canView: boolean;
  summaryTrialStatus: PlatformServiceTrialStatus | null;
  onSummaryRefresh: () => Promise<void>;
}) {
  const [trial, setTrial] = useState<ServiceTrial | null>(null);
  const [loading, setLoading] = useState(canView);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitFeedback, setSubmitFeedback] = useState<string | null>(null);
  const requestSequenceRef = useRef(0);

  const loadTrial = useCallback(async (): Promise<void> => {
    const requestSequence = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestSequence;
    if (!canView) {
      setTrial(null);
      setLoadError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(null);
    try {
      const nextTrial = await loadCurrentOrRecentServiceTrial();
      if (requestSequenceRef.current === requestSequence) setTrial(nextTrial);
    } catch (error) {
      if (requestSequenceRef.current === requestSequence) {
        setLoadError(formatServiceTrialError(
          error,
          "试用状态加载失败，请稍后重试",
        ));
      }
    } finally {
      if (requestSequenceRef.current === requestSequence) setLoading(false);
    }
  }, [canView]);

  useEffect(() => {
    void loadTrial();
    return () => {
      requestSequenceRef.current += 1;
    };
  }, [loadTrial]);

  const handleSubmitted = useCallback(async (
    submittedTrial: ServiceTrial,
  ): Promise<void> => {
    await completeServiceTrialSubmission({
      trial: submittedTrial,
      installTrial: (nextTrial) => {
        requestSequenceRef.current += 1;
        setTrial(nextTrial);
        setLoadError(null);
        setLoading(false);
      },
      showFeedback: (feedback) => setSubmitFeedback(feedback.message),
      refreshSummary: onSummaryRefresh,
    });
  }, [onSummaryRefresh]);

  const effectiveStatus = trial?.status ?? summaryTrialStatus;
  const showApplication = canShowServiceTrialApplication(
    canApply,
    effectiveStatus,
  );
  const canDisplayTrial = canView || submitFeedback !== null;

  if (!canApply && !canDisplayTrial) {
    return (
      <section className="w-full rounded-md border bg-background p-5 md:p-6">
        <h2 className="text-base font-semibold">试用服务</h2>
        <SubmitFeedback message={submitFeedback} />
        <p className="mt-2 text-sm text-muted-foreground">
          请联系企业管理员处理。
        </p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="service-trial-section-title"
      className="w-full space-y-5 rounded-md border bg-background p-5 md:p-6"
    >
      <div>
        <h2 id="service-trial-section-title" className="text-base font-semibold">
          技术服务试用
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          查看当前或最近一次试用申请，并在具备权限时提交申请。
        </p>
      </div>

      {canDisplayTrial ? (
        <TrialStatusContent
          trial={trial}
          loading={loading}
          loadError={loadError}
          onRetry={loadTrial}
        />
      ) : null}

      <SubmitFeedback message={submitFeedback} />

      {effectiveStatus === "pending_review" || effectiveStatus === "scheduled" ? (
        <Alert>
          <Clock3 aria-hidden="true" />
          <AlertTitle>申请处理中</AlertTitle>
          <AlertDescription>
            {effectiveStatus === "pending_review"
              ? "试用申请正在审核，请勿重复提交。"
              : "试用已安排生效时间，请等待服务开始。"}
          </AlertDescription>
        </Alert>
      ) : null}

      {showApplication ? (
        <div className="space-y-4 border-t pt-5">
          <div>
            <h3 className="text-sm font-semibold">申请试用</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              平台将在提交后审核企业信息和使用计划。
            </p>
          </div>
          <ServiceTrialForm onSubmitted={handleSubmitted} />
        </div>
      ) : null}
    </section>
  );
}

function SubmitFeedback({ message }: { message: string | null }) {
  if (!message) return null;

  return (
    <Alert className="mt-3 border-success/30 bg-success/5">
      <CircleCheck aria-hidden="true" />
      <AlertTitle>提交成功</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

function TrialStatusContent({
  trial,
  loading,
  loadError,
  onRetry,
}: {
  trial: ServiceTrial | null;
  loading: boolean;
  loadError: string | null;
  onRetry: () => Promise<void>;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner />
        正在加载试用状态
      </div>
    );
  }

  if (loadError) {
    return (
      <Alert variant="destructive">
        <CircleAlert aria-hidden="true" />
        <AlertTitle>试用状态加载失败</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>{loadError}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void onRetry()}>
            重新加载
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (!trial) {
    return (
      <Alert>
        <AlertTitle>暂无试用记录</AlertTitle>
        <AlertDescription>当前企业尚无可展示的试用申请。</AlertDescription>
      </Alert>
    );
  }

  const statusMeta = STATUS_META[trial.status];
  const rows = trialRows(trial);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">当前或最近申请</h3>
        <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
      </div>
      <dl className="divide-y rounded-md border">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:justify-between sm:gap-6"
          >
            <dt className="text-sm text-muted-foreground">{row.label}</dt>
            <dd className="max-w-md text-sm font-medium sm:text-right">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function trialRows(trial: ServiceTrial): Array<{ label: string; value: string }> {
  return [
    { label: "申请原因", value: trial.application_reason || "—" },
    {
      label: "预计规模",
      value: `${countLabel(trial.expected_user_count, "人")} · ${
        countLabel(trial.expected_project_count, "个项目")
      }`,
    },
    {
      label: "联系人",
      value: [trial.contact_name, trial.contact_phone].filter(Boolean).join(" · ") || "—",
    },
    { label: "申请时间", value: formatServiceAccessDateTime(trial.requested_at) },
    { label: "审核时间", value: formatServiceAccessDateTime(trial.reviewed_at) },
    { label: "开始时间", value: formatServiceAccessDateTime(trial.starts_at) },
    { label: "试用结束", value: formatServiceAccessDateTime(trial.trial_ends_at) },
    { label: "宽限结束", value: formatServiceAccessDateTime(trial.grace_ends_at) },
  ];
}

function countLabel(value: number | null, unit: string): string {
  return value === null ? "—" : `${value} ${unit}`;
}
