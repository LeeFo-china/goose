"use client";

import { useEffect, useState } from "react";
import type {
  ProjectOperationalRiskSeverity,
  ProjectOperationalRiskType,
} from "@gooes/domain";
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
  getProjectOperationalRiskTypeLabel,
} from "@/components/project-health/project-health-display";
import type { ProjectHealthQueryState } from "@/components/project-health/project-health-query";

const RISK_TYPES: ProjectOperationalRiskType[] = [
  "workflow_task_overdue",
  "procedure_overdue",
  "missing_project_log",
  "acceptance_rework",
  "service_ticket",
];

export function ProjectHealthFilters({
  filters,
  disabled,
  onSubmit,
  onReset,
}: {
  filters: ProjectHealthQueryState;
  disabled?: boolean;
  onSubmit: (filters: ProjectHealthQueryState) => void;
  onReset: () => void;
}) {
  const [keyword, setKeyword] = useState(filters.keyword ?? "");
  const [severity, setSeverity] = useState(filters.severity || "all");
  const [riskType, setRiskType] = useState(filters.riskType || "all");

  useEffect(() => {
    setKeyword(filters.keyword ?? "");
    setSeverity(filters.severity || "all");
    setRiskType(filters.riskType || "all");
  }, [filters.keyword, filters.riskType, filters.severity]);

  return (
    <form
      className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_160px_180px_auto_auto]"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({
          keyword,
          severity: severity === "all" ? "" : severity as ProjectOperationalRiskSeverity,
          riskType: riskType === "all" ? "" : riskType as ProjectOperationalRiskType,
        });
      }}
    >
      <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
        <span>项目关键词</span>
        <Input
          value={keyword}
          disabled={disabled}
          placeholder="项目名称或完整项目 ID"
          className="h-10"
          onChange={(event) => setKeyword(event.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        <span>严重度</span>
        <Select value={severity} disabled={disabled} onValueChange={setSeverity}>
          <SelectTrigger className="h-10">
            <SelectValue placeholder="全部" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="all">全部</SelectItem>
              <SelectItem value="danger">严重</SelectItem>
              <SelectItem value="warning">预警</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        <span>风险类型</span>
        <Select value={riskType} disabled={disabled} onValueChange={setRiskType}>
          <SelectTrigger className="h-10">
            <SelectValue placeholder="全部" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="all">全部</SelectItem>
              {RISK_TYPES.map((item) => (
                <SelectItem key={item} value={item}>
                  {getProjectOperationalRiskTypeLabel(item)}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </label>
      <div className="flex items-end">
        <Button type="submit" disabled={disabled} className="min-h-11 w-full md:min-h-10">
          查询
        </Button>
      </div>
      <div className="flex items-end">
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className="min-h-11 w-full md:min-h-10"
          onClick={() => {
            setKeyword("");
            setSeverity("all");
            setRiskType("all");
            onReset();
          }}
        >
          重置
        </Button>
      </div>
    </form>
  );
}
