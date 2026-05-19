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
import { Button } from "@/components/ui/button";
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
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    startTransition(() => {
      router.push(`/organization?${params.toString()}`);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex gap-2 overflow-x-auto">
          {tabs.map((tab) => {
            const active = tab.value === activeTab;
            const Icon = tab.icon;

            return (
              <Button
                key={tab.value}
                type="button"
                variant={active ? "default" : "ghost"}
                className={cn(
                  "h-9 shrink-0 gap-2 px-3",
                  active ? "" : "text-muted-foreground",
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
              </Button>
            );
          })}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {activeTab === "departments" ? (
          <DepartmentsClientShell
            departments={departments.list}
            departmentPostRuleConfig={localDepartmentPostRuleConfig}
            pagination={departments.pagination}
            code={departmentCode}
            keyword={departmentKeyword}
            enabledDepartmentCodes={enabledDepartmentCodes}
            error={departments.error}
            onDepartmentPostRuleConfigChange={updateDepartmentPostConfig}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
