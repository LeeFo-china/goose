"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type SuggestionStatus = "submitted" | "approved" | "rejected";

export function PlatformSuggestionFilters({
  status,
}: {
  status: SuggestionStatus | "";
}) {
  const router = useRouter();
  const [nextStatus, setNextStatus] = useState<SuggestionStatus | "all">(
    status || "all",
  );
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={nextStatus} onValueChange={(value) => setNextStatus(value as SuggestionStatus | "all")}>
        <SelectTrigger className="w-40" aria-label="筛选单位建议状态"><SelectValue /></SelectTrigger>
        <SelectContent><SelectGroup>
          <SelectItem value="all">全部状态</SelectItem>
          <SelectItem value="submitted">待审核</SelectItem>
          <SelectItem value="approved">已通过</SelectItem>
          <SelectItem value="rejected">已拒绝</SelectItem>
        </SelectGroup></SelectContent>
      </Select>
      <Button type="button" size="sm" onClick={() => {
        const params = new URLSearchParams({ view: "unit-suggestions" });
        if (nextStatus !== "all") params.set("status", nextStatus);
        router.push(`/platform/catalog?${params}`);
      }}>查询建议</Button>
    </div>
  );
}
