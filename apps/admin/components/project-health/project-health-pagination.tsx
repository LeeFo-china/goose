"use client";

import type { ProjectOperationalRiskRpcPage } from "@gooes/domain";
import { Button } from "@/components/ui/button";

export function ProjectHealthPagination({
  pagination,
  disabled,
  onPageChange,
}: {
  pagination: ProjectOperationalRiskRpcPage["pagination"] | null;
  disabled?: boolean;
  onPageChange: (page: number) => void;
}) {
  const page = pagination?.page ?? 1;
  const totalPages = Math.max(pagination?.total_pages ?? 1, 1);

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        上一页
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        下一页
      </Button>
    </div>
  );
}
