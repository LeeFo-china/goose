"use client";

import { type FormEvent, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Search, X } from "lucide-react";
import { FormSelect } from "@/components/admin/form-select";
import {
  buildProjectsHref,
  workflowGroupOptions,
  workflowInstanceStatusOptions,
  workflowNodeOptionsForGroup,
  type ProjectWorkflowFiltersData,
} from "@/components/projects/project-list-filter-utils";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type Navigate = (href: string) => void;

const ownershipOptions = [
  ["", "默认可见"],
  ["self", "只看自己"],
  ["all", "全部可见"],
] as const;

const flatControlClassName = "bg-card shadow-none";

export function ProjectFilters({
  ownership,
  keyword,
  workflowGroupKey,
  workflowNodeKey,
  workflowInstanceStatus,
  workflowFilters,
  pending,
  onNavigate,
}: {
  ownership: string;
  keyword: string;
  workflowGroupKey: string;
  workflowNodeKey: string;
  workflowInstanceStatus: string;
  workflowFilters: ProjectWorkflowFiltersData;
  pending: boolean;
  onNavigate: Navigate;
}) {
  const [selectedOwnership, setSelectedOwnership] = useState(ownership);
  const [selectedKeyword, setSelectedKeyword] = useState(keyword);
  const [selectedWorkflowGroupKey, setSelectedWorkflowGroupKey] =
    useState(workflowGroupKey);
  const [selectedWorkflowNodeKey, setSelectedWorkflowNodeKey] =
    useState(workflowNodeKey);
  const [selectedWorkflowInstanceStatus, setSelectedWorkflowInstanceStatus] =
    useState(workflowInstanceStatus);
  const groupOptions = workflowGroupOptions(workflowFilters);
  const nodeOptions = workflowNodeOptionsForGroup(
    workflowFilters,
    selectedWorkflowGroupKey,
  );
  const instanceStatusOptions = workflowInstanceStatusOptions(workflowFilters);

  useEffect(() => {
    setSelectedOwnership(ownership);
    setSelectedKeyword(keyword);
    setSelectedWorkflowGroupKey(workflowGroupKey);
    setSelectedWorkflowNodeKey(workflowNodeKey);
    setSelectedWorkflowInstanceStatus(workflowInstanceStatus);
  }, [
    keyword,
    ownership,
    workflowGroupKey,
    workflowInstanceStatus,
    workflowNodeKey,
  ]);

  function applySelectFilters(input: {
    ownership?: string;
    workflowGroupKey?: string;
    workflowNodeKey?: string;
    workflowInstanceStatus?: string;
  }) {
    onNavigate(buildProjectsHref({
      ownership: input.ownership ?? ownership,
      keyword,
      workflowGroupKey: input.workflowGroupKey ?? workflowGroupKey,
      workflowNodeKey: input.workflowNodeKey ?? workflowNodeKey,
      workflowInstanceStatus: input.workflowInstanceStatus ??
        workflowInstanceStatus,
    }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onNavigate(buildProjectsHref({
      ownership: selectedOwnership,
      keyword: selectedKeyword.trim(),
      workflowGroupKey: selectedWorkflowGroupKey,
      workflowNodeKey: selectedWorkflowNodeKey,
      workflowInstanceStatus: selectedWorkflowInstanceStatus,
    }));
  }

  return (
    <form
      onSubmit={submit}
      className="grid gap-2 md:grid-cols-2 xl:grid-cols-[150px_170px_150px_150px_minmax(220px,1fr)_72px]"
    >
      <input type="hidden" name="ownership" value={selectedOwnership} />
      <input
        type="hidden"
        name="workflow_group_key"
        value={selectedWorkflowGroupKey}
      />
      <input
        type="hidden"
        name="workflow_node_key"
        value={selectedWorkflowNodeKey}
      />
      <input
        type="hidden"
        name="workflow_instance_status"
        value={selectedWorkflowInstanceStatus}
      />
      <FormSelect
        id="project-workflow-group-filter"
        value={selectedWorkflowGroupKey || "__all"}
        disabled={pending}
        triggerClassName={flatControlClassName}
        options={[
          { value: "__all", label: "全部流程阶段" },
          ...groupOptions,
        ]}
        onChange={(value) => {
          const nextWorkflowGroupKey = value === "__all" ? "" : value;
          setSelectedWorkflowGroupKey(nextWorkflowGroupKey);
          setSelectedWorkflowNodeKey("");
          applySelectFilters({
            workflowGroupKey: nextWorkflowGroupKey,
            workflowNodeKey: "",
          });
        }}
      />
      <FormSelect
        id="project-workflow-node-filter"
        value={selectedWorkflowNodeKey || "__all"}
        disabled={pending}
        triggerClassName={flatControlClassName}
        options={[
          { value: "__all", label: "全部当前节点" },
          ...nodeOptions,
        ]}
        onChange={(value) => {
          const nextWorkflowNodeKey = value === "__all" ? "" : value;
          setSelectedWorkflowNodeKey(nextWorkflowNodeKey);
          applySelectFilters({ workflowNodeKey: nextWorkflowNodeKey });
        }}
      />
      <FormSelect
        id="project-workflow-instance-status-filter"
        value={selectedWorkflowInstanceStatus || "__all"}
        disabled={pending}
        triggerClassName={flatControlClassName}
        options={[
          { value: "__all", label: "全部流程状态" },
          ...instanceStatusOptions,
        ]}
        onChange={(value) => {
          const nextWorkflowInstanceStatus = value === "__all" ? "" : value;
          setSelectedWorkflowInstanceStatus(nextWorkflowInstanceStatus);
          applySelectFilters({
            workflowInstanceStatus: nextWorkflowInstanceStatus,
          });
        }}
      />
      <FormSelect
        id="project-ownership-filter"
        value={selectedOwnership || "__default"}
        disabled={pending}
        triggerClassName={flatControlClassName}
        options={ownershipOptions.map(([value, label]) => ({
          value: value || "__default",
          label,
        }))}
        onChange={(value) => {
          const nextOwnership = value === "__default" ? "" : value;
          setSelectedOwnership(nextOwnership);
          applySelectFilters({ ownership: nextOwnership });
        }}
      />
      <InputGroup className="h-9 bg-card">
        <InputGroupAddon>
          <Search aria-hidden="true" />
        </InputGroupAddon>
        <InputGroupInput
          name="keyword"
          value={selectedKeyword}
          placeholder="搜索项目名称或地址"
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
        {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
        搜索
      </Button>
    </form>
  );
}

export function ProjectsPagination({
  pagination,
  ownership,
  keyword,
  workflowGroupKey,
  workflowNodeKey,
  workflowInstanceStatus,
  pending,
  onNavigate,
}: {
  pagination: Pagination;
  ownership: string;
  keyword: string;
  workflowGroupKey: string;
  workflowNodeKey: string;
  workflowInstanceStatus: string;
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
        onClick={() => onNavigate(buildProjectsHref({
          page: Math.max(1, pagination.page - 1),
          ownership,
          keyword,
          workflowGroupKey,
          workflowNodeKey,
          workflowInstanceStatus,
        }))}
      >
        {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <ChevronLeft data-icon="inline-start" />}
        上一页
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={nextDisabled}
        onClick={() => onNavigate(buildProjectsHref({
          page: pagination.page + 1,
          ownership,
          keyword,
          workflowGroupKey,
          workflowNodeKey,
          workflowInstanceStatus,
        }))}
      >
        下一页
        {pending ? <Loader2 className="animate-spin" data-icon="inline-end" /> : <ChevronRight data-icon="inline-end" />}
      </Button>
    </div>
  );
}
