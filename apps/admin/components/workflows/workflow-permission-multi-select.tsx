"use client";

import { Check, ChevronsUpDown, Loader2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PermissionCodeConfig, isPermissionCode } from "@gooes/domain";
import type { PermissionRecord } from "@/components/permissions/permission-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { requestBackendJson } from "@/lib/backend-client";
import { cn } from "@/lib/utils";

type PermissionListData = {
  list: PermissionRecord[];
};

export function getWorkflowPermissionLabel(code: string) {
  if (isPermissionCode(code)) {
    return PermissionCodeConfig[code].label;
  }
  return code;
}

export function WorkflowPermissionMultiSelect({
  disabled,
  value,
  onChange,
}: {
  disabled?: boolean;
  value: string[];
  onChange: (value: string[] | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [permissions, setPermissions] = useState<PermissionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedCodes = useMemo(() => new Set(value), [value]);
  const selectedPermissions = permissions.filter((permission) =>
    selectedCodes.has(permission.code)
  );
  const missingSelectedCodes = value.filter((code) =>
    !permissions.some((permission) => permission.code === code)
  );
  const filteredPermissions = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    if (!normalizedKeyword) return permissions;
    return permissions.filter((permission) =>
      [
        permission.code,
        permission.name,
        permission.module,
        permission.resource,
        permission.action,
        permission.description,
      ].some((item) => item?.toLowerCase().includes(normalizedKeyword))
    );
  }, [keyword, permissions]);
  const groupedPermissions = useMemo(
    () => groupPermissionsByModule(filteredPermissions),
    [filteredPermissions],
  );

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({
        page: "1",
        pageSize: "100",
        status: "active",
      });
      if (keyword.trim()) params.set("keyword", keyword.trim());

      setLoading(true);
      setError(null);
      requestBackendJson<PermissionListData>(`/permissions?${params}`, {
        cache: "no-store",
        signal: controller.signal,
        fallbackMessage: "权限点加载失败",
      })
        .then((data) => setPermissions(data.list || []))
        .catch((err) => {
          if (controller.signal.aborted) return;
          setError(err instanceof Error ? err.message : "权限点加载失败");
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 200);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [keyword, open]);

  function emit(nextCodes: string[]) {
    const dedupedCodes = Array.from(new Set(nextCodes)).filter(Boolean);
    onChange(dedupedCodes.length > 0 ? dedupedCodes : undefined);
  }

  function togglePermission(code: string, checked: boolean) {
    if (checked) {
      emit([...value, code]);
      return;
    }
    emit(value.filter((item) => item !== code));
  }

  function removePermission(code: string) {
    emit(value.filter((item) => item !== code));
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          aria-label="所需权限"
          className="min-h-10 w-full justify-between px-3 font-normal"
        >
          <span className="flex min-w-0 flex-1 flex-wrap gap-1.5">
            {value.length === 0 ? (
              <span className="text-muted-foreground">选择权限点</span>
            ) : (
              <SelectedPermissionSummary
                permissions={selectedPermissions}
                missingCodes={missingSelectedCodes}
              />
            )}
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <div className="border-b p-2">
          <Input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索权限名称或编码"
            className="h-9"
          />
        </div>
        <div className="max-h-[320px] overflow-y-auto">
          {loading ? (
            <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" />
              正在加载权限点
            </div>
          ) : null}
          {!loading && error ? (
            <div className="px-3 py-6 text-center text-sm text-destructive">
              {error}
            </div>
          ) : null}
          {!loading && !error && groupedPermissions.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              没有匹配的权限点
            </div>
          ) : null}
          {!loading && !error ? (
            <div className="divide-y">
              {groupedPermissions.map(([module, items]) => (
                <div key={module}>
                  <div className="sticky top-0 z-10 flex items-center justify-between bg-muted px-3 py-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      {module}
                    </span>
                    <Badge variant="outline">{items.length} 项</Badge>
                  </div>
                  <div>
                    {items.map((permission) => {
                      const checked = selectedCodes.has(permission.code);
                      return (
                        <label
                          key={permission.id}
                          className={cn(
                            "flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-muted/60",
                            checked ? "bg-accent/40" : "",
                          )}
                        >
                          <Checkbox
                            checked={checked}
                            disabled={disabled}
                            className="mt-1"
                            onCheckedChange={(nextChecked) =>
                              togglePermission(permission.code, nextChecked === true)
                            }
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span className="truncate text-sm font-medium">
                                {permission.name || permission.description ||
                                  permission.code}
                              </span>
                              {checked ? <Check className="size-3.5 shrink-0" /> : null}
                            </span>
                            <span className="mt-0.5 block break-all text-xs text-muted-foreground">
                              {permission.code}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
        {value.length > 0 ? (
          <div className="flex items-center justify-between border-t px-3 py-2">
            <span className="text-xs text-muted-foreground">
              已选择 {value.length} 项
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() => emit([])}
            >
              清空
            </Button>
          </div>
        ) : null}
        {value.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 border-t p-2">
            {[...selectedPermissions.map((permission) => permission.code), ...missingSelectedCodes]
              .map((code) => (
                <Badge key={code} variant="secondary" className="gap-1">
                  <span className="max-w-[180px] truncate">
                    {getWorkflowPermissionLabel(code)}
                  </span>
                  <button
                    type="button"
                    className="rounded-sm hover:bg-background/80"
                    disabled={disabled}
                    onClick={() => removePermission(code)}
                    aria-label={`移除权限 ${getWorkflowPermissionLabel(code)}`}
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function SelectedPermissionSummary({
  permissions,
  missingCodes,
}: {
  permissions: PermissionRecord[];
  missingCodes: string[];
}) {
  const labels = [
    ...permissions.map((permission) => permission.name || permission.code),
    ...missingCodes.map(getWorkflowPermissionLabel),
  ];
  const visibleLabels = labels.slice(0, 2);
  const hiddenCount = Math.max(labels.length - visibleLabels.length, 0);

  return (
    <>
      {visibleLabels.map((label) => (
        <Badge key={label} variant="secondary" className="max-w-[160px] truncate">
          {label}
        </Badge>
      ))}
      {hiddenCount > 0 ? (
        <Badge variant="outline">已选 {labels.length} 项</Badge>
      ) : null}
    </>
  );
}

function groupPermissionsByModule(permissions: PermissionRecord[]) {
  const groups = new Map<string, PermissionRecord[]>();
  for (const permission of permissions) {
    const moduleName = permission.module || "未分组";
    const items = groups.get(moduleName) || [];
    items.push(permission);
    groups.set(moduleName, items);
  }
  return Array.from(groups.entries());
}
