import Link from "next/link";
import type {
  DouyinReleaseBlockerCode,
  DouyinReleaseReadiness,
} from "@gooes/domain";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Info,
  ShieldCheck,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type ActionRoute = {
  readonly label: string;
  readonly href: string;
};

export function releaseReadinessActionRoute(
  code: DouyinReleaseBlockerCode,
): ActionRoute {
  if (code.startsWith("PUBLIC_PROFILE") || code === "PUBLIC_SERVICE_AREA_MISSING") {
    return { label: "维护公开资料", href: "/settings/service-provider" };
  }
  if (code.startsWith("PUBLIC_PROJECT")) {
    return { label: "管理项目内容", href: "/douyin-miniapp/projects" };
  }
  if (code.startsWith("BUDGET_PRICING")) {
    return { label: "维护预算报价", href: "/douyin-miniapp/budget" };
  }
  if (code === "SMS_UNAVAILABLE" || code === "PRIVACY_VERSION_MISSING") {
    return { label: "检查短信配置", href: "/settings" };
  }
  if (code === "HOST_CONFIGURATION_MISSING") {
    return { label: "填写提审宿主", href: "/douyin-miniapp/workspace" };
  }
  return { label: "检查小程序授权", href: "/douyin-miniapp/workspace" };
}

export function ReleaseReadinessPanel({
  readiness,
}: {
  readonly readiness: DouyinReleaseReadiness;
}) {
  const checkedAt = formatDateTime(readiness.checked_at);
  return (
    <Card>
      <CardHeader className="gap-3 border-b bg-muted/20">
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
          <div className="flex min-w-0 flex-col gap-1.5">
            <CardTitle className="flex items-center gap-2">
              {readiness.ready
                ? <ShieldCheck aria-hidden="true" />
                : <AlertTriangle aria-hidden="true" />}
              提审就绪检查
            </CardTitle>
            <CardDescription>
              最近检查：{checkedAt}。阻断项必须清零后才能提交审核。
            </CardDescription>
          </div>
          <Badge variant={readiness.ready ? "success" : "danger"}>
            {readiness.ready
              ? "已达到提审条件"
              : `${readiness.blockers.length} 项阻断`}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 pt-5">
        {readiness.ready ? (
          <Alert>
            <CheckCircle2 aria-hidden="true" />
            <AlertTitle>已达到提审条件</AlertTitle>
            <AlertDescription>
              当前公开资料、项目内容、预算报价、短信和宿主配置均满足提审门槛。
            </AlertDescription>
          </Alert>
        ) : (
          <div className="flex flex-col gap-3">
            {readiness.blockers.map((item) => {
              const action = releaseReadinessActionRoute(item.code);
              return (
                <div
                  className="flex flex-col gap-3 rounded-md border bg-background p-3 md:flex-row md:items-start md:justify-between"
                  key={item.code}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{item.message}</p>
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <Link href={action.href}>
                      {action.label}
                      <ArrowUpRight aria-hidden="true" />
                    </Link>
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        {readiness.warnings.length > 0 ? (
          <Alert>
            <Info aria-hidden="true" />
            <AlertTitle>需要记录的风险提示</AlertTitle>
            <AlertDescription>
              <ul className="mt-2 flex list-disc flex-col gap-1 pl-4">
                {readiness.warnings.map((item) => (
                  <li key={item.code}>
                    {item.message}
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        ) : null}

        <dl className="grid gap-px overflow-hidden rounded-md border bg-border md:grid-cols-3">
          <ReadinessMetric
            label="公开项目"
            value={readiness.metrics.published_project_count}
          />
          <ReadinessMetric
            label="服务区域"
            value={readiness.metrics.active_service_area_count}
          />
          <ReadinessMetric
            label="提审宿主"
            value={readiness.metrics.required_host_count}
          />
        </dl>
      </CardContent>
    </Card>
  );
}

function ReadinessMetric({
  label,
  value,
}: {
  readonly label: string;
  readonly value: unknown;
}) {
  return (
    <div className="bg-background px-4 py-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-base font-semibold tabular-nums">
        {typeof value === "number" || typeof value === "string" ? value : "未同步"}
      </dd>
    </div>
  );
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间待同步";
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Shanghai",
  }).format(date);
}
