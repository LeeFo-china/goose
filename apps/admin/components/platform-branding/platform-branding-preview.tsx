import { ImageIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type {
  EffectiveBranding,
  PlatformBrandingFormValues,
} from "./platform-branding-types";

function BrandIdentity({
  name,
  logoUrl,
  emptyLabel,
}: {
  name: string;
  logoUrl: string;
  emptyLabel: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-background">
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={name ? `${name} Logo` : "品牌 Logo"}
            className="size-full object-contain"
          />
        ) : (
          <ImageIcon className="size-6 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0">
        <div className="truncate text-base font-semibold">
          {name.trim() || emptyLabel}
        </div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {logoUrl ? "名称与 Logo 将作为品牌识别信息展示" : "上传 Logo 后可查看完整效果"}
        </p>
      </div>
    </div>
  );
}

export function PlatformBrandingPreview({
  values,
  effective,
}: {
  values: PlatformBrandingFormValues;
  effective: EffectiveBranding;
}) {
  return (
    <section
      aria-label="平台品牌预览"
      className="flex flex-col gap-4 rounded-lg border bg-muted/20 p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">品牌效果</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            保存草稿不会立即影响线上展示。
          </p>
        </div>
        <Badge variant="secondary">编辑预览</Badge>
      </div>

      <BrandIdentity
        name={values.displayName}
        logoUrl={values.logoUrl}
        emptyLabel="请输入品牌名称"
      />

      <Separator />

      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-medium text-muted-foreground">
            当前线上品牌
          </div>
          <div className="mt-1 text-sm font-semibold">
            {effective.support_text}
          </div>
        </div>
        <Badge variant="outline">版本 {effective.version}</Badge>
      </div>
      <BrandIdentity
        name={effective.display_name}
        logoUrl={effective.logo_url}
        emptyLabel="平台默认品牌"
      />
    </section>
  );
}
