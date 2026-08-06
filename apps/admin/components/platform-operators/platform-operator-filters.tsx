import { Search } from "lucide-react";
import type { ReactNode } from "react";

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

import { platformOperatorStatusOptions } from "./platform-operator-rules";
import type { PlatformRoleOption } from "./platform-operator-types";

function FilterSelect({
  name,
  label,
  value,
  children,
}: {
  name: string;
  label: string;
  value: string;
  children: ReactNode;
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
            {children}
          </SelectGroup>
        </SelectContent>
      </Select>
    </label>
  );
}

export function PlatformOperatorFilters({
  keyword,
  status,
  roleId,
  roles,
}: {
  keyword: string;
  status: string;
  roleId: string;
  roles: PlatformRoleOption[];
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
            placeholder="姓名或手机号"
          />
        </span>
      </label>
      <FilterSelect name="status" label="状态" value={status}>
        {platformOperatorStatusOptions.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </FilterSelect>
      <FilterSelect name="roleId" label="角色" value={roleId}>
        {roles.map((role) => (
          <SelectItem key={role.id} value={role.id}>
            {role.name || role.code}
          </SelectItem>
        ))}
      </FilterSelect>
      <Button type="submit" size="sm">
        查询人员
      </Button>
      <Button type="reset" variant="outline" size="sm" asChild>
        <a href="/platform/operators">清除筛选</a>
      </Button>
    </form>
  );
}
