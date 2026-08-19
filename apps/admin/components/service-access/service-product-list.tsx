import { CircleAlert, PackageOpen } from "lucide-react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";

import {
  formatServiceAmountFen,
  type ServiceProduct,
} from "./service-purchase-api";

export function ServiceProductList({
  products,
  loading,
  error,
  onRetry,
}: {
  products: readonly ServiceProduct[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  if (loading) {
    return (
      <div className="flex flex-col gap-3" role="status" aria-live="polite">
        <p className="text-sm text-muted-foreground">正在加载服务套餐</p>
        {[0, 1].map((item) => (
          <Skeleton key={item} className="h-28 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <CircleAlert aria-hidden="true" />
        <AlertTitle>服务套餐加载失败</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-3">
          <p>{error}</p>
          <Button type="button" size="sm" variant="outline" onClick={onRetry}>
            重试
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (products.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <PackageOpen aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>暂无可购买套餐</EmptyTitle>
          <EmptyDescription>
            当前没有已发布的技术服务套餐，请稍后重试。
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <ul className="divide-y rounded-md border">
      {products.map((product) => (
        <li key={product.id} className="flex flex-col gap-4 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h4 className="font-medium text-foreground">{product.title}</h4>
              <p className="mt-1 text-xs text-muted-foreground">
                {product.code}
              </p>
            </div>
            <p className="shrink-0 text-lg font-semibold tabular-nums">
              {formatServiceAmountFen(product.amount_fen)}
            </p>
          </div>

          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">服务年限</dt>
              <dd className="mt-1 font-medium">{product.term_years} 年</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">服务条款</dt>
              <dd className="mt-1 font-medium">
                条款版本 {product.terms_version}
              </dd>
            </div>
          </dl>

          <div className="flex flex-wrap gap-2" aria-label="服务范围">
            {product.service_scope.map((scope) => (
              <Badge key={scope} variant="outline">{scope}</Badge>
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}
