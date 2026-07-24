"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CatalogStatus } from "./supplier-catalog-types";

export function SupplierCatalogFilters({
  keyword,
  status,
}: {
  keyword: string;
  status: CatalogStatus | "";
}) {
  const router = useRouter();
  const [nextKeyword, setNextKeyword] = useState(keyword);
  const [nextStatus, setNextStatus] = useState<CatalogStatus | "all">(
    status || "all",
  );

  function navigate(input: { keyword: string; status: CatalogStatus | "all" }) {
    const params = new URLSearchParams(window.location.search);
    params.delete("page");
    if (input.keyword.trim()) {
      params.set("keyword", input.keyword.trim().slice(0, 80));
    } else {
      params.delete("keyword");
    }
    if (input.status === "all") {
      params.delete("status");
    } else {
      params.set("status", input.status);
    }
    router.push(`${window.location.pathname}?${params.toString()}`);
  }

  return (
    <form
      className="flex flex-col gap-2 sm:flex-row sm:items-center"
      onSubmit={(event) => {
        event.preventDefault();
        navigate({ keyword: nextKeyword, status: nextStatus });
      }}
    >
      <Input
        aria-label="搜索目录编码或名称"
        className="h-9 sm:max-w-sm"
        value={nextKeyword}
        maxLength={80}
        placeholder="搜索编码或名称"
        onChange={(event) => setNextKeyword(event.target.value)}
      />
      <Select
        value={nextStatus}
        onValueChange={(value) =>
          setNextStatus(value as CatalogStatus | "all")
        }
      >
        <SelectTrigger className="h-9 w-full sm:w-36" aria-label="筛选目录状态">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="active">启用</SelectItem>
            <SelectItem value="inactive">停用</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
      <div className="flex gap-2">
        <Button type="submit" size="sm">
          <Search data-icon="inline-start" />
          查询目录
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            setNextKeyword("");
            setNextStatus("all");
            navigate({ keyword: "", status: "all" });
          }}
        >
          <RotateCcw data-icon="inline-start" />
          重置筛选
        </Button>
      </div>
    </form>
  );
}
