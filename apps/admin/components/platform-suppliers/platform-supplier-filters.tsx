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

export function PlatformSupplierFilters({
  keyword,
  supplierType,
  onboardingStatus,
  operationalStatus,
  qualificationHealth,
  view,
}: {
  keyword: string;
  supplierType: string;
  onboardingStatus: string;
  operationalStatus: string;
  qualificationHealth: string;
  view: string;
}) {
  return (
    <form className="flex flex-wrap items-center gap-3" method="get">
      <input type="hidden" name="view" value={view} />
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
            placeholder="供应商名称、编码或信用代码"
          />
        </span>
      </label>
      <FilterSelect
        name="supplier_type"
        label="类型"
        value={supplierType}
        options={supplierTypeOptions}
      />
      <FilterSelect
        name="onboarding_status"
        label="准入"
        value={onboardingStatus}
        options={[
          { value: "draft", label: "草稿" },
          { value: "pending_review", label: "待审核" },
          { value: "approved", label: "已准入" },
          { value: "rejected", label: "已驳回" },
        ]}
      />
      <FilterSelect
        name="operational_status"
        label="运营"
        value={operationalStatus}
        options={[
          { value: "active", label: "正常" },
          { value: "suspended", label: "已暂停" },
          { value: "blacklisted", label: "黑名单" },
        ]}
      />
      <FilterSelect
        name="qualification_health"
        label="资质"
        value={qualificationHealth}
        options={[
          { value: "valid", label: "有效" },
          { value: "expiring", label: "即将到期" },
          { value: "expired", label: "已过期" },
          { value: "missing", label: "缺少必填资质" },
        ]}
      />
      <Button type="submit" size="sm">
        查询供应商
      </Button>
      <Button type="reset" variant="outline" size="sm" asChild>
        <a href={`/platform/suppliers?view=${view}`}>清除筛选</a>
      </Button>
    </form>
  );
}
