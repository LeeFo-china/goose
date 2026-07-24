"use client";

import { useRouter } from "next/navigation";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function SupplierCatalogLoadError({
  message,
  canRetry,
}: {
  message: string;
  canRetry: boolean;
}) {
  const router = useRouter();
  return (
    <div className="p-4">
      <Alert variant="destructive">
        <AlertTitle>供应标准目录未加载</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-3">
          <p>{message}</p>
          {canRetry ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => router.refresh()}
            >
              重试加载目录
            </Button>
          ) : null}
        </AlertDescription>
      </Alert>
    </div>
  );
}
