"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Building2, Loader2 } from "lucide-react";
import { DepartmentsClientShell } from "@/components/organization/departments-client-shell";
import type {
  DepartmentRecord,
  DepartmentPostRuleConfig,
  Pagination,
} from "@/components/organization/organization-types";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

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
}: {
  activeTab: OrganizationTab;
  departments: ListData<DepartmentRecord>;
  departmentPostRuleConfig: DepartmentPostRuleConfig & { error: string | null };
  departmentCode: string;
  departmentKeyword: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
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

  function switchTab(tab: OrganizationTab) {
    if (tab === activeTab) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    startTransition(() => {
      router.push(`/organization?${params.toString()}`);
      router.refresh();
    });
  }

  return (
    <Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-none">
      <CardHeader className="shrink-0 border-b bg-card px-4 py-0">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="flex overflow-x-auto">
            {tabs.map((tab) => {
              const active = tab.value === activeTab;
              const Icon = tab.icon;

              return (
                <button
                  key={tab.value}
                  type="button"
                  className={cn(
                    "inline-flex h-11 shrink-0 items-center gap-2 border-b-2 border-transparent px-0 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-60",
                    tab.value !== tabs[0]?.value && "ml-5",
                    active && "border-primary text-foreground",
                  )}
                  disabled={pending}
                  aria-pressed={active}
                  onClick={() => switchTab(tab.value)}
                >
                  {pending && active ? (
                    <Loader2 className="animate-spin" data-icon="inline-start" />
                  ) : (
                    <Icon data-icon="inline-start" />
                  )}
                  {tab.label}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-2 pb-3 text-xs text-muted-foreground md:pb-0">
            <span className="tabular-nums">部门 {departments.pagination.total}</span>
            <span className="tabular-nums">已启用 {enabledDepartmentCodes.length}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col p-0">
        {activeTab === "departments" ? (
          <DepartmentsClientShell
            departments={departments.list}
            departmentPostRuleConfig={localDepartmentPostRuleConfig}
            pagination={departments.pagination}
            code={departmentCode}
            keyword={departmentKeyword}
            enabledDepartmentCodes={enabledDepartmentCodes}
            onDepartmentPostRuleConfigChange={updateDepartmentPostConfig}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
