"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type {
  WorkflowApprovalNodeConfig,
  WorkflowEmployeeOption,
} from "@/components/workflows/workflow-types";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { requestBackendJson } from "@/lib/backend-client";

type WorkflowRoleOption = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: string | null;
};

type EmployeeListData = {
  list: WorkflowEmployeeOption[];
};

type RoleListData = {
  list: WorkflowRoleOption[];
};

type AssigneeRule = NonNullable<WorkflowApprovalNodeConfig["assignee_rule"]>;

function getEmployeeLabel(employee: WorkflowEmployeeOption | null | undefined) {
  if (!employee) return "";
  return employee.name || employee.phone || employee.id;
}

function getEmployeeMeta(employee: WorkflowEmployeeOption) {
  return [
    employee.department_name,
    employee.post_name,
    employee.phone,
  ].filter(Boolean).join(" · ");
}

function getRoleLabel(role: WorkflowRoleOption | null | undefined) {
  if (!role) return "";
  return role.name || role.code;
}

function getRoleMeta(role: WorkflowRoleOption) {
  return [role.code, role.description].filter(Boolean).join(" · ");
}

export function WorkflowApprovalAssigneeSelect({
  disabled,
  rule,
  value,
  onChange,
}: {
  disabled?: boolean;
  rule: AssigneeRule;
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  if (rule === "department") {
    return (
      <div className="grid gap-2">
        <Label>审批对象</Label>
        <Button
          type="button"
          variant="outline"
          className="h-10 justify-start font-normal text-muted-foreground"
          disabled
        >
          部门审批对象暂未接入待办分配
        </Button>
        <p className="text-xs text-muted-foreground">
          请改用指定员工或指定角色，避免保存后无法派发待办。
        </p>
      </div>
    );
  }

  if (rule === "applicant_department_manager") {
    return (
      <div className="grid gap-2">
        <Label>审批对象</Label>
        <Button
          type="button"
          variant="outline"
          className="h-10 justify-start font-normal text-muted-foreground"
          disabled
        >
          提交后自动派给申请人所属部门的经理
        </Button>
      </div>
    );
  }

  if (rule === "role") {
    return (
      <RoleAssigneeSelect
        disabled={disabled}
        value={value}
        onChange={onChange}
      />
    );
  }

  return (
    <EmployeeAssigneeSelect
      disabled={disabled}
      value={value}
      onChange={onChange}
    />
  );
}

function EmployeeAssigneeSelect({
  disabled,
  value,
  onChange,
}: {
  disabled?: boolean;
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [employees, setEmployees] = useState<WorkflowEmployeeOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedEmployee = employees.find((employee) => employee.id === value) ||
    null;

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
      requestBackendJson<EmployeeListData>(`/employees?${params}`, {
        cache: "no-store",
        signal: controller.signal,
        fallbackMessage: "员工加载失败",
      })
        .then((data) => setEmployees(data.list || []))
        .catch((err) => {
          if (controller.signal.aborted) return;
          setEmployees([]);
          setError(err instanceof Error ? err.message : "员工加载失败");
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [keyword, open]);

  return (
    <div className="grid gap-2">
      <Label>审批对象</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="h-10 justify-between font-normal"
            disabled={disabled}
          >
            <span className="truncate">
              {selectedEmployee
                ? getEmployeeLabel(selectedEmployee)
                : value
                  ? "已选择员工"
                  : "选择员工"}
            </span>
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              value={keyword}
              onValueChange={setKeyword}
              placeholder="搜索员工姓名或手机号"
            />
            <CommandList className="max-h-[260px]">
              <CommandEmpty>
                {loading ? "加载中..." : error || "没有匹配的员工"}
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
                    清空审批对象
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
                        {getEmployeeMeta(employee) || "在职员工"}
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
    </div>
  );
}

function RoleAssigneeSelect({
  disabled,
  value,
  onChange,
}: {
  disabled?: boolean;
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [roles, setRoles] = useState<WorkflowRoleOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedRole = useMemo(
    () => roles.find((role) => role.code === value) || null,
    [roles, value],
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
      requestBackendJson<RoleListData>(`/roles?${params}`, {
        cache: "no-store",
        signal: controller.signal,
        fallbackMessage: "角色加载失败",
      })
        .then((data) => setRoles(data.list || []))
        .catch((err) => {
          if (controller.signal.aborted) return;
          setRoles([]);
          setError(err instanceof Error ? err.message : "角色加载失败");
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [keyword, open]);

  return (
    <div className="grid gap-2">
      <Label>审批对象</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="h-10 justify-between font-normal"
            disabled={disabled}
          >
            <span className="truncate">
              {selectedRole
                ? getRoleLabel(selectedRole)
                : value
                  ? value
                  : "选择角色"}
            </span>
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              value={keyword}
              onValueChange={setKeyword}
              placeholder="搜索角色名称或编码"
            />
            <CommandList className="max-h-[260px]">
              <CommandEmpty>
                {loading ? "加载中..." : error || "没有匹配的角色"}
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
                    清空审批对象
                  </CommandItem>
                ) : null}
                {roles.map((role) => (
                  <CommandItem
                    key={role.id}
                    value={`${role.name || ""} ${role.code || ""}`}
                    onSelect={() => {
                      onChange(role.code);
                      setOpen(false);
                    }}
                    className="cursor-pointer"
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium">
                        {getRoleLabel(role)}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {getRoleMeta(role) || "角色编码未填写"}
                      </span>
                    </span>
                    {role.code === value ? <Check className="size-4" /> : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
