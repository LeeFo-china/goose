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

import {
  virtualProductStatusOptions,
  virtualProductTypeOptions,
} from "./platform-virtual-product-rules";

function FilterSelect({
  name,
  label,
  value,
  options,
}: {
  name: string;
  label: string;
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
}) {
  return (
    <label className="flex min-w-fit items-center gap-2">
      <span className="shrink-0 text-sm font-medium">{label}</span>
      <Select name={name} defaultValue={value || "all"}>
        <SelectTrigger className="h-9 w-[132px] bg-card shadow-none">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="all">全部</SelectItem>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </label>
  );
}

export function PlatformVirtualProductFilters({
  keyword,
  productType,
  status,
}: {
  keyword: string;
  productType: string;
  status: string;
}) {
  return (
    <form className="flex flex-wrap items-center gap-3" method="get">
      <label className="flex min-w-[240px] flex-1 items-center gap-2">
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
            placeholder="商品名称或系统编码"
          />
        </span>
      </label>
      <FilterSelect
        name="product_type"
        label="类型"
        value={productType}
        options={virtualProductTypeOptions}
      />
      <FilterSelect
        name="status"
        label="状态"
        value={status}
        options={virtualProductStatusOptions}
      />
      <Button type="submit" size="sm">
        查询商品
      </Button>
      <Button type="reset" variant="outline" size="sm" asChild>
        <a href="/platform/virtual-products">清除筛选</a>
      </Button>
    </form>
  );
}
