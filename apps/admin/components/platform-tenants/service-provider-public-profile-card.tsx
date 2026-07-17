import type { ReactNode } from "react";
import { Store } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import {
  publicationStatusMeta,
  type ServiceProviderProfile,
} from "@/components/tenant-onboarding/tenant-onboarding-types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("zh-CN");
}

function text(value?: string | null) {
  return value && value.trim() ? value : "-";
}

function formatCoordinate(latitude?: number | null, longitude?: number | null) {
  if (latitude == null || longitude == null) return "-";
  return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
}

function formatServiceProviderAddress(profile: ServiceProviderProfile) {
  const region = [
    profile.address_province,
    profile.address_city,
    profile.address_district,
  ].filter(Boolean).join(" ");
  return text([region, profile.address].filter(Boolean).join(" "));
}

function ProfileInfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 break-words text-sm font-medium">{value}</div>
    </div>
  );
}

export function ServiceProviderPublicProfileCard({
  profile,
  error,
}: {
  profile: ServiceProviderProfile | null;
  error?: string | null;
}) {
  const statusMeta = profile ? publicationStatusMeta[profile.status] : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-md bg-accent text-accent-foreground">
              <Store />
            </div>
            <div>
              <CardTitle>服务商公开资料</CardTitle>
              <CardDescription>小程序本地服务商页使用的已审核公开信息</CardDescription>
            </div>
          </div>
          {statusMeta ? <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge> : null}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error ? <StatusAlert>{error}</StatusAlert> : null}
        {profile ? (
          <>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              <ProfileInfoRow label="公开名称" value={text(profile.public_name)} />
              <ProfileInfoRow label="公开电话" value={text(profile.public_phone)} />
              <ProfileInfoRow
                label="发布状态"
                value={statusMeta ? <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge> : "-"}
              />
              <ProfileInfoRow label="公开地址" value={formatServiceProviderAddress(profile)} />
              <ProfileInfoRow
                label="地址区域"
                value={text([profile.address_province, profile.address_city, profile.address_district].filter(Boolean).join(" "))}
              />
              <ProfileInfoRow label="地址区域代码" value={text(profile.address_region_code)} />
              <ProfileInfoRow label="公开坐标" value={formatCoordinate(profile.address_latitude, profile.address_longitude)} />
              <ProfileInfoRow label="提交时间" value={formatDate(profile.submitted_at)} />
              <ProfileInfoRow label="审核时间" value={formatDate(profile.reviewed_at)} />
              <ProfileInfoRow label="发布时间" value={formatDate(profile.published_at)} />
            </div>
            <div className="rounded-md border bg-muted/30 px-3 py-2">
              <div className="text-xs text-muted-foreground">公开简介</div>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-6">
                {text(profile.introduction)}
              </p>
            </div>
          </>
        ) : (
          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            暂无服务商公开资料。租户提交并通过平台审核后，这里会展示小程序侧公开信息。
          </div>
        )}
      </CardContent>
    </Card>
  );
}
