import Link from "next/link";
import { TriangleAlert } from "lucide-react";

import { useServiceAccess } from "@/components/service-access/service-access-context";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { buildServiceReadonlyBannerContent } from "./service-access-display";

export function ServiceReadonlyBanner() {
  const { summary } = useServiceAccess();
  if (!summary) return null;

  const content = buildServiceReadonlyBannerContent(summary);

  return (
    <Alert>
      <TriangleAlert />
      <AlertTitle>只读宽限期</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
        <span>
          当前企业服务处于只读宽限期。您可以查看现有数据，新增、编辑和删除操作暂不可用。
          {content.endsAtLabel ? ` 宽限期截止：${content.endsAtLabel}。` : null}
        </span>
        <Link
          href="/service-access"
          className="shrink-0 font-medium text-foreground underline underline-offset-4"
        >
          {content.linkLabel}
        </Link>
      </AlertDescription>
    </Alert>
  );
}
