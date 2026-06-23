"use client";

import { type FormEvent, useEffect, useState } from "react";
import type { EmployeeStatus } from "@gooes/domain";
import { ChevronLeft, ChevronRight, Loader2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  EmployeeDepartmentOption,
  EmployeePostOption,
} from "@/components/employees/employee-mutations";
import type { RoleOption } from "@/components/employees/employee-mutation-shared";

type StatusOption = {
  label: string;
  value: "" | EmployeeStatus;
};

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type Navigate = (href: string) => void;

const ALL_SELECT_VALUE = "__all__";

function buildEmployeesHref(input: {
  page?: number;
  status?: string;
  keyword?: string;
  tenantDepartmentId?: string;
  postId?: string;
  roleId?: string;
}) {
  const params = new URLSearchParams();
  if (input.page && input.page > 1) params.set("page", String(input.page));
  if (input.status) params.set("status", input.status);
  if (input.keyword) params.set("keyword", input.keyword);
  if (input.tenantDepartmentId) {
    params.set("tenant_department_id", input.tenantDepartmentId);
  }
  if (input.postId) params.set("post_id", input.postId);
  if (input.roleId) params.set("role_id", input.roleId);
  const query = params.toString();
  return query ? `/employees?${query}` : "/employees";
}

export function EmployeesStatusFilters({
  options,
  currentStatus,
  keyword,
  tenantDepartmentId,
  postId,
  roleId,
  pending,
  onNavigate,
}: {
  options: StatusOption[];
  currentStatus: string;
  keyword: string;
  tenantDepartmentId: string;
  postId: string;
  roleId: string;
  pending: boolean;
  onNavigate: Navigate;
}) {
  return (
    <div className="flex flex-wrap gap-1 rounded-md border bg-card p-1">
      {options.map((item) => {
        const active = currentStatus === item.value;
        return (
          <Button
            key={item.value || "all"}
            type="button"
            variant={active ? "default" : "outline"}
            size="sm"
            disabled={pending}
            onClick={() => onNavigate(buildEmployeesHref({
              status: item.value,
              keyword,
              tenantDepartmentId,
              postId,
              roleId,
            }))}
            className="h-8 border-transparent px-3 shadow-none"
          >
            {pending && active ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
            {item.label}
          </Button>
        );
      })}
    </div>
  );
}

export function EmployeeSearchForm({
  status,
  keyword,
  tenantDepartmentId,
  postId,
  roleId,
  pending,
  onNavigate,
}: {
  status: string;
  keyword: string;
  tenantDepartmentId: string;
  postId: string;
  roleId: string;
  pending: boolean;
  onNavigate: Navigate;
}) {
  const [selectedKeyword, setSelectedKeyword] = useState(keyword);

  useEffect(() => {
    setSelectedKeyword(keyword);
  }, [keyword]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onNavigate(buildEmployeesHref({
      status,
      keyword: selectedKeyword.trim(),
      tenantDepartmentId,
      postId,
      roleId,
    }));
  }

  return (
    <form className="flex w-full gap-2 xl:w-[320px] 2xl:w-[360px]" onSubmit={submit}>
      <InputGroup className="h-9 flex-1 bg-card">
        <InputGroupAddon>
          <Search aria-hidden="true" />
        </InputGroupAddon>
        <InputGroupInput
          name="keyword"
          value={selectedKeyword}
          placeholder="搜索姓名或手机号"
          disabled={pending}
          onChange={(event) => setSelectedKeyword(event.target.value)}
        />
        {selectedKeyword ? (
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              aria-label="清除搜索内容"
              size="icon-xs"
              disabled={pending}
              onClick={() => setSelectedKeyword("")}
            >
              <X aria-hidden="true" />
            </InputGroupButton>
          </InputGroupAddon>
        ) : null}
      </InputGroup>
      <Button type="submit" variant="outline" disabled={pending} className="bg-card">
        {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
        搜索
      </Button>
    </form>
  );
}

export function EmployeesStructuredFilters({
  status,
  keyword,
  tenantDepartmentId,
  postId,
  roleId,
  departments,
  posts,
  roles,
  pending,
  onNavigate,
}: {
  status: string;
  keyword: string;
  tenantDepartmentId: string;
  postId: string;
  roleId: string;
  departments: EmployeeDepartmentOption[];
  posts: EmployeePostOption[];
  roles: RoleOption[];
  pending: boolean;
  onNavigate: Navigate;
}) {
  function updateFilter(next: {
    tenantDepartmentId?: string;
    postId?: string;
    roleId?: string;
  }) {
    onNavigate(buildEmployeesHref({
      status,
      keyword,
      tenantDepartmentId,
      postId,
      roleId,
      ...next,
    }));
  }

  return (
    <div className="grid gap-2 md:grid-cols-3 xl:flex xl:flex-wrap xl:items-center">
      <div className="min-w-0 xl:w-[170px] 2xl:w-[190px]">
        <Select
          value={tenantDepartmentId || ALL_SELECT_VALUE}
          disabled={pending}
          onValueChange={(value) => updateFilter({
            tenantDepartmentId: value === ALL_SELECT_VALUE ? "" : value,
          })}
        >
          <SelectTrigger aria-label="按部门筛选" className="bg-card">
            <SelectValue placeholder="全部部门" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_SELECT_VALUE}>全部部门</SelectItem>
            {departments.map((department) => {
              const value = department.tenant_department_id || department.id;
              return (
                <SelectItem key={value} value={value}>
                  {department.name}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>
      <div className="min-w-0 xl:w-[170px] 2xl:w-[190px]">
        <Select
          value={postId || ALL_SELECT_VALUE}
          disabled={pending}
          onValueChange={(value) => updateFilter({
            postId: value === ALL_SELECT_VALUE ? "" : value,
          })}
        >
          <SelectTrigger aria-label="按职位筛选" className="bg-card">
            <SelectValue placeholder="全部职位" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_SELECT_VALUE}>全部职位</SelectItem>
            {posts.map((post) => (
              <SelectItem key={post.id} value={post.id}>
                {post.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="min-w-0 xl:w-[170px] 2xl:w-[190px]">
        <Select
          value={roleId || ALL_SELECT_VALUE}
          disabled={pending}
          onValueChange={(value) => updateFilter({
            roleId: value === ALL_SELECT_VALUE ? "" : value,
          })}
        >
          <SelectTrigger aria-label="按角色筛选" className="bg-card">
            <SelectValue placeholder="全部角色" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_SELECT_VALUE}>全部角色</SelectItem>
            {roles.map((role) => (
              <SelectItem key={role.id} value={role.id}>
                {role.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

export function EmployeesPagination({
  pagination,
  status,
  keyword,
  tenantDepartmentId,
  postId,
  roleId,
  pending,
  onNavigate,
}: {
  pagination: Pagination;
  status: string;
  keyword: string;
  tenantDepartmentId: string;
  postId: string;
  roleId: string;
  pending: boolean;
  onNavigate: Navigate;
}) {
  const previousDisabled = pagination.page <= 1 || pending;
  const nextDisabled = pagination.page >= pagination.totalPages || pending;

  return (
    <div className="flex gap-2">
      <Button
        type="button"
        variant="outline"
        disabled={previousDisabled}
        onClick={() => onNavigate(buildEmployeesHref({
          page: Math.max(1, pagination.page - 1),
          status,
          keyword,
          tenantDepartmentId,
          postId,
          roleId,
        }))}
      >
        {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <ChevronLeft data-icon="inline-start" />}
        上一页
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={nextDisabled}
        onClick={() => onNavigate(buildEmployeesHref({
          page: pagination.page + 1,
          status,
          keyword,
          tenantDepartmentId,
          postId,
          roleId,
        }))}
      >
        下一页
        {pending ? <Loader2 className="animate-spin" data-icon="inline-end" /> : <ChevronRight data-icon="inline-end" />}
      </Button>
    </div>
  );
}
