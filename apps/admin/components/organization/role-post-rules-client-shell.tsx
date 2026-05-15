"use client";

import { useMemo, useState, useTransition } from "react";
import { Loader2, Save, SearchCheck, Workflow } from "lucide-react";
import { toast } from "sonner";
import { StatusAlert } from "@/components/admin/status-alert";
import type {
  ProjectMemberRolePostOption,
  ProjectMemberRolePostRuleRole,
} from "@/components/organization/organization-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

type SelectedState = Record<string, string[]>;

async function saveRolePostCodes(roleCode: string, postCodes: string[]) {
  const response = await fetch(
    `/api/backend/project-member-role-post-rules/${encodeURIComponent(roleCode)}`,
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
    throw new Error(payload?.message || payload?.error || "保存候选规则失败");
  }
  return payload;
}

function sortCodes(values: string[]) {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function createSelectedState(roles: ProjectMemberRolePostRuleRole[]) {
  return roles.reduce<SelectedState>((acc, role) => {
    acc[role.role_code] = role.selected_post_codes;
    return acc;
  }, {});
}

function categoryLabel(value: ProjectMemberRolePostRuleRole["category"]) {
  return value === "core" ? "核心角色" : "扩展角色";
}

export function RolePostRulesClientShell({
  roles,
  postOptions,
  error,
}: {
  roles: ProjectMemberRolePostRuleRole[];
  postOptions: ProjectMemberRolePostOption[];
  error: string | null;
}) {
  const [selected, setSelected] = useState<SelectedState>(() =>
    createSelectedState(roles)
  );
  const [baseline, setBaseline] = useState<SelectedState>(() =>
    createSelectedState(roles)
  );
  const [savingRoleCode, setSavingRoleCode] = useState("");
  const [pending, startTransition] = useTransition();

  const totalSelected = useMemo(
    () => Object.values(selected).reduce((sum, values) => sum + values.length, 0),
    [selected],
  );

  function togglePost(roleCode: string, postCode: string, checked: boolean) {
    setSelected((current) => {
      const currentValues = current[roleCode] || [];
      const nextValues = checked
        ? [...currentValues, postCode]
        : currentValues.filter((value) => value !== postCode);
      return {
        ...current,
        [roleCode]: nextValues,
      };
    });
  }

  function saveRole(role: ProjectMemberRolePostRuleRole) {
    const postCodes = selected[role.role_code] || [];
    if (postCodes.length === 0) {
      toast.error("至少选择一个岗位");
      return;
    }

    setSavingRoleCode(role.role_code);
    startTransition(async () => {
      try {
        await saveRolePostCodes(role.role_code, postCodes);
        setBaseline((current) => ({
          ...current,
          [role.role_code]: postCodes,
        }));
        toast.success(`${role.role_name} 候选规则已保存`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "保存候选规则失败");
      } finally {
        setSavingRoleCode("");
      }
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2">
                <Workflow className="size-4" />
                项目候选规则
              </CardTitle>
              <CardDescription>
                配置每个项目成员角色允许选择的岗位，保存后立即影响项目创建和项目成员候选列表。
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{roles.length} 个角色</Badge>
              <Badge variant="secondary">{postOptions.length} 个可选岗位</Badge>
              <Badge variant="secondary">{totalSelected} 个映射</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-start gap-2 rounded-md border bg-muted/35 px-3 py-2 text-sm text-muted-foreground">
            <SearchCheck className="mt-0.5 size-4 shrink-0" />
            <span>
              小程序端不需要维护岗位筛选规则；这里保存后，原有接口会按新规则返回候选员工。
            </span>
          </div>
        </CardContent>
      </Card>

      {error ? <StatusAlert>{error}</StatusAlert> : null}

      <div className="grid gap-4 xl:grid-cols-2">
        {roles.map((role) => {
          const selectedCodes = selected[role.role_code] || [];
          const dirty = JSON.stringify(sortCodes(baseline[role.role_code] || [])) !==
            JSON.stringify(sortCodes(selectedCodes));
          const saving = pending && savingRoleCode === role.role_code;
          const empty = selectedCodes.length === 0;

          return (
            <section key={role.role_code} className="rounded-lg border bg-card">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b p-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold tracking-normal">
                      {role.role_name}
                    </h3>
                    <Badge variant={role.category === "core" ? "default" : "outline"}>
                      {categoryLabel(role.category)}
                    </Badge>
                    {dirty ? <Badge variant="warning">未保存</Badge> : null}
                  </div>
                  <div className="mt-1 break-all text-xs text-muted-foreground">
                    {role.role_code} · 已选 {selectedCodes.length} 个岗位
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  disabled={saving || !dirty || empty}
                  onClick={() => saveRole(role)}
                >
                  {saving ? (
                    <Loader2 className="animate-spin" data-icon="inline-start" />
                  ) : (
                    <Save data-icon="inline-start" />
                  )}
                  保存
                </Button>
              </div>

              <div className="grid gap-2 p-4 sm:grid-cols-2">
                {postOptions.map((post) => {
                  const checked = selectedCodes.includes(post.code);
                  return (
                    <label
                      key={`${role.role_code}-${post.code}`}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2 transition-colors",
                        checked
                          ? "border-primary/40 bg-primary/5"
                          : "hover:bg-muted/45",
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        disabled={saving}
                        className="mt-1"
                        onCheckedChange={(value) =>
                          togglePost(role.role_code, post.code, value === true)
                        }
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {post.name}
                        </span>
                        <span className="block break-all text-xs text-muted-foreground">
                          {post.code}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>

              {empty ? (
                <div className="border-t px-4 py-3 text-sm text-destructive">
                  至少保留一个岗位，否则该角色无法保存。
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}
