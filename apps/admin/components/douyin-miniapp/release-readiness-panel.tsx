import Link from "next/link";
import type {
  DouyinReleaseBlockerCode,
  DouyinReleaseReadiness,
} from "@gooes/domain";
import { ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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
    <div aria-label="提审就绪检查">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold">提审就绪检查</h2>
        <Badge variant={readiness.ready ? "success" : "danger"}>
          {readiness.ready ? "已达到提审条件" : `${readiness.blockers.length} 项阻断`}
        </Badge>
        <span className="text-xs text-muted-foreground">最近检查：{checkedAt}</span>
      </div>

      {!readiness.ready ? (
        <div className="mt-3 divide-y">
          {readiness.blockers.map((item) => {
            const action = releaseReadinessActionRoute(item.code);
            return (
              <div className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between" key={item.code}>
                <p className="text-sm">{item.message}</p>
                <Button asChild size="sm" variant="ghost">
                  <Link href={action.href}>{action.label}<ArrowUpRight aria-hidden="true" /></Link>
                </Button>
              </div>
            );
          })}
        </div>
      ) : null}

      {readiness.warnings.length > 0 ? (
        <div className="mt-3 text-xs text-muted-foreground">
          <p className="font-medium">需要记录的风险提示</p>
          <ul className="mt-1 list-disc space-y-1 pl-4">
            {readiness.warnings.map((item) => <li key={item.code}>{item.message}</li>)}
          </ul>
        </div>
      ) : null}

      {!readiness.ready ? (
        <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
          <ReadinessMetric label="公开项目" value={readiness.metrics.published_project_count} />
          <ReadinessMetric label="服务区域" value={readiness.metrics.active_service_area_count} />
          <ReadinessMetric label="提审宿主" value={readiness.metrics.required_host_count} />
        </dl>
      ) : null}
    </div>
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
    <div className="flex gap-1">
      <dt>{label}</dt>
      <dd className="font-medium tabular-nums text-foreground">
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
