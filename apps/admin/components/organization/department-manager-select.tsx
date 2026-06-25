"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { requestBackendJson } from "@/lib/backend-client";

type DepartmentManagerEmployee = {
  id: string;
  name: string | null;
  phone: string | null;
  status: string | null;
};

type EmployeeListData = {
  list: DepartmentManagerEmployee[];
};

function getEmployeeLabel(employee: DepartmentManagerEmployee | null | undefined) {
  if (!employee) return "";
  return employee.name || employee.phone || employee.id;
}

export function DepartmentManagerSelect({
  departmentId,
  disabled,
  value,
  fallbackLabel,
  onChange,
}: {
  departmentId: string;
  disabled?: boolean;
  value: string | null;
  fallbackLabel?: string | null;
  onChange: (value: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [employees, setEmployees] = useState<DepartmentManagerEmployee[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedEmployee = employees.find((employee) => employee.id === value) ||
    null;

  useEffect(() => {
    if (!open || !departmentId) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({
        page: "1",
        pageSize: "100",
        status: "active",
        tenant_department_id: departmentId,
      });
      if (keyword.trim()) params.set("keyword", keyword.trim());

      setLoading(true);
      setError(null);
      requestBackendJson<EmployeeListData>(`/employees?${params}`, {
        cache: "no-store",
        signal: controller.signal,
        fallbackMessage: "部门经理候选加载失败",
      })
        .then((data) => setEmployees(data.list || []))
        .catch((err) => {
          if (controller.signal.aborted) return;
          setEmployees([]);
          setError(err instanceof Error ? err.message : "部门经理候选加载失败");
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [departmentId, keyword, open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="h-10 justify-between font-normal"
          disabled={disabled || !departmentId}
        >
          <span className="truncate">
            {selectedEmployee
              ? getEmployeeLabel(selectedEmployee)
              : value
                ? fallbackLabel || "已选择部门经理"
                : "选择本部门员工"}
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            value={keyword}
            onValueChange={setKeyword}
            placeholder="搜索姓名或手机号"
          />
          <CommandList className="max-h-[260px]">
            <CommandEmpty>
              {loading ? "加载中..." : error || "没有匹配的本部门员工"}
            </CommandEmpty>
            <CommandGroup>
              {value ? (
                <CommandItem
                  value="clear"
                  onSelect={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                  className="cursor-pointer text-muted-foreground"
                >
                  清空部门经理
                </CommandItem>
              ) : null}
              {employees.map((employee) => (
                <CommandItem
                  key={employee.id}
                  value={`${employee.name || ""} ${employee.phone || ""}`}
                  onSelect={() => {
                    onChange(employee.id);
                    setOpen(false);
                  }}
                  className="cursor-pointer"
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">
                      {getEmployeeLabel(employee)}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {employee.phone || "本部门在职员工"}
                    </span>
                  </span>
                  {employee.id === value ? <Check className="size-4" /> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
