"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import type { Pagination } from "@/components/ops/ops-types";
import { Button } from "@/components/ui/button";

function buildOpsHref(page: number) {
  const params = new URLSearchParams();
  params.set("tab", "runs");
  if (page > 1) params.set("page", String(page));
  return `/ops?${params.toString()}`;
}

export function OpsRunsPagination({ pagination }: { pagination: Pagination }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const previousDisabled = pagination.page <= 1 || pending;
  const nextDisabled = pagination.page >= pagination.totalPages || pending;

  function navigate(page: number) {
    startTransition(() => {
      router.push(buildOpsHref(page));
      router.refresh();
    });
  }

  return (
    <div className="flex gap-2">
      <Button
        type="button"
        variant="outline"
        disabled={previousDisabled}
        onClick={() => navigate(Math.max(1, pagination.page - 1))}
      >
        {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <ChevronLeft data-icon="inline-start" />}
        上一页
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={nextDisabled}
        onClick={() => navigate(pagination.page + 1)}
      >
        下一页
        {pending ? <Loader2 className="animate-spin" data-icon="inline-end" /> : <ChevronRight data-icon="inline-end" />}
      </Button>
    </div>
  );
}
