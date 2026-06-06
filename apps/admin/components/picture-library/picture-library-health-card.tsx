import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ImageOff,
  MessageSquareWarning,
  ShieldCheck,
  Tags,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  PictureLibraryHealthIssue,
  PictureLibraryHealthReport,
} from "@/components/picture-library/picture-library-types";

type MetricItem = {
  label: string;
  value: number;
  hint: string;
  tone: "default" | "warning" | "danger";
  icon: typeof Activity;
  href?: string;
};

function severityBadge(issue: PictureLibraryHealthIssue) {
  return issue.severity === "danger"
    ? <Badge variant="danger">严重</Badge>
    : <Badge variant="outline">提醒</Badge>;
}

function issueTypeLabel(type: PictureLibraryHealthIssue["type"]) {
  switch (type) {
    case "missing_variant":
      return "缺失规格";
    case "uncategorized_asset":
      return "未分类";
    case "category_without_cover":
      return "分类无封面";
    case "comment_count_mismatch":
      return "计数不一致";
  }
}

function metricClassName(tone: MetricItem["tone"]) {
  if (tone === "danger") return "border-destructive/25 bg-destructive/5";
  if (tone === "warning") return "border-amber-200 bg-amber-50/70";
  return "border-border bg-muted/30";
}

export function PictureLibraryHealthCard({
  health,
}: {
  health: PictureLibraryHealthReport | null;
}) {
  const metrics = health?.metrics;
  const items: MetricItem[] = [
    {
      label: "治理异常",
      value: metrics?.issue_total ?? 0,
      hint: "规格、分类、计数",
      tone: metrics?.issue_total ? "warning" : "default",
      icon: AlertTriangle,
    },
    {
      label: "待处理评论",
      value: metrics?.pending_comment_total ?? 0,
      hint: "进入人工治理池",
      tone: metrics?.pending_comment_total ? "warning" : "default",
      icon: MessageSquareWarning,
      href: "/platform/picture-library?comment_status=pending",
    },
    {
      label: "缺失规格图片",
      value: metrics?.missing_variant_asset_total ?? 0,
      hint: "thumb / cover / large",
      tone: metrics?.missing_variant_asset_total ? "warning" : "default",
      icon: ImageOff,
    },
    {
      label: "启用分类",
      value: metrics?.active_category_total ?? 0,
      hint: `停用 ${metrics?.inactive_category_total ?? 0} 个`,
      tone: "default",
      icon: Tags,
    },
  ];

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle>运营健康</CardTitle>
          <CardDescription>
            图片规格、分类覆盖、评论治理和计数一致性检查。
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={metrics?.issue_total ? "outline" : "default"}>
            {metrics?.issue_total ? "需要处理" : "状态正常"}
          </Badge>
          <Button variant="outline" size="sm" asChild>
            <Link href="/platform/picture-library?comment_status=pending">处理评论</Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-3 md:grid-cols-4">
          {items.map((item) => {
            const Icon = item.icon;
            const content = (
              <div className={`rounded-md border p-3 ${metricClassName(item.tone)}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-muted-foreground">{item.label}</span>
                  <Icon className="size-4 text-muted-foreground" />
                </div>
                <div className="mt-2 text-2xl font-semibold tracking-normal">{item.value}</div>
                <div className="mt-1 text-xs text-muted-foreground">{item.hint}</div>
              </div>
            );
            return item.href ? (
              <Link key={item.label} href={item.href} className="block">
                {content}
              </Link>
            ) : (
              <div key={item.label}>{content}</div>
            );
          })}
        </div>

        <div className="rounded-md border">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <ShieldCheck className="size-4 text-muted-foreground" />
              异常摘要
            </div>
            <span className="text-xs text-muted-foreground">
              {health ? new Date(health.generated_at).toLocaleString("zh-CN") : "-"}
            </span>
          </div>
          {health && health.issues.length > 0 ? (
            <div className="divide-y">
              {health.issues.slice(0, 6).map((issue) => (
                <div key={`${issue.type}:${issue.resource_id}`} className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {severityBadge(issue)}
                      <Badge variant="secondary">{issueTypeLabel(issue.type)}</Badge>
                      <span className="truncate text-sm font-medium">{issue.resource_label}</span>
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">{issue.detail}</div>
                  </div>
                  <span className="text-xs text-muted-foreground">{issue.resource_type}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-4 py-6 text-sm text-muted-foreground">
              暂无需要处理的治理异常。
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
