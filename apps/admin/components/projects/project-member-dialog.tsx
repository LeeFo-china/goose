"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Check, Loader2, UserPlus } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { EmployeeOption } from "@/components/projects/project-mutation-types";
import { getEmployeeMeta, getEmployeeOptionLabel, requestProject } from "@/components/projects/project-mutation-utils";
import { requestBackendJson } from "@/lib/backend-client";

export function AddProjectMemberDialog({
  projectId,
  existingEmployeeIds,
  onAdded,
}: {
  projectId: string;
  existingEmployeeIds: string[];
  onAdded: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [candidates, setCandidates] = useState<EmployeeOption[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [loading, setLoading] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const existingEmployeeIdSet = useMemo(
    () => new Set(existingEmployeeIds),
    [existingEmployeeIds],
  );
  const availableCandidates = useMemo(
    () => candidates.filter((item) => !existingEmployeeIdSet.has(item.id)),
    [candidates, existingEmployeeIdSet],
  );
  const selectedEmployee = availableCandidates.find(
    (item) => item.id === selectedEmployeeId,
  );

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const query = new URLSearchParams({
        page: "1",
        pageSize: "20",
      });
      const normalizedKeyword = keyword.trim();
      if (normalizedKeyword) query.set("keyword", normalizedKeyword);

      setLoading(true);
      setError("");
      requestBackendJson<{ list?: EmployeeOption[] }>(
        `/projects/${projectId}/member-candidates?${query.toString()}`,
        {
        signal: controller.signal,
        cache: "no-store",
          fallbackMessage: "员工候选加载失败",
        },
      )
        .then((data) => {
          setCandidates(data.list || []);
        })
        .catch((err) => {
          if (err instanceof DOMException && err.name === "AbortError") return;
          setCandidates([]);
          setError(err instanceof Error ? err.message : "员工候选加载失败");
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, keyword, projectId]);

  function resetAndClose() {
    setOpen(false);
    setKeyword("");
    setSelectedEmployeeId("");
    setError("");
  }

  function close() {
    if (pending) return;
    resetAndClose();
  }

  function submit() {
    if (!selectedEmployeeId) {
      setError("请选择员工");
      return;
    }

    setError("");
    startTransition(async () => {
      try {
        await requestProject({
          path: `/projects/${projectId}/members`,
          method: "POST",
          payload: {
            employee_id: selectedEmployeeId,
            is_primary: false,
          },
        });
        await onAdded();
        resetAndClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "添加成员失败");
      }
    });
  }

  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        <UserPlus data-icon="inline-start" />
        添加员工
      </Button>
      <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? setOpen(true) : close())}>
        <DialogContent className="max-w-[520px] p-0">
          <DialogHeader className="border-b p-5">
            <DialogTitle>添加项目成员</DialogTitle>
            <DialogDescription>
              直接选择租户员工加入项目，不需要配置项目角色。
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 p-5">
            <Command shouldFilter={false} className="rounded-md border">
              <CommandInput
                value={keyword}
                onValueChange={setKeyword}
                placeholder="搜索员工姓名或手机号"
              />
              <CommandList className="max-h-[320px]">
                <CommandEmpty>
                  {loading ? "加载中..." : "没有可添加的员工"}
                </CommandEmpty>
                <CommandGroup>
                  {availableCandidates.map((employee) => {
                    const selected = employee.id === selectedEmployeeId;
                    return (
                      <CommandItem
                        key={employee.id}
                        value={`${employee.name || ""} ${employee.phone || ""} ${employee.department_name || ""} ${employee.post_name || ""}`}
                        onSelect={() => setSelectedEmployeeId(employee.id)}
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
            {selectedEmployee ? (
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                <span className="font-medium">{getEmployeeOptionLabel(selectedEmployee)}</span>
                <span className="ml-2 text-muted-foreground">
                  {getEmployeeMeta(selectedEmployee)}
                </span>
              </div>
            ) : null}
            {error ? <StatusAlert>{error}</StatusAlert> : null}
          </div>
          <DialogFooter className="border-t p-5">
            <Button type="button" variant="outline" onClick={close} disabled={pending}>
              取消
            </Button>
            <Button type="button" onClick={submit} disabled={pending || !selectedEmployeeId}>
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              添加
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
