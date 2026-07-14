"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useMemo, useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, Rocket, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type { ProductionReleaseCandidate, ReleaseRun, ReleaseService } from "@/components/ops/ops-types";
import { deployProductionReleaseCandidate, fetchProductionReleaseCandidate, formatDateTime } from "@/components/ops/release-deployments-shared";

const PRODUCTION_DEPLOY_CONFIRM_TEXT = "确认部署生产环境";

const RELEASE_SERVICE_LABELS: Record<Exclude<ReleaseService, "all">, string> = {
  api: "API",
  admin: "Admin",
  "social-video-worker": "社媒视频 Worker",
  "cos-reconcile-worker": "COS 对账 Worker",
};

type ReleaseCandidateEvidenceProps = {
  run: ReleaseRun | null;
  configured: boolean;
  onSubmitted: () => void;
};

export function ReleaseCandidateEvidence({ run, configured, onSubmitted }: ReleaseCandidateEvidenceProps) {
  const [candidate, setCandidate] = useState<ProductionReleaseCandidate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!run) {
      setCandidate(null);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setCandidate(null);
    fetchProductionReleaseCandidate(run.id)
      .then((data) => {
        if (!cancelled) setCandidate(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "生产候选证据校验失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [run?.id]);

  useEffect(() => {
    setConfirmText("");
    setReason("");
    setOpen(false);
  }, [run?.id]);

  const serviceLabel = useMemo(() => {
    if (!candidate?.services.length) return "-";
    return candidate.services.map((service) => RELEASE_SERVICE_LABELS[service] || service).join("、");
  }, [candidate]);
  const candidateRunUrl = candidate ? candidate.run_url || run?.html_url || "" : "";

  const openDisabledReason = getCandidateOpenDisabledReason({
    loading,
    configured,
    run,
    candidate,
    error,
    pending,
  });
  const submitDisabledReason = getCandidateDeployDisabledReason({
    loading,
    configured,
    run,
    candidate,
    error,
    confirmText,
    pending,
  });

  function runDeploy() {
    if (!candidate || submitDisabledReason) return;
    startTransition(async () => {
      try {
        const data = await deployProductionReleaseCandidate(candidate.build_run_id, {
          services: candidate.services,
          confirm_text: PRODUCTION_DEPLOY_CONFIRM_TEXT,
          reason: reason.trim() || undefined,
        });
        toast.success(data.message || "生产候选部署已提交");
        setOpen(false);
        setConfirmText("");
        setReason("");
        onSubmitted();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "生产候选部署提交失败");
      }
    });
  }

  return (
    <section className="border-t pt-5">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">生产候选证据</h3>
              <Badge variant={candidate?.manifest_verified ? "success" : "outline"}>
                {candidate?.manifest_verified ? "镜像清单已验证" : "等待候选"}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              只允许部署已完成构建、Tag/SHA/镜像清单一致的候选；部署前仍需二次确认。
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 md:items-end">
            <AlertDialog open={open} onOpenChange={(nextOpen) => {
              if (nextOpen) {
                setConfirmText("");
                setReason("");
              }
              setOpen(nextOpen);
            }}>
              <AlertDialogTrigger asChild>
                <Button type="button" disabled={Boolean(openDisabledReason)}>
                  {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Rocket data-icon="inline-start" />}
                  部署此构建到生产
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>确认部署生产候选</AlertDialogTitle>
                  <AlertDialogDescription>
                    将把候选 {candidate?.tag || "-"} 的 {candidate?.commit_sha.slice(0, 12) || "-"} 部署到生产环境。
                    本次只使用构建 Run {candidate?.build_run_id || "-"} 的已验证镜像。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="production-deploy-confirm">生产确认</FieldLabel>
                    <Input
                      id="production-deploy-confirm"
                      value={confirmText}
                      onChange={(event) => setConfirmText(event.target.value)}
                      placeholder="输入：确认部署生产环境"
                    />
                    <FieldDescription>输入完整确认文本后才能部署。</FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="production-deploy-reason">部署说明</FieldLabel>
                    <Textarea
                      id="production-deploy-reason"
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      rows={3}
                      placeholder="可选，说明本次生产部署原因"
                    />
                  </Field>
                </FieldGroup>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={pending}>取消</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={Boolean(submitDisabledReason)}
                    onClick={(event) => {
                      event.preventDefault();
                      runDeploy();
                    }}
                  >
                    {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <ShieldCheck data-icon="inline-start" />}
                    确认部署
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            {openDisabledReason ? <p className="text-xs text-muted-foreground">{openDisabledReason}</p> : null}
          </div>
        </div>

        {!run ? (
          <div className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
            暂无可部署的生产候选。先在生产环境构建候选，成功后会在这里展示证据。
          </div>
        ) : null}

        {loading ? <ReleaseCandidateSkeleton /> : null}

        {error ? (
          <Alert variant="destructive">
            <AlertTriangle data-icon="inline-start" />
            <AlertTitle>候选证据校验失败</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {candidate ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <EvidenceRow label="Tag" value={candidate.tag} />
            <EvidenceRow label="Commit SHA" value={candidate.commit_sha} hint={candidate.commit_sha.slice(0, 12)} />
            <EvidenceRow
              label="构建 Run"
              value={candidate.build_run_id}
              action={candidateRunUrl ? (
                <Button asChild variant="ghost" size="sm">
                  <Link href={candidateRunUrl} target="_blank" rel="noreferrer">
                    <ExternalLink data-icon="inline-start" />
                    查看
                  </Link>
                </Button>
              ) : null}
            />
            <EvidenceRow label="服务" value={serviceLabel} />
            <EvidenceRow label="构建时间" value={formatDateTime(candidate.created_at)} />
            <div className="rounded-md border bg-background p-3">
              <div className="text-xs text-muted-foreground">校验状态</div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge variant={candidate.ready_to_deploy ? "success" : "warning"}>
                  {candidate.ready_to_deploy ? "可部署" : "待处理"}
                </Badge>
                <Badge variant={candidate.already_deployed ? "secondary" : "outline"}>
                  {candidate.already_deployed ? "已部署" : "未部署"}
                </Badge>
                <Badge variant="success">
                  <CheckCircle2 data-icon="inline-start" />
                  镜像清单已验证
                </Badge>
              </div>
              {candidate.blocked_reason ? (
                <p className="mt-2 text-xs text-muted-foreground">{candidate.blocked_reason}</p>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function ReleaseCandidateSkeleton() {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="rounded-md border bg-background p-3">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-3 h-4 w-3/4" />
        </div>
      ))}
    </div>
  );
}

function EvidenceRow({
  label,
  value,
  hint,
  action,
}: {
  label: string;
  value: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        {action}
      </div>
      <div className="mt-2 min-w-0 break-all text-sm font-medium">{value || "-"}</div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

function getCandidateOpenDisabledReason({
  loading,
  configured,
  run,
  candidate,
  error,
  pending,
}: {
  loading: boolean;
  configured: boolean;
  run: ReleaseRun | null;
  candidate: ProductionReleaseCandidate | null;
  error: string | null;
  pending: boolean;
}) {
  if (pending) return "部署提交中";
  if (loading) return "候选证据加载中";
  if (!configured) return "发布令牌未配置";
  if (!run) return "请选择可部署生产候选";
  if (run.environment !== "production" || run.stage !== "ready_to_deploy" || run.legacy) return "该记录不是可部署生产候选";
  if (error) return "候选证据校验失败";
  if (!candidate) return "候选证据未加载";
  if (candidate.already_deployed) return "该候选已部署，不能重复部署";
  if (candidate.blocked_reason) return candidate.blocked_reason;
  if (!candidate.ready_to_deploy) return "候选未达到部署条件";
  if (candidate.services.length === 0) return "候选服务为空";
  return "";
}

function getCandidateDeployDisabledReason(input: {
  loading: boolean;
  configured: boolean;
  run: ReleaseRun | null;
  candidate: ProductionReleaseCandidate | null;
  error: string | null;
  confirmText: string;
  pending: boolean;
}) {
  const baseReason = getCandidateOpenDisabledReason(input);
  if (baseReason) return baseReason;
  const { confirmText } = input;
  if (confirmText !== PRODUCTION_DEPLOY_CONFIRM_TEXT) return "请输入确认文本";
  return "";
}
