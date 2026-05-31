"use client";

import { ChevronLeft, ChevronRight, Loader2, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { MarketingProjectOption } from "@/components/marketing/marketing-types";
import { projectHint } from "@/components/marketing/marketing-mutation-shared";

export function MarketingProjectSelector({
  targetScopeType,
  projectIds,
  projectKeyword,
  projectLoading,
  projectError,
  projectOptions,
  projectPagination,
  canGoPrevProjectPage,
  canGoNextProjectPage,
  setProjectKeyword,
  setProjectPage,
  setProjectReloadKey,
  toggleProject,
}: {
  targetScopeType: string;
  projectIds: string[];
  projectKeyword: string;
  projectLoading: boolean;
  projectError: string;
  projectOptions: MarketingProjectOption[];
  projectPagination: { page: number; pageSize: number; total: number; totalPages: number; };
  canGoPrevProjectPage: boolean;
  canGoNextProjectPage: boolean;
  setProjectKeyword: (value: string) => void;
  setProjectPage: (updater: number | ((page: number) => number)) => void;
  setProjectReloadKey: (updater: (value: number) => number) => void;
  toggleProject: (projectId: string, checked: boolean) => void;
}) {
  return (
    <Field>
      <div className="flex items-center justify-between gap-3">
        <FieldLabel>
          {targetScopeType === "project_list" ? "包含项目" : "排除项目"}
        </FieldLabel>
        <Badge variant="outline">已选 {projectIds.length}</Badge>
      </div>
      <div className="rounded-md border bg-muted/20 p-3">
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="搜索项目名称、小区或地址"
            value={projectKeyword}
            onChange={(event) => {
              setProjectKeyword(event.target.value);
              setProjectPage(1);
            }}
          />
        </div>
        <div className="min-h-40">
          {projectLoading ? (
            <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" />
              项目加载中
            </div>
          ) : projectError ? (
            <div className="flex min-h-40 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
              <span>{projectError}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setProjectPage(1);
                  setProjectReloadKey((value) => value + 1);
                }}
              >
                重新加载
              </Button>
            </div>
          ) : projectOptions.length ? (
            <div className="grid gap-2 md:grid-cols-2">
              {projectOptions.map((project) => (
                <label
                  key={project.id}
                  className="flex min-w-0 items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-background"
                >
                  <Checkbox
                    className="mt-1"
                    checked={projectIds.includes(project.id)}
                    onCheckedChange={(value) => toggleProject(project.id, value === true)}
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {project.name || project.id}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {projectHint(project) || "无项目备注"}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          ) : (
            <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">
              暂无匹配项目
            </div>
          )}
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 border-t pt-3 text-xs text-muted-foreground">
          <span>
            第 {projectPagination.page || 1} / {Math.max(projectPagination.totalPages || 0, 1)} 页，共 {projectPagination.total} 个
          </span>
          <span className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-8"
              disabled={!canGoPrevProjectPage}
              onClick={() => setProjectPage((page) => Math.max(1, page - 1))}
              aria-label="上一页项目"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-8"
              disabled={!canGoNextProjectPage}
              onClick={() => setProjectPage((page) => page + 1)}
              aria-label="下一页项目"
            >
              <ChevronRight className="size-4" />
            </Button>
          </span>
        </div>
      </div>
      <FieldDescription>
        全部项目模式下勾选的是排除项目；指定项目模式下勾选的是可参与项目。
      </FieldDescription>
    </Field>
  );
}
