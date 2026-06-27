"use client";

import { type FormEvent, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { FormSelect } from "@/components/admin/form-select";
import { buildWorkflowsHref } from "@/components/workflows/workflow-list-filter-utils";
import { WorkflowCreateDialog } from "@/components/workflows/workflow-create-dialog";
import {
  workflowCategoryOptions,
  workflowStatusOptions,
} from "@/components/workflows/workflow-labels";
import { WorkflowTemplateActions } from "@/components/workflows/workflow-template-actions";
import type {
  WorkflowDefinition,
  WorkflowPagination as WorkflowPaginationMeta,
} from "@/components/workflows/workflow-types";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";

type Navigate = (href: string) => void;

const flatControlClassName = "bg-card shadow-none";

export function WorkflowFilters({
  status,
  category,
  keyword,
  pageSize,
  pending,
  onNavigate,
  onCreated,
}: {
  status: string;
  category: string;
  keyword: string;
  pageSize: number;
  pending: boolean;
  onNavigate: Navigate;
  onCreated: (workflow: WorkflowDefinition) => void;
}) {
  const [selectedStatus, setSelectedStatus] = useState(status);
  const [selectedCategory, setSelectedCategory] = useState(category);
  const [selectedKeyword, setSelectedKeyword] = useState(keyword);

  useEffect(() => {
    setSelectedStatus(status);
    setSelectedCategory(category);
    setSelectedKeyword(keyword);
  }, [category, keyword, status]);

  function applySelectFilters(input: {
    status?: string;
    category?: string;
  }) {
    onNavigate(buildWorkflowsHref({
      pageSize,
      status: input.status ?? status,
      category: input.category ?? category,
      keyword,
    }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onNavigate(buildWorkflowsHref({
      pageSize,
      status: selectedStatus,
      category: selectedCategory,
      keyword: selectedKeyword.trim(),
    }));
  }

  return (
    <form
      onSubmit={submit}
      className="grid gap-2 md:grid-cols-2 xl:grid-cols-[150px_160px_minmax(260px,1fr)_72px_auto]"
    >
      <input type="hidden" name="status" value={selectedStatus} />
      <input type="hidden" name="category" value={selectedCategory} />
      <Label className="sr-only" htmlFor="workflow-status-filter">
        流程状态
      </Label>
      <FormSelect
        id="workflow-status-filter"
        value={selectedStatus || "__all"}
        disabled={pending}
        triggerClassName={flatControlClassName}
        options={workflowStatusOptions.map(([value, label]) => ({
          value: value || "__all",
          label,
        }))}
        onChange={(value) => {
          const nextStatus = value === "__all" ? "" : value;
          setSelectedStatus(nextStatus);
          applySelectFilters({ status: nextStatus });
        }}
      />
      <Label className="sr-only" htmlFor="workflow-category-filter">
        流程分类
      </Label>
      <FormSelect
        id="workflow-category-filter"
        value={selectedCategory || "__all"}
        disabled={pending}
        triggerClassName={flatControlClassName}
        options={workflowCategoryOptions.map(([value, label]) => ({
          value: value || "__all",
          label,
        }))}
        onChange={(value) => {
          const nextCategory = value === "__all" ? "" : value;
          setSelectedCategory(nextCategory);
          applySelectFilters({ category: nextCategory });
        }}
      />
      <InputGroup className="h-9 bg-card">
        <InputGroupAddon>
          <Search aria-hidden="true" />
        </InputGroupAddon>
        <InputGroupInput
          aria-label="搜索流程"
          name="keyword"
          value={selectedKeyword}
          placeholder="搜索流程名称、编码或说明"
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
      <Button type="submit" variant="outline" disabled={pending} className="w-full bg-card">
        搜索
      </Button>
      <div className="flex flex-wrap gap-2 xl:justify-end">
        <WorkflowTemplateActions disabled={pending} onCreated={onCreated} />
        <WorkflowCreateDialog disabled={pending} onCreated={onCreated} />
      </div>
    </form>
  );
}

export function WorkflowPagination({
  pagination,
  status,
  category,
  keyword,
  pageSize,
  pending,
  onNavigate,
}: {
  pagination: WorkflowPaginationMeta;
  status: string;
  category: string;
  keyword: string;
  pageSize: number;
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
        onClick={() => onNavigate(buildWorkflowsHref({
          page: Math.max(1, pagination.page - 1),
          pageSize,
          status,
          category,
          keyword,
        }))}
      >
        <ChevronLeft data-icon="inline-start" />
        上一页
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={nextDisabled}
        onClick={() => onNavigate(buildWorkflowsHref({
          page: pagination.page + 1,
          pageSize,
          status,
          category,
          keyword,
        }))}
      >
        下一页
        <ChevronRight data-icon="inline-end" />
      </Button>
    </div>
  );
}
