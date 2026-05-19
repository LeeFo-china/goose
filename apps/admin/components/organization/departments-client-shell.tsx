"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import {
  DepartmentFilters,
  DepartmentPageSizeSelect,
  DepartmentsPagination,
} from "@/components/organization/department-list-actions";
import { EnableDepartmentButton } from "@/components/organization/department-mutations";
import { DepartmentsTable } from "@/components/organization/departments-table";
import type {
  DepartmentRecord,
  DepartmentPostRuleConfig,
  Pagination,
} from "@/components/organization/organization-types";
import { Badge } from "@/components/ui/badge";

export function DepartmentsClientShell({
  departments,
  departmentPostRuleConfig,
  pagination,
  code,
  keyword,
  enabledDepartmentCodes,
  error,
  onDepartmentDisabled,
  onDepartmentsEnabled,
  onDepartmentPostRuleConfigChange,
}: {
  departments: DepartmentRecord[];
  departmentPostRuleConfig: DepartmentPostRuleConfig;
  pagination: Pagination;
  code: string;
  keyword: string;
  enabledDepartmentCodes: string[];
  error: string | null;
  onDepartmentDisabled?: (code: string) => void;
  onDepartmentsEnabled?: (codes: string[]) => void;
  onDepartmentPostRuleConfigChange?: (config: DepartmentPostRuleConfig) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [locallyDisabledCodes, setLocallyDisabledCodes] = useState<string[]>([]);
  const [locallyEnabledCodes, setLocallyEnabledCodes] = useState<string[]>([]);
  const [ruleConfig, setRuleConfig] = useState(departmentPostRuleConfig);
  const syncedEnabledDepartmentCodes = useMemo(() => {
    const disabledSet = new Set(locallyDisabledCodes);
    return Array.from(new Set([
      ...enabledDepartmentCodes,
      ...locallyEnabledCodes,
    ])).filter((item) => !disabledSet.has(item));
  }, [enabledDepartmentCodes, locallyDisabledCodes, locallyEnabledCodes]);

  useEffect(() => {
    setRuleConfig(departmentPostRuleConfig);
  }, [departmentPostRuleConfig]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/backend/department-post-rules", {
      signal: controller.signal,
      cache: "no-store",
    })
      .then((response) => response.json())
      .then((payload) => {
        if (payload?.success !== false && payload?.data) {
          setRuleConfig(payload.data);
        }
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
      });

    return () => controller.abort();
  }, []);

  function navigate(href: string) {
    startTransition(() => {
      router.push(href);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col">
      {error ? (
        <div className="border-t px-4 pt-4">
          <StatusAlert>{error}</StatusAlert>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 border-t px-4 py-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <DepartmentFilters
            code={code}
            keyword={keyword}
            pageSize={pagination.pageSize}
            pending={pending}
            onNavigate={navigate}
          />
          <EnableDepartmentButton
            enabledDepartmentCodes={syncedEnabledDepartmentCodes}
            onEnabled={(codes) => {
              setLocallyEnabledCodes((current) => Array.from(new Set([...current, ...codes])));
              setLocallyDisabledCodes((current) =>
                current.filter((item) => !codes.includes(item))
              );
              onDepartmentsEnabled?.(codes);
            }}
          />
        </div>
      </div>
      <div className="relative flex flex-col gap-4">
        <DepartmentsTable
          departments={departments}
          departmentPostRuleConfig={ruleConfig}
          onDepartmentPostsSaved={(config) => {
            setRuleConfig(config);
            onDepartmentPostRuleConfigChange?.(config);
          }}
          onDepartmentDisabled={(disabledCode) => {
            setLocallyDisabledCodes((current) =>
              current.includes(disabledCode) ? current : [...current, disabledCode]
            );
            setLocallyEnabledCodes((current) =>
              current.filter((item) => item !== disabledCode)
            );
            onDepartmentDisabled?.(disabledCode);
          }}
        />
        {pending ? (
          <div className="pointer-events-none absolute inset-0 flex items-start justify-center bg-background/65 pt-8 backdrop-blur-[1px]">
            <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground">
              <Loader2 className="animate-spin" data-icon="inline-start" />
              正在更新列表
            </div>
          </div>
        ) : null}
        <div className="flex flex-col gap-3 px-4 pb-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>每页</span>
            <DepartmentPageSizeSelect
              pagination={pagination}
              code={code}
              keyword={keyword}
              pending={pending}
              onNavigate={navigate}
            />
            <span>
              共 {pagination.total} 条，第 {pagination.page} / {Math.max(pagination.totalPages, 1)} 页
            </span>
            {pending ? (
              <Badge variant="secondary">
                <Loader2 className="animate-spin" data-icon="inline-start" />
                正在更新
              </Badge>
            ) : null}
          </div>
          <DepartmentsPagination
            pagination={pagination}
            code={code}
            keyword={keyword}
            pending={pending}
            onNavigate={navigate}
          />
        </div>
      </div>
    </div>
  );
}
