"use client";

import { PaymentTypeConfig } from "@gooes/domain";
import { Check, ChevronsUpDown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { requestBackendJson } from "@/lib/backend-client";
import type {
  WorkflowEmployeeOption,
  WorkflowNodeConfig,
  WorkflowPaymentCollectionNodeConfig,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const WORKFLOW_PAYMENT_COLLECTION_OPTIONS = [
  "deposit",
  "stage_1",
  "stage_2",
  "stage_3",
  "add_on",
] as const;

const WORKFLOW_PAYMENT_REQUIREMENT_OPTIONS = [
  { value: "any_confirmed", label: "有已入账收款即可" },
  { value: "signed_amount_percentage", label: "按签约金额比例" },
] as const satisfies Array<{
  value: NonNullable<WorkflowPaymentCollectionNodeConfig["requirement_mode"]>;
  label: string;
}>;

export function getWorkflowPaymentCollectionLabel(
  paymentType: string | null | undefined,
) {
  if (!paymentType || paymentType === "refund") return "";
  return PaymentTypeConfig[paymentType as keyof typeof PaymentTypeConfig]?.label ||
    "";
}

function parseOptionalPercentage(value: string) {
  const normalized = value.trim();
  if (normalized === "") return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

type WorkflowEmployeeListData = {
  list: WorkflowEmployeeOption[];
};

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

function isFinanceEmployee(employee: WorkflowEmployeeOption) {
  const departmentCode = employee.department_code?.toLowerCase() || "";
  const departmentName = employee.department_name || "";
  const legacyRole = (employee as { role?: string | null }).role?.toLowerCase() || "";
  const roles = employee.roles || [];

  return departmentCode.includes("finance") ||
    departmentName.includes("财务") ||
    legacyRole === "finance" ||
    roles.some((role) =>
      role.status !== "inactive" &&
      (role.code === "finance" ||
        role.code === "finance_base" ||
        role.code.includes("finance") ||
        role.name.includes("财务"))
    );
}

export function WorkflowPaymentCollectionConfigFields({
  config,
  disabled,
  onChangeConfig,
}: {
  config: WorkflowNodeConfig;
  disabled?: boolean;
  onChangeConfig: (patch: Partial<WorkflowPaymentCollectionNodeConfig>) => void;
}) {
  const paymentConfig = config as WorkflowPaymentCollectionNodeConfig;
  const requirementMode = paymentConfig.requirement_mode || "any_confirmed";

  return (
    <section className="space-y-3">
      <div className="grid gap-2">
        <Label htmlFor="workflow-node-payment-type">收款类型</Label>
        <Select
          disabled={disabled}
          value={paymentConfig.payment_type || "deposit"}
          onValueChange={(value) =>
            onChangeConfig({
              payment_type: value as WorkflowPaymentCollectionNodeConfig["payment_type"],
            })
          }
        >
          <SelectTrigger id="workflow-node-payment-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {WORKFLOW_PAYMENT_COLLECTION_OPTIONS.map((value) => (
              <SelectItem key={value} value={value}>
                {PaymentTypeConfig[value].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="workflow-node-payment-requirement-mode">收款要求</Label>
        <Select
          disabled={disabled}
          value={requirementMode}
          onValueChange={(value) =>
            onChangeConfig({
              requirement_mode: value as WorkflowPaymentCollectionNodeConfig["requirement_mode"],
              required_percentage: value === "any_confirmed"
                ? null
                : paymentConfig.required_percentage ?? null,
            })
          }
        >
          <SelectTrigger id="workflow-node-payment-requirement-mode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {WORKFLOW_PAYMENT_REQUIREMENT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {requirementMode === "signed_amount_percentage" ? (
        <div className="grid gap-2">
          <Label htmlFor="workflow-node-payment-required-percentage">
            金额/比例规则
          </Label>
          <Input
            id="workflow-node-payment-required-percentage"
            type="number"
            min={0.01}
            max={100}
            step={0.01}
            value={paymentConfig.required_percentage ?? ""}
            disabled={disabled}
            placeholder="例如 30"
            onChange={(event) => {
              onChangeConfig({
                required_percentage: parseOptionalPercentage(event.target.value),
              });
            }}
          />
        </div>
      ) : null}
      <PaymentFinanceReviewerSelect
        disabled={disabled}
        value={paymentConfig.finance_reviewer_employee_id || null}
        onChange={(value) =>
          onChangeConfig({ finance_reviewer_employee_id: value })
        }
      />
      <div className="grid gap-2">
        <Label htmlFor="workflow-node-payment-block-message">阻塞提示</Label>
        <Input
          id="workflow-node-payment-block-message"
          value={paymentConfig.block_message || ""}
          disabled={disabled}
          maxLength={200}
          placeholder="请先确认收款后再推进流程"
          onChange={(event) =>
            onChangeConfig({
              block_message: event.target.value.trim() || null,
            })
          }
        />
      </div>
    </section>
  );
}

function PaymentFinanceReviewerSelect({
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
  const financeEmployees = useMemo(
    () => employees.filter(isFinanceEmployee),
    [employees],
  );
  const selectedEmployee = financeEmployees.find((employee) => employee.id === value) ||
    employees.find((employee) => employee.id === value) ||
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
      requestBackendJson<WorkflowEmployeeListData>(`/employees?${params}`, {
        cache: "no-store",
        signal: controller.signal,
        fallbackMessage: "财务审核人加载失败",
      })
        .then((data) => setEmployees(data.list || []))
        .catch((err) => {
          if (controller.signal.aborted) return;
          setEmployees([]);
          setError(err instanceof Error ? err.message : "财务审核人加载失败");
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
      <Label>财务负责人</Label>
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
                  ? "已选择财务审核人"
                  : "选择财务部门员工"}
            </span>
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              value={keyword}
              onValueChange={setKeyword}
              placeholder="搜索姓名或手机号尾数"
            />
            <CommandList className="max-h-[260px]">
              <CommandEmpty>
                {loading ? "加载中..." : error || "没有匹配的财务员工"}
              </CommandEmpty>
              <CommandGroup>
                {financeEmployees.map((employee) => (
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
                        {getEmployeeMeta(employee) || "财务员工"}
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
