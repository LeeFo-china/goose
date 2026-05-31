"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { DEPARTMENT_CODE_VALUES, DepartmentConfig, type DepartmentCode } from "@gooes/domain";
import { useRouter } from "next/navigation";
import { Building2, Check, Loader2 } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { enableDepartmentsBatch } from "@/components/organization/department-mutation-shared";
import { refreshAfterDialogClose } from "@/lib/deferred-refresh";
import { cn } from "@/lib/utils";

export function EnableDepartmentsDialog({
  enabledDepartmentCodes,
  open,
  onOpenChange,
  onEnabled,
}: {
  enabledDepartmentCodes: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEnabled?: (codes: string[]) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selectedCodes, setSelectedCodes] = useState<DepartmentCode[]>([]);
  const [error, setError] = useState("");
  const enabledCodeSet = useMemo(
    () => new Set(enabledDepartmentCodes.filter(Boolean)),
    [enabledDepartmentCodes],
  );
  const availableOptions = useMemo(
    () =>
      DEPARTMENT_CODE_VALUES
        .filter((code) => !enabledCodeSet.has(code))
        .map((code, index) => ({
          code,
          label: DepartmentConfig[code].label,
          sort: index + 1,
        })),
    [enabledCodeSet],
  );
  const selectedSet = useMemo(() => new Set(selectedCodes), [selectedCodes]);

  useEffect(() => {
    if (!open) return;
    setSelectedCodes([]);
    setError("");
  }, [open]);

  function close() {
    if (pending) return;
    setError("");
    onOpenChange(false);
  }

  function toggleCode(code: DepartmentCode) {
    if (selectedSet.has(code)) {
      setSelectedCodes((current) => current.filter((item) => item !== code));
      return;
    }
    setSelectedCodes((current) => [...current, code]);
  }

  function selectAll() {
    setSelectedCodes(availableOptions.map((item) => item.code));
  }

  function submit() {
    if (selectedCodes.length === 0) {
      setError("请选择需要启用的部门");
      return;
    }

    setError("");
    startTransition(async () => {
      try {
        await enableDepartmentsBatch({
          departments: selectedCodes.map((code) => {
            const option = availableOptions.find((item) => item.code === code);
            return {
              code,
              name: DepartmentConfig[code].label,
              enabled: true,
              sort: option?.sort ?? 0,
            };
          }),
        });
        onEnabled?.(selectedCodes);
        onOpenChange(false);
        refreshAfterDialogClose(router);
      } catch (err) {
        setError(err instanceof Error ? err.message : "启用部门失败");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-[640px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-md bg-accent text-accent-foreground">
              <Building2 />
            </div>
            <div>
              <DialogTitle>启用部门</DialogTitle>
              <DialogDescription>
                从平台标准部门中搜索并多选，启用后才会进入租户部门列表。
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 rounded-md border bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-muted-foreground">
              已选择 {selectedCodes.length} 个，尚可启用 {availableOptions.length} 个
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending || availableOptions.length === 0}
                onClick={selectAll}
              >
                全选
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pending || selectedCodes.length === 0}
                onClick={() => setSelectedCodes([])}
              >
                清空
              </Button>
            </div>
          </div>

          <Command className="rounded-md border">
            <CommandInput placeholder="搜索标准部门名称或编码" />
            <CommandList className="max-h-[360px]">
              <CommandEmpty>
                {availableOptions.length === 0 ? "标准部门已全部启用" : "没有匹配的部门"}
              </CommandEmpty>
              <CommandGroup>
                {availableOptions.map((item) => {
                  const checked = selectedSet.has(item.code);

                  return (
                    <CommandItem
                      key={item.code}
                      value={`${item.label} ${item.code}`}
                      onSelect={() => toggleCode(item.code)}
                    >
                      <Checkbox checked={checked} aria-label={item.label} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{item.label}</div>
                        <div className="truncate text-xs text-muted-foreground">{item.code}</div>
                      </div>
                      <Check className={cn("opacity-0", checked && "opacity-100")} />
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
          {error ? <StatusAlert>{error}</StatusAlert> : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={close} disabled={pending}>
            取消
          </Button>
          <Button
            type="button"
            disabled={pending || availableOptions.length === 0}
            onClick={submit}
          >
            {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
            启用选中部门
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

