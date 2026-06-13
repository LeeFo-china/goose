"use client";

import { Dispatch, SetStateAction } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type {
  EmployeeOption,
  ProjectStatusActionItem,
} from "@/components/projects/project-mutation-types";
import {
  getEmployeeMeta,
  getEmployeeOptionLabel,
  projectStatusLabel,
} from "@/components/projects/project-mutation-utils";

type ProjectStatusActionDialogProps = {
  selectedAction: ProjectStatusActionItem | null;
  pending: boolean;
  signedAmount: string;
  setSignedAmount: Dispatch<SetStateAction<string>>;
  constructionStartDate: string;
  setConstructionStartDate: Dispatch<SetStateAction<string>>;
  constructionManagerKeyword: string;
  setConstructionManagerKeyword: Dispatch<SetStateAction<string>>;
  constructionManagerLoading: boolean;
  constructionManagerCandidates: EmployeeOption[];
  constructionManagerEmployeeId: string;
  setConstructionManagerEmployeeId: Dispatch<SetStateAction<string>>;
  constructionManagerEmployee?: EmployeeOption;
  reason: string;
  setReason: Dispatch<SetStateAction<string>>;
  closeActionDialog: () => void;
  submitAction: () => void;
};

export function ProjectStatusActionDialog({
  selectedAction,
  pending,
  signedAmount,
  setSignedAmount,
  constructionStartDate,
  setConstructionStartDate,
  constructionManagerKeyword,
  setConstructionManagerKeyword,
  constructionManagerLoading,
  constructionManagerCandidates,
  constructionManagerEmployeeId,
  setConstructionManagerEmployeeId,
  constructionManagerEmployee,
  reason,
  setReason,
  closeActionDialog,
  submitAction,
}: ProjectStatusActionDialogProps) {
  const isPaymentCollection =
    selectedAction?.workflow_business_domain === "payment_collection";

  return (
    <Dialog open={Boolean(selectedAction)} onOpenChange={(open) => !open && closeActionDialog()}>
      <DialogContent className="max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{selectedAction?.label || "流程操作"}</DialogTitle>
          <DialogDescription>
            {isPaymentCollection
              ? "确认后将校验对应收款是否已入账，满足条件后推进 workflow。"
              : selectedAction
              ? `${projectStatusLabel(selectedAction.from_status)} -> ${projectStatusLabel(selectedAction.to_status)}`
              : "确认执行该 workflow 操作。"}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {selectedAction?.action === "sign_contract" ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="project-status-signed-amount">签约金额</Label>
              <Input
                id="project-status-signed-amount"
                type="number"
                min="0"
                step="0.01"
                value={signedAmount}
                disabled={pending}
                onChange={(event) => setSignedAmount(event.target.value)}
              />
            </div>
          ) : null}
          {selectedAction?.action === "schedule_construction" ? (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor="project-status-start-date">开工日期</Label>
                <Input
                  id="project-status-start-date"
                  type="date"
                  value={constructionStartDate}
                  disabled={pending}
                  onChange={(event) => setConstructionStartDate(event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>工程负责人</Label>
                <Command shouldFilter={false} className="rounded-md border">
                  <CommandInput
                    value={constructionManagerKeyword}
                    onValueChange={setConstructionManagerKeyword}
                    placeholder="搜索员工姓名或手机号"
                    disabled={pending}
                  />
                  <CommandList className="max-h-[220px]">
                    <CommandEmpty>
                      {constructionManagerLoading ? "加载中..." : "没有可选工程负责人"}
                    </CommandEmpty>
                    <CommandGroup>
                      {constructionManagerCandidates.map((employee) => {
                        const selected = employee.id === constructionManagerEmployeeId;
                        return (
                          <CommandItem
                            key={employee.id}
                            value={`${employee.name || ""} ${employee.phone || ""} ${employee.department_name || ""} ${employee.post_name || ""}`}
                            onSelect={() => setConstructionManagerEmployeeId(employee.id)}
                            className="cursor-pointer"
                          >
                            <span className="flex min-w-0 flex-1 flex-col">
                              <span className="truncate text-sm font-medium">
                                {getEmployeeOptionLabel(employee)}
                              </span>
                              <span className="truncate text-xs text-muted-foreground">
                                {getEmployeeMeta(employee) || "暂无部门岗位信息"}
                              </span>
                            </span>
                            {selected ? <Check data-icon="inline-end" /> : null}
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
                {constructionManagerEmployee ? (
                  <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                    <span className="font-medium">
                      {getEmployeeOptionLabel(constructionManagerEmployee)}
                    </span>
                    <span className="ml-2 text-muted-foreground">
                      {getEmployeeMeta(constructionManagerEmployee)}
                    </span>
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
          <div className="flex flex-col gap-2">
            <Label htmlFor="project-status-reason">
              {selectedAction?.requires_reason ? "原因" : "备注"}
            </Label>
            <Textarea
              id="project-status-reason"
              value={reason}
              disabled={pending}
              placeholder={selectedAction?.requires_reason ? "请输入原因" : "可选"}
              className="min-h-[96px]"
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={closeActionDialog}>
            取消
          </Button>
          <Button
            type="button"
            variant={selectedAction?.action === "mark_invalid" ? "destructive" : "default"}
            disabled={pending}
            onClick={submitAction}
          >
            {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
            确认执行
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
