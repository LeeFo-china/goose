"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { BriefcaseBusiness, Loader2, Save, Search, X } from "lucide-react";
import { toast } from "sonner";
import { FormSelect } from "@/components/admin/form-select";
import { StatusAlert } from "@/components/admin/status-alert";
import { CreatePostButton } from "@/components/organization/post-mutations";
import type {
  DepartmentPostRuleDepartment,
  DepartmentPostRulePostOption,
} from "@/components/organization/organization-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { cn } from "@/lib/utils";

type SelectedState = Record<string, string[]>;

async function saveDepartmentPostCodes(
  departmentCode: string,
  postCodes: string[],
) {
  const response = await fetch(
    `/api/backend/department-post-rules/${encodeURIComponent(departmentCode)}`,
    {
      method: "PUT",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        post_codes: postCodes,
      }),
    },
  );

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || "保存部门岗位规则失败");
  }
  return payload;
}

function sortCodes(values: string[]) {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function createSelectedState(departments: DepartmentPostRuleDepartment[]) {
  return departments.reduce<SelectedState>((acc, department) => {
    acc[department.code] = department.selected_post_codes;
    return acc;
  }, {});
}

function getPostSearchText(post: DepartmentPostRulePostOption) {
  return `${post.name} ${post.code}`.toLowerCase();
}

export function DepartmentPostRulesClientShell({
  departments,
  postOptions,
  error,
}: {
  departments: DepartmentPostRuleDepartment[];
  postOptions: DepartmentPostRulePostOption[];
  error: string | null;
}) {
  const [activeDepartmentCode, setActiveDepartmentCode] = useState(
    departments[0]?.code || "",
  );
  const [keyword, setKeyword] = useState("");
  const [selected, setSelected] = useState<SelectedState>(() =>
    createSelectedState(departments)
  );
  const [baseline, setBaseline] = useState<SelectedState>(() =>
    createSelectedState(departments)
  );
  const [savingDepartmentCode, setSavingDepartmentCode] = useState("");
  const [pending, startTransition] = useTransition();

  const activeDepartment = departments.find(
    (department) => department.code === activeDepartmentCode,
  );
  const selectedCodes = activeDepartment
    ? selected[activeDepartment.code] || []
    : [];
  const baselineCodes = activeDepartment
    ? baseline[activeDepartment.code] || []
    : [];
  const dirty = JSON.stringify(sortCodes(selectedCodes)) !==
    JSON.stringify(sortCodes(baselineCodes));
  const saving = pending && savingDepartmentCode === activeDepartmentCode;
  const totalSelected = useMemo(
    () => Object.values(selected).reduce((sum, values) => sum + values.length, 0),
    [selected],
  );
  const normalizedKeyword = keyword.trim().toLowerCase();
  const filteredPosts = normalizedKeyword
    ? postOptions.filter((post) =>
      getPostSearchText(post).includes(normalizedKeyword)
    )
    : postOptions;

  useEffect(() => {
    const nextState = createSelectedState(departments);
    setSelected(nextState);
    setBaseline(nextState);
    setActiveDepartmentCode((currentCode) =>
      departments.some((department) => department.code === currentCode)
        ? currentCode
        : departments[0]?.code || "",
    );
  }, [departments]);

  function updateDepartmentCodes(
    departmentCode: string,
    updater: (current: string[]) => string[],
  ) {
    setSelected((current) => ({
      ...current,
      [departmentCode]: updater(current[departmentCode] || []),
    }));
  }

  function togglePost(postCode: string, checked: boolean) {
    if (!activeDepartment) return;

    updateDepartmentCodes(activeDepartment.code, (currentValues) =>
      checked
        ? Array.from(new Set([...currentValues, postCode]))
        : currentValues.filter((value) => value !== postCode)
    );
  }

  function selectVisiblePosts() {
    if (!activeDepartment) return;
    updateDepartmentCodes(activeDepartment.code, (currentValues) =>
      Array.from(new Set([
        ...currentValues,
        ...filteredPosts.map((post) => post.code),
      ]))
    );
  }

  function clearVisiblePosts() {
    if (!activeDepartment) return;
    const visibleCodeSet = new Set(filteredPosts.map((post) => post.code));
    updateDepartmentCodes(activeDepartment.code, (currentValues) =>
      currentValues.filter((postCode) => !visibleCodeSet.has(postCode))
    );
  }

  function saveActiveDepartment() {
    if (!activeDepartment) return;

    setSavingDepartmentCode(activeDepartment.code);
    startTransition(async () => {
      try {
        await saveDepartmentPostCodes(activeDepartment.code, selectedCodes);
        setBaseline((current) => ({
          ...current,
          [activeDepartment.code]: selectedCodes,
        }));
        toast.success(`${activeDepartment.name} 岗位规则已保存`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "保存部门岗位规则失败");
      } finally {
        setSavingDepartmentCode("");
      }
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2">
                <BriefcaseBusiness aria-hidden="true" />
                部门岗位规则
              </CardTitle>
              <CardDescription>
                配置每个部门允许选择的岗位。保存后，员工新增和编辑会按该规则校验。
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{departments.length} 个部门</Badge>
              <Badge variant="secondary">{postOptions.length} 个岗位</Badge>
              <Badge variant="secondary">{totalSelected} 个启用映射</Badge>
            </div>
          </div>
        </CardHeader>
      </Card>

      {error ? <StatusAlert>{error}</StatusAlert> : null}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="grid gap-3 lg:grid-cols-[260px_320px]">
              <FormSelect
                id="department-post-rule-department"
                value={activeDepartmentCode}
                disabled={pending || departments.length === 0}
                options={departments.map((department) => ({
                  value: department.code,
                  label: `${department.name} · ${department.code}`,
                }))}
                onChange={setActiveDepartmentCode}
              />
              <InputGroup>
                <InputGroupAddon>
                  <Search aria-hidden="true" />
                </InputGroupAddon>
                <InputGroupInput
                  value={keyword}
                  placeholder="搜索岗位名称或编码"
                  disabled={pending}
                  onChange={(event) => setKeyword(event.target.value)}
                />
                {keyword ? (
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton
                      aria-label="清除岗位搜索"
                      size="icon-xs"
                      disabled={pending}
                      onClick={() => setKeyword("")}
                    >
                      <X aria-hidden="true" />
                    </InputGroupButton>
                  </InputGroupAddon>
                ) : null}
              </InputGroup>
            </div>
            <div className="flex flex-wrap gap-2">
              <CreatePostButton
                departments={departments}
                defaultDepartmentId={activeDepartment?.id || ""}
                lockDepartment
                disabled={pending || !activeDepartment}
                label="当前部门新增岗位"
              />
              <Button
                type="button"
                variant="outline"
                disabled={pending || filteredPosts.length === 0}
                onClick={selectVisiblePosts}
              >
                全选当前
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={pending || filteredPosts.length === 0}
                onClick={clearVisiblePosts}
              >
                清空当前
              </Button>
              <Button
                type="button"
                disabled={saving || !activeDepartment || !dirty}
                onClick={saveActiveDepartment}
              >
                {saving ? (
                  <Loader2 className="animate-spin" data-icon="inline-start" />
                ) : (
                  <Save data-icon="inline-start" />
                )}
                保存
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {activeDepartment ? (
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>{activeDepartment.name}</span>
              <Badge variant="outline">{activeDepartment.code}</Badge>
              <Badge variant={dirty ? "warning" : "secondary"}>
                {dirty ? "未保存" : "已保存"}
              </Badge>
              <span>已选 {selectedCodes.length} 个岗位</span>
            </div>
          ) : null}

          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {filteredPosts.map((post) => {
              const checked = selectedCodes.includes(post.code);
              return (
                <label
                  key={`${activeDepartmentCode}-${post.code}`}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2 transition-colors",
                    checked
                      ? "border-primary/40 bg-primary/5"
                      : "hover:bg-muted/45",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={pending || !activeDepartment}
                    className="mt-1 size-4 rounded border border-input accent-primary"
                    onChange={(event) =>
                      togglePost(post.code, event.target.checked)
                    }
                  />
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {post.name}
                      </span>
                      {post.status === 0 ? (
                        <Badge variant="outline">停用</Badge>
                      ) : null}
                    </span>
                    <span className="block break-all text-xs text-muted-foreground">
                      {post.code}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>

          {filteredPosts.length === 0 ? (
            <div className="rounded-md border bg-muted/35 px-3 py-6 text-center text-sm text-muted-foreground">
              没有匹配的岗位
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
