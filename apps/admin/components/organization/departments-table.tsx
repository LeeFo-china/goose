"use client";

import { useMemo, useState } from "react";
import {
  DepartmentConfig,
  type DepartmentCode,
} from "@gooes/domain";
import { BriefcaseBusiness, ChevronRight, FolderTree } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { DepartmentPostAliasDialog } from "@/components/organization/department-post-alias-dialog";
import { DepartmentPostConfigDialog } from "@/components/organization/department-post-config-dialog";
import { DepartmentRowActions } from "@/components/organization/department-mutations";
import type {
  DepartmentPostRuleConfig,
  DepartmentPostRulePostOption,
  DepartmentRecord,
} from "@/components/organization/organization-types";
import { cn } from "@/lib/utils";

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function getDepartmentLabel(code: string | null) {
  if (!code) return null;
  return DepartmentConfig[code as DepartmentCode]?.label || code;
}

type DepartmentPostView = DepartmentPostRulePostOption & {
  alias_name?: string | null;
  missing?: boolean;
};

function buildPostMap(posts: DepartmentPostRulePostOption[]) {
  return new Map(posts.map((post) => [post.code, post]));
}

function getDepartmentPosts(
  department: DepartmentRecord,
  config: DepartmentPostRuleConfig,
  postMap: Map<string, DepartmentPostRulePostOption>,
): DepartmentPostView[] {
  const ruleDepartment = config.departments.find((item) =>
    (department.tenant_department_id &&
      item.tenant_department_id === department.tenant_department_id) ||
    (department.code && item.code === department.code)
  );
  const rules = ruleDepartment?.rules || [];
  const ruleMap = new Map(rules.map((rule) => [rule.post_code, rule]));
  const codes = ruleDepartment?.selected_post_codes || [];

  return codes.map((code) => {
    const post = postMap.get(code);
    const rule = ruleMap.get(code);
    if (post) {
      return {
        ...post,
        alias_name: rule?.alias_name || null,
      };
    }
    return {
      id: code,
      code,
      name: code,
      alias_name: rule?.alias_name || null,
      sort: null,
      status: null,
      missing: true,
    };
  });
}

export function DepartmentsTable({
  departments,
  departmentPostRuleConfig,
  onDepartmentDisabled,
  onDepartmentPostsSaved,
}: {
  departments: DepartmentRecord[];
  departmentPostRuleConfig: DepartmentPostRuleConfig;
  onDepartmentDisabled?: (code: string) => void;
  onDepartmentPostsSaved?: (config: DepartmentPostRuleConfig) => void;
}) {
  const [openCode, setOpenCode] = useState<string | null>(null);
  const postMap = useMemo(
    () => buildPostMap(departmentPostRuleConfig.post_options),
    [departmentPostRuleConfig.post_options],
  );

  function toggle(code: string) {
    setOpenCode((current) => (current === code ? null : code));
  }

  if (departments.length === 0) {
    return (
      <div className="border-t px-4 py-8">
        <Empty className="border-0 p-4">
          <EmptyHeader>
            <EmptyTitle>暂无数据</EmptyTitle>
            <EmptyDescription>没有符合条件的部门</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <div className="border-t">
      <div className="hidden grid-cols-[minmax(280px,1fr)_120px_120px_140px_190px] items-center gap-3 bg-muted/60 px-4 py-2 text-sm font-medium text-muted-foreground lg:grid">
        <div>部门</div>
        <div>状态</div>
        <div>关联岗位</div>
        <div>创建时间</div>
        <div className="text-right">操作</div>
      </div>
      <div className="divide-y">
        {departments.map((department) => {
          const code = department.code || department.id;
          const label = department.template_name || getDepartmentLabel(department.code);
          const posts = getDepartmentPosts(department, departmentPostRuleConfig, postMap);
          const open = openCode === code;

          return (
            <Collapsible key={department.id} open={open} onOpenChange={() => toggle(code)}>
              <div className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(280px,1fr)_120px_120px_140px_190px] lg:items-center">
                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-auto min-w-0 justify-start gap-3 px-0 text-left hover:bg-transparent"
                    aria-label={`${open ? "收起" : "展开"}${department.name}岗位`}
                  >
                    <ChevronRight
                      className={cn("transition-transform", open ? "rotate-90" : "")}
                      data-icon="inline-start"
                    />
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                        <FolderTree aria-hidden="true" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{department.name}</span>
                        {label ? (
                          <span className="block truncate text-xs text-muted-foreground">
                            标准部门：{label}
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </Button>
                </CollapsibleTrigger>
                <div>
                  <Badge variant={department.enabled === false ? "secondary" : "success"}>
                    {department.enabled === false ? "已停用" : "已启用"}
                  </Badge>
                </div>
                <div className="text-sm text-muted-foreground">
                  {posts.length} 个岗位
                </div>
                <div className="text-sm text-muted-foreground">
                  {formatDate(department.created_at)}
                </div>
                <div className="flex flex-nowrap items-center justify-start gap-1 whitespace-nowrap lg:justify-end">
                  <DepartmentPostConfigDialog
                    department={department}
                    departmentPostRuleConfig={departmentPostRuleConfig}
                    onSaved={onDepartmentPostsSaved}
                  />
                  <DepartmentRowActions
                    department={department}
                    onDisabled={onDepartmentDisabled}
                  />
                </div>
              </div>
              <CollapsibleContent>
                <div className="bg-muted/20 px-4 pb-4 lg:pl-16">
                  {posts.length > 0 ? (
                    <div className="flex flex-col gap-2">
                      {posts.map((post) => (
                        <div
                          key={`${department.id}-${post.code}`}
                          className="flex min-w-0 items-center gap-3 rounded-md border bg-background px-3 py-2"
                        >
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                            <BriefcaseBusiness aria-hidden="true" />
                          </span>
                          <span className="flex min-w-0 flex-1 items-center gap-2">
                            <span className="truncate text-sm font-medium">
                              {post.alias_name || post.name}
                            </span>
                            {post.status === 0 ? <Badge variant="outline">停用</Badge> : null}
                            {post.missing ? <Badge variant="danger">缺失</Badge> : null}
                          </span>
                          {department.code ? (
                            <DepartmentPostAliasDialog
                              departmentCode={department.code}
                              departmentName={department.name}
                              postCode={post.code}
                              postName={post.name}
                              aliasName={post.alias_name}
                              onSaved={onDepartmentPostsSaved}
                            />
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-md border bg-background px-3 py-6 text-center text-sm text-muted-foreground">
                      请先配置岗位
                    </div>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
}
