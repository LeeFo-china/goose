import { CheckCircle2, SlidersHorizontal } from "lucide-react";
import type { SettingsGroup } from "@/components/settings/settings-group-types";
import { Badge } from "@/components/ui/badge";

function SettingsHeaderIcon() {
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground">
      <SlidersHorizontal aria-hidden="true" className="size-4" />
    </span>
  );
}

function SettingsHeaderMetric({
  label,
  value,
  variant = "outline",
}: {
  label: string;
  value: number;
  variant?: "outline" | "secondary" | "warning" | "danger";
}) {
  return (
    <Badge variant={variant} className="gap-1.5">
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </Badge>
  );
}

type PlatformSettingsHeaderProps = {
  totalCount: number;
  databaseCount: number;
  envCount: number;
  emptyCount: number;
  secretCount: number;
};

export function PlatformSettingsHeader({
  totalCount,
  databaseCount,
  envCount,
  emptyCount,
  secretCount,
}: PlatformSettingsHeaderProps) {
  return (
    <div className="flex min-w-0 shrink-0 items-start gap-3">
      <SettingsHeaderIcon />
      <div className="min-w-0 flex-1">
        <h1 className="text-xl font-semibold tracking-normal">平台系统配置</h1>
        <p className="mt-1 max-w-4xl text-sm text-muted-foreground">
          平台级能力由平台统一维护，包含短信网关、监控接入、AI、微信、短视频识别和通知配置。密钥类配置加密存储并保留环境变量回退。
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <SettingsHeaderMetric label="配置项" value={totalCount} variant="secondary" />
          <SettingsHeaderMetric label="数据库覆盖" value={databaseCount} />
          <SettingsHeaderMetric label="环境变量回退" value={envCount} />
          <SettingsHeaderMetric
            label="未配置"
            value={emptyCount}
            variant={emptyCount > 0 ? "warning" : "outline"}
          />
          <SettingsHeaderMetric
            label="敏感项"
            value={secretCount}
            variant={secretCount > 0 ? "warning" : "outline"}
          />
        </div>
      </div>
    </div>
  );
}

export function TenantSettingsHeader({ groups }: { groups: SettingsGroup[] }) {
  const incompleteGroupCount = groups.filter((group) => group.emptyCount > 0).length;

  return (
    <div className="flex min-w-0 shrink-0 items-start gap-3">
      <SettingsHeaderIcon />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-normal">租户系统配置</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            管理本租户使用的短信服务和客服入口。平台密钥及模板不会在租户侧展示。
          </p>
        </div>
        <Badge
          variant={incompleteGroupCount > 0 ? "warning" : "success"}
          className="w-fit gap-1.5"
        >
          <CheckCircle2 aria-hidden="true" className="size-3.5" />
          {incompleteGroupCount > 0
            ? `${incompleteGroupCount} 个分组待完善`
            : "配置已就绪"}
        </Badge>
      </div>
    </div>
  );
}
