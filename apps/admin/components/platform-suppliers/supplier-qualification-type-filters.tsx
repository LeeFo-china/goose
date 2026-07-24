import { Search } from "lucide-react";

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

import { supplierTypeOptions } from "./platform-supplier-types";

export function SupplierQualificationTypeFilters({
  keyword,
  supplierType,
  status,
}: {
  keyword: string;
  supplierType: string;
  status: string;
}) {
  return (
    <form className="flex flex-wrap items-center gap-3" method="get">
      <input type="hidden" name="view" value="qualification-types" />
      <label className="flex min-w-[260px] flex-1 items-center gap-2">
        <span className="shrink-0 text-sm font-medium">搜索</span>
        <span className="relative min-w-0 flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            name="keyword"
            defaultValue={keyword}
            className="h-9 pl-9"
            placeholder="资质类型名称或编码"
          />
        </span>
      </label>
      <label className="flex items-center gap-2">
        <span className="shrink-0 text-sm font-medium">适用类型</span>
        <Select name="supplier_type" defaultValue={supplierType || "all"}>
          <SelectTrigger className="h-9 w-[140px] bg-card shadow-none">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="all">全部类型</SelectItem>
              {supplierTypeOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </label>
      <label className="flex items-center gap-2">
        <span className="shrink-0 text-sm font-medium">状态</span>
        <Select name="status" defaultValue={status || "all"}>
          <SelectTrigger className="h-9 w-[112px] bg-card shadow-none">
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
      </label>
      <Button type="submit" size="sm">
        查询类型
      </Button>
      <Button type="reset" variant="outline" size="sm" asChild>
        <a href="/platform/suppliers?view=qualification-types">清除筛选</a>
      </Button>
    </form>
  );
}
