"use client";

import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import { adminTabsListClassName, adminTabsTriggerWithBadgeClassName } from "@/components/admin/admin-tabs";
import { StatusAlert } from "@/components/admin/status-alert";
import { DepartmentsClientShell } from "@/components/organization/departments-client-shell";
import type {
  DepartmentRecord,
  DepartmentPostRuleConfig,
  Pagination,
} from "@/components/organization/organization-types";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type OrganizationTab = "departments";

type ListData<T> = {
  list: T[];
  pagination: Pagination;
  error: string | null;
};

const tabs = [
  {
    value: "departments" as const,
    label: "部门",
    icon: Building2,
  },
];

export function OrganizationTabs({
  activeTab,
  departments,
  departmentPostRuleConfig,
  departmentCode,
  departmentKeyword,
  errors,
}: {
  activeTab: OrganizationTab;
  departments: ListData<DepartmentRecord>;
  departmentPostRuleConfig: DepartmentPostRuleConfig & { error: string | null };
  departmentCode: string;
  departmentKeyword: string;
  errors: string[];
}) {
  const [localDepartmentPostRuleConfig, setLocalDepartmentPostRuleConfig] = useState(
    departmentPostRuleConfig,
  );
  useEffect(() => {
    setLocalDepartmentPostRuleConfig(departmentPostRuleConfig);
  }, [departmentPostRuleConfig]);
  const enabledDepartmentCodes = Array.from(new Set([
    ...localDepartmentPostRuleConfig.departments.map((item) => item.code),
    ...departments.list
      .filter((item) => item.enabled !== false && item.code)
      .map((item) => item.code as string),
  ]));

  function updateDepartmentPostConfig(config: DepartmentPostRuleConfig) {
    setLocalDepartmentPostRuleConfig((current) => ({
      ...current,
      ...config,
      error: current.error,
    }));
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <div className="shrink-0 flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground">
            <Building2 aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-normal">组织架构</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              管理部门启停、岗位配置和组织规则。当前筛选共 {departments.pagination.total} 个部门。
            </p>
          </div>
        </div>
      </div>

      {errors.length > 0 ? (
        <div className="shrink-0 space-y-2">
          {errors.map((message, index) => (
            <StatusAlert key={`${index}-${message}`}>{message}</StatusAlert>
          ))}
        </div>
      ) : null}

      <Tabs value={activeTab} className="flex min-h-0 flex-1 flex-col">
        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-none">
          <CardHeader className="shrink-0 border-b bg-card px-4 py-3">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <TabsList className={adminTabsListClassName}>
                {tabs.map((tab) => {
                  const Icon = tab.icon;

                  return (
                    <TabsTrigger
                      key={tab.value}
                      value={tab.value}
                      className={adminTabsTriggerWithBadgeClassName}
                    >
                      <Icon data-icon="inline-start" />
                      {tab.label}
                    </TabsTrigger>
                  );
                })}
              </TabsList>
              <div className="flex flex-wrap gap-2 pb-3 text-xs text-muted-foreground md:pb-0">
                <span className="tabular-nums">部门 {departments.pagination.total}</span>
                <span className="tabular-nums">已启用 {enabledDepartmentCodes.length}</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col p-0">
            <TabsContent
              value="departments"
              className="m-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
            >
              <DepartmentsClientShell
                departments={departments.list}
                departmentPostRuleConfig={localDepartmentPostRuleConfig}
                pagination={departments.pagination}
                code={departmentCode}
                keyword={departmentKeyword}
                enabledDepartmentCodes={enabledDepartmentCodes}
                onDepartmentPostRuleConfigChange={updateDepartmentPostConfig}
              />
            </TabsContent>
          </CardContent>
        </Card>
      </Tabs>
    </div>
  );
}
