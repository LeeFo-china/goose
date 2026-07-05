"use client";

import Link from "next/link";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import {
  FinanceCheckboxField,
  FinanceFilterSelectField,
  type FinanceFilterOption,
} from "@/components/finance/finance-filter-controls";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function FinanceReceivableFilters({
  dueDateFrom,
  dueDateTo,
  followUpDueOnly,
  ownerEmployeeId,
  paymentType,
  paymentTypeOptions,
  projectId,
  receivablePlanId,
  sourceType,
  sourceTypeOptions,
  status,
  statusOptions,
  overdueOnly,
}: {
  dueDateFrom?: string;
  dueDateTo?: string;
  followUpDueOnly: boolean;
  ownerEmployeeId?: string;
  paymentType?: string;
  paymentTypeOptions: readonly FinanceFilterOption[];
  projectId?: string;
  receivablePlanId?: string;
  sourceType?: string;
  sourceTypeOptions: readonly FinanceFilterOption[];
  status?: string;
  statusOptions: readonly FinanceFilterOption[];
  overdueOnly: boolean;
}) {
  const hasAdvancedFilters = Boolean(
    sourceType ||
      ownerEmployeeId ||
      dueDateFrom ||
      dueDateTo ||
      overdueOnly ||
      followUpDueOnly,
  );

  return (
    <form action="/finance/receivables" className="flex flex-col gap-3">
      {receivablePlanId ? (
        <input
          type="hidden"
          name="receivable_plan_id"
          value={receivablePlanId}
        />
      ) : null}
      <Collapsible defaultOpen={hasAdvancedFilters}>
        <div className="flex flex-col gap-3">
          <FieldGroup
            id="receivable-primary-filters"
            className="flex-row flex-wrap items-end gap-3"
          >
            <FinanceFilterSelectField
              id="receivable-status"
              name="status"
              label="状态"
              value={status}
              options={statusOptions}
              className="w-full sm:w-40"
            />
            <FinanceFilterSelectField
              id="receivable-payment-type"
              name="payment_type"
              label="收款类型"
              value={paymentType}
              options={paymentTypeOptions}
              className="w-full sm:w-40"
            />
            <Field className="min-w-[14rem] flex-1 gap-1.5">
              <FieldLabel
                className="text-xs font-medium text-muted-foreground"
                htmlFor="receivable-project-id"
              >
                项目 ID
              </FieldLabel>
              <Input
                id="receivable-project-id"
                name="project_id"
                defaultValue={projectId || ""}
                placeholder="按项目 ID 精确筛选"
                className="h-9"
              />
            </Field>
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              <Button type="submit" size="sm">筛选</Button>
              <Button asChild type="button" variant="outline" size="sm">
                <Link href="/finance/receivables">重置</Link>
              </Button>
              <CollapsibleTrigger asChild>
                <Button type="button" variant="outline" size="sm">
                  <SlidersHorizontal data-icon="inline-start" />
                  更多筛选
                  <ChevronDown data-icon="inline-end" />
                </Button>
              </CollapsibleTrigger>
            </div>
          </FieldGroup>
          <CollapsibleContent id="receivable-advanced-filters">
            <div className="flex flex-col gap-3 rounded-md border bg-muted/20 p-3">
              <FieldGroup className="flex-row flex-wrap items-end gap-3">
                <FinanceFilterSelectField
                  id="receivable-source-type"
                  name="source_type"
                  label="来源"
                  value={sourceType}
                  options={sourceTypeOptions}
                  className="w-full sm:w-40"
                />
                <Field className="w-full gap-1.5 sm:w-40">
                  <FieldLabel
                    className="text-xs font-medium text-muted-foreground"
                    htmlFor="receivable-owner-id"
                  >
                    负责人 ID
                  </FieldLabel>
                  <Input
                    id="receivable-owner-id"
                    name="owner_employee_id"
                    defaultValue={ownerEmployeeId || ""}
                    placeholder="按员工 ID 筛选"
                    className="h-9"
                  />
                </Field>
                <Field className="w-full gap-1.5 sm:w-40">
                  <FieldLabel
                    className="text-xs font-medium text-muted-foreground"
                    htmlFor="receivable-due-from"
                  >
                    起始日期
                  </FieldLabel>
                  <Input
                    id="receivable-due-from"
                    name="due_date_from"
                    type="date"
                    defaultValue={dueDateFrom || ""}
                    className="h-9"
                  />
                </Field>
                <Field className="w-full gap-1.5 sm:w-40">
                  <FieldLabel
                    className="text-xs font-medium text-muted-foreground"
                    htmlFor="receivable-due-to"
                  >
                    截止日期
                  </FieldLabel>
                  <Input
                    id="receivable-due-to"
                    name="due_date_to"
                    type="date"
                    defaultValue={dueDateTo || ""}
                    className="h-9"
                  />
                </Field>
              </FieldGroup>
              <FieldGroup className="flex-row flex-wrap gap-2">
                <FinanceCheckboxField
                  id="receivable-overdue-only"
                  name="overdue_only"
                  value="true"
                  checked={overdueOnly}
                  label="只看逾期"
                  className="w-fit"
                />
                <FinanceCheckboxField
                  id="receivable-follow-up-due-only"
                  name="follow_up_due_only"
                  value="true"
                  checked={followUpDueOnly}
                  label="跟进到期"
                  className="w-fit"
                />
              </FieldGroup>
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>
    </form>
  );
}
