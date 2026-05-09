"use client";

import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

function buildHref(searchParams: URLSearchParams, page: number) {
  const params = new URLSearchParams(searchParams);
  if (page <= 1) {
    params.delete("page");
  } else {
    params.set("page", String(page));
  }
  const query = params.toString();
  return query ? `/social-video?${query}` : "/social-video";
}

export function SocialVideoPagination({
  page,
  pageSize,
  total,
}: {
  page: number;
  pageSize: number;
  total: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const previousDisabled = page <= 1 || pending;
  const nextDisabled = page >= totalPages || pending;

  function navigate(nextPage: number) {
    startTransition(() => {
      router.push(buildHref(searchParams, nextPage));
      router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="text-sm text-muted-foreground">
        第 {page} / {totalPages} 页，共 {total} 条
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={previousDisabled}
          onClick={() => navigate(Math.max(1, page - 1))}
        >
          {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <ChevronLeft data-icon="inline-start" />}
          上一页
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={nextDisabled}
          onClick={() => navigate(page + 1)}
        >
          下一页
          {pending ? <Loader2 className="animate-spin" data-icon="inline-end" /> : <ChevronRight data-icon="inline-end" />}
        </Button>
      </div>
    </div>
  );
}
