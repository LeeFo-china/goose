import { Badge } from "@/components/ui/badge";

import type { CatalogOwnershipScope } from "./tenant-catalog-types";

const dimensionLabels: Record<string, string> = {
  quantity: "数量",
  length: "长度",
  area: "面积",
  volume: "体积",
  weight: "重量",
  legacy_unclassified: "历史未分类",
};

export function TenantCatalogSourceBadge({
  ownershipScope,
}: {
  ownershipScope: CatalogOwnershipScope;
}) {
  return ownershipScope === "platform"
    ? <Badge variant="outline">平台共享</Badge>
    : <Badge variant="secondary">租户私有</Badge>;
}

export function CatalogUnitDimension({ value }: { value: string }) {
  return <Badge variant="outline">{dimensionLabels[value] ?? value}</Badge>;
}

export function UnitSuggestionStatusBadge({
  status,
}: {
  status: "submitted" | "approved" | "rejected";
}) {
  const meta = {
    submitted: { label: "待审核", variant: "warning" as const },
    approved: { label: "已通过", variant: "success" as const },
    rejected: { label: "已拒绝", variant: "secondary" as const },
  }[status];
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}

export function TenantCategoryIdentity({
  fullName,
  mappedPlatformName,
}: {
  fullName: string;
  mappedPlatformName: string | null;
}) {
  return (
    <div className="flex min-w-[220px] flex-col gap-1">
      <span className="font-semibold">{fullName}</span>
      <span className="text-xs text-muted-foreground">
        {mappedPlatformName ?? "未映射平台标准分类"}
      </span>
    </div>
  );
}
