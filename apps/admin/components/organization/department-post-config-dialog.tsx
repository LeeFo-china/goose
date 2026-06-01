"use client";

import { type KeyboardEvent, useEffect, useMemo, useState, useTransition } from "react";
import { BriefcaseBusiness, Loader2, Plus, Save, X } from "lucide-react";
import { toast } from "sonner";
import { StatusAlert } from "@/components/admin/status-alert";
import type {
  DepartmentPostRuleConfig,
  DepartmentPostRulePostOption,
  DepartmentRecord,
} from "@/components/organization/organization-types";
import {
  createPostForDepartment,
  fetchDepartmentPostRuleConfig,
  saveDepartmentPostCodes,
} from "@/components/organization/department-post-config-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Field,
  FieldLabel,
} from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { cn } from "@/lib/utils";

function sortCodes(values: string[]) {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function getDepartmentSelectedPostCodes(
  department: DepartmentRecord,
  config: DepartmentPostRuleConfig,
) {
  const ruleDepartment = config.departments.find((item) =>
    (department.tenant_department_id &&
      item.tenant_department_id === department.tenant_department_id) ||
    (department.code && item.code === department.code)
  );

  return ruleDepartment?.selected_post_codes || [];
}

function getPostSearchText(post: DepartmentPostRulePostOption) {
  return `${post.name} ${post.code}`.toLowerCase();
}

function normalizePostName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function DepartmentPostConfigDialog({
  department,
  departmentPostRuleConfig,
  onSaved,
}: {
  department: DepartmentRecord;
  departmentPostRuleConfig: DepartmentPostRuleConfig;
  onSaved?: (config: DepartmentPostRuleConfig) => void;
}) {
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [error, setError] = useState("");
  const [localConfig, setLocalConfig] = useState(departmentPostRuleConfig);
  const [selectedCodes, setSelectedCodes] = useState<string[]>(() =>
    getDepartmentSelectedPostCodes(department, departmentPostRuleConfig)
  );
  const [baselineCodes, setBaselineCodes] = useState<string[]>(selectedCodes);
  const [pending, startTransition] = useTransition();
  const departmentCode = department.code || "";
  const departmentId = department.tenant_department_id || department.id || "";
  const disabled = !departmentCode;
  const trimmedKeyword = keyword.trim();
  const normalizedKeyword = keyword.trim().toLowerCase();
  const filteredPosts = useMemo(
    () =>
      normalizedKeyword
        ? localConfig.post_options.filter((post) =>
          getPostSearchText(post).includes(normalizedKeyword)
        )
        : localConfig.post_options,
    [localConfig.post_options, normalizedKeyword],
  );
  const exactNamePost = useMemo(
    () =>
      trimmedKeyword
        ? localConfig.post_options.find((post) =>
          normalizePostName(post.name) === normalizePostName(trimmedKeyword)
        )
        : undefined,
    [localConfig.post_options, trimmedKeyword],
  );
  const canCreatePost = Boolean(trimmedKeyword && departmentId && !exactNamePost);
  const dirty =
    JSON.stringify(sortCodes(selectedCodes)) !==
    JSON.stringify(sortCodes(baselineCodes));
  const selectedPosts = useMemo(() => {
    const selectedCodeSet = new Set(selectedCodes);
    return localConfig.post_options.filter((post) => selectedCodeSet.has(post.code));
  }, [localConfig.post_options, selectedCodes]);

  useEffect(() => {
    if (!open) return;
    setLocalConfig(departmentPostRuleConfig);
    const nextCodes = getDepartmentSelectedPostCodes(department, departmentPostRuleConfig);
    setSelectedCodes(nextCodes);
    setBaselineCodes(nextCodes);
    setKeyword("");
    setError("");
  }, [department, departmentPostRuleConfig, open]);

  function togglePost(postCode: string) {
    setSelectedCodes((current) =>
      current.includes(postCode)
        ? current.filter((value) => value !== postCode)
        : Array.from(new Set([...current, postCode]))
    );
  }

  function selectVisiblePosts() {
    setSelectedCodes((current) =>
      Array.from(new Set([
        ...current,
        ...filteredPosts.map((post) => post.code),
      ]))
    );
  }

  function clearVisiblePosts() {
    const visibleCodeSet = new Set(filteredPosts.map((post) => post.code));
    setSelectedCodes((current) =>
      current.filter((postCode) => !visibleCodeSet.has(postCode))
    );
  }

  function selectExistingPost(post: DepartmentPostRulePostOption) {
    const alreadySelected = selectedCodes.includes(post.code);
    if (!alreadySelected) {
      setSelectedCodes((current) => Array.from(new Set([...current, post.code])));
    }
    setKeyword(post.name);
    setError("");
    toast.success(
      alreadySelected
        ? `岗位「${post.name}」已在当前配置中`
        : `已选中已有岗位「${post.name}」`,
    );
  }

  function handleKeywordKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" || !canCreatePost) return;
    event.preventDefault();
    createPostFromKeyword();
  }

  function save() {
    if (!departmentCode) return;

    setError("");
    startTransition(async () => {
      try {
        const payload = await saveDepartmentPostCodes(departmentCode, selectedCodes);
        const nextCodes = payload.data?.selected_post_codes || selectedCodes;
        setSelectedCodes(nextCodes);
        setBaselineCodes(nextCodes);
        if (payload.data?.config) {
          setLocalConfig(payload.data.config);
          onSaved?.(payload.data.config);
        }
        setOpen(false);
        toast.success(`${department.name} 岗位已保存`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "保存部门岗位失败");
        toast.error(err instanceof Error ? err.message : "保存部门岗位失败");
      }
    });
  }

  function createPostFromKeyword() {
    const name = trimmedKeyword;
    if (!name) {
      setError("请填写岗位名称");
      return;
    }
    if (!departmentId) {
      setError("请先选择有效部门");
      return;
    }
    const existingPost = localConfig.post_options.find((post) =>
      normalizePostName(post.name) === normalizePostName(name)
    );
    if (existingPost) {
      selectExistingPost(existingPost);
      return;
    }

    setError("");
    startTransition(async () => {
      try {
        await createPostForDepartment({
          name,
          departmentId,
        });
        const nextConfig = await fetchDepartmentPostRuleConfig();
        const nextCodes = getDepartmentSelectedPostCodes(department, nextConfig);
        setLocalConfig(nextConfig);
        setSelectedCodes(nextCodes);
        setBaselineCodes(nextCodes);
        setKeyword("");
        onSaved?.(nextConfig);
        toast.success("岗位已新增");
      } catch (err) {
        setError(err instanceof Error ? err.message : "新增岗位失败");
        toast.error(err instanceof Error ? err.message : "新增岗位失败");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm" disabled={disabled}>
          <BriefcaseBusiness data-icon="inline-start" />
          配置岗位
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl p-0">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle>配置岗位</DialogTitle>
          <DialogDescription>
            {department.name}
            {departmentCode ? ` · ${departmentCode}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 px-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={dirty ? "warning" : "secondary"}>
              {dirty ? "未保存" : "已保存"}
            </Badge>
            <span className="text-sm text-muted-foreground">
              已选 {selectedCodes.length} 个岗位
            </span>
            {selectedPosts.length > 0 ? (
              <div className="flex min-w-0 flex-wrap gap-1">
                {selectedPosts.map((post) => (
                  <Badge key={post.code} variant="outline">
                    {post.name}
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>

          <Command shouldFilter={false} className="rounded-md border">
            <Field className="gap-2 border-b p-3">
              <FieldLabel htmlFor={`post-search-create-${department.id}`}>
                搜索或新增岗位
              </FieldLabel>
              <InputGroup>
                <InputGroupInput
                  id={`post-search-create-${department.id}`}
                  value={keyword}
                  placeholder="输入岗位名称或编码"
                  disabled={pending || !departmentId}
                  maxLength={50}
                  onKeyDown={handleKeywordKeyDown}
                  onChange={(event) => setKeyword(event.target.value)}
                />
                {keyword ? (
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton
                      type="button"
                      aria-label="清空岗位输入"
                      size="icon-xs"
                      disabled={pending}
                      onClick={() => setKeyword("")}
                    >
                      <X aria-hidden="true" />
                    </InputGroupButton>
                  </InputGroupAddon>
                ) : null}
              </InputGroup>
            </Field>
            <CommandList className="max-h-[360px]">
              {!canCreatePost && filteredPosts.length === 0 ? (
                <CommandEmpty>没有匹配的岗位</CommandEmpty>
              ) : null}
              <CommandGroup>
                {filteredPosts.map((post) => {
                  const checked = selectedCodes.includes(post.code);
                  return (
                    <CommandItem
                      key={post.code}
                      value={`${post.name} ${post.code}`}
                      disabled={pending}
                      className={cn(
                        "cursor-pointer items-start gap-3 py-2",
                        checked ? "bg-accent/65" : "",
                      )}
                      onSelect={() => togglePost(post.code)}
                    >
                      <Checkbox
                        checked={checked}
                        disabled={pending}
                        className="mt-1"
                        aria-label={`选择${post.name}`}
                        onCheckedChange={() => togglePost(post.code)}
                        onClick={(event) => event.stopPropagation()}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="truncate font-medium">{post.name}</span>
                          {post.status === 0 ? <Badge variant="outline">停用</Badge> : null}
                        </span>
                        <span className="block break-all text-xs text-muted-foreground">
                          {post.code}
                        </span>
                      </span>
                    </CommandItem>
                  );
                })}
                {canCreatePost ? (
                  <CommandItem
                    value={`create ${trimmedKeyword}`}
                    disabled={pending}
                    className="cursor-pointer items-start gap-3 border-t py-3"
                    onSelect={createPostFromKeyword}
                  >
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground">
                      {pending ? (
                        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <Plus className="size-3.5" aria-hidden="true" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        创建并加入当前部门：{trimmedKeyword}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {department.name}
                      </span>
                    </span>
                  </CommandItem>
                ) : null}
              </CommandGroup>
            </CommandList>
          </Command>

          {error ? <StatusAlert>{error}</StatusAlert> : null}
        </div>

        <DialogFooter className="flex-col gap-2 border-t px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending || filteredPosts.length === 0}
              onClick={selectVisiblePosts}
            >
              全选当前
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending || filteredPosts.length === 0}
              onClick={clearVisiblePosts}
            >
              清空当前
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              取消
            </Button>
            <Button type="button" size="sm" disabled={pending || !dirty} onClick={save}>
              {pending ? (
                <Loader2 className="animate-spin" data-icon="inline-start" />
              ) : (
                <Save data-icon="inline-start" />
              )}
              保存
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
