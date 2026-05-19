"use client";

import { type FormEvent, useEffect, useState, useTransition } from "react";
import { Edit3, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { StatusAlert } from "@/components/admin/status-alert";
import type { DepartmentPostRuleConfig } from "@/components/organization/organization-types";
import { Button } from "@/components/ui/button";
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
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

async function updateDepartmentPostAlias(input: {
  departmentCode: string;
  postCode: string;
  aliasName: string | null;
}) {
  const response = await fetch(
    `/api/backend/department-post-rules/${encodeURIComponent(input.departmentCode)}/posts/${encodeURIComponent(input.postCode)}/alias`,
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        alias_name: input.aliasName,
      }),
    },
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.message || payload?.error || "保存岗位别名失败");
  }
  return payload as {
    data?: {
      alias_name?: string | null;
      config?: DepartmentPostRuleConfig;
    };
  };
}

export function DepartmentPostAliasDialog({
  departmentCode,
  departmentName,
  postCode,
  postName,
  aliasName,
  onSaved,
}: {
  departmentCode: string;
  departmentName: string;
  postCode: string;
  postName: string;
  aliasName?: string | null;
  onSaved?: (config: DepartmentPostRuleConfig) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(aliasName || "");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const normalizedName = name.trim();
  const baseline = aliasName || "";
  const dirty = normalizedName !== baseline;

  useEffect(() => {
    if (!open) return;
    setName(aliasName || "");
    setError("");
  }, [aliasName, open]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    startTransition(async () => {
      try {
        const payload = await updateDepartmentPostAlias({
          departmentCode,
          postCode,
          aliasName: normalizedName || null,
        });
        if (payload.data?.config) {
          onSaved?.(payload.data.config);
        }
        setOpen(false);
        toast.success("岗位别名已保存");
      } catch (err) {
        setError(err instanceof Error ? err.message : "保存岗位别名失败");
        toast.error(err instanceof Error ? err.message : "保存岗位别名失败");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm">
          <Edit3 data-icon="inline-start" />
          改名
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <DialogTitle>岗位别名</DialogTitle>
          <DialogDescription>
            {departmentName} · {postName}
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`department-post-alias-${departmentCode}-${postCode}`}>
                显示名称
              </FieldLabel>
              <Input
                id={`department-post-alias-${departmentCode}-${postCode}`}
                value={name}
                placeholder={postName}
                maxLength={50}
                disabled={pending}
                onChange={(event) => setName(event.target.value)}
              />
              <FieldDescription>
                留空后使用岗位原名称。
              </FieldDescription>
            </Field>
          </FieldGroup>
          {error ? <StatusAlert>{error}</StatusAlert> : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              取消
            </Button>
            <Button type="submit" disabled={pending || !dirty}>
              {pending ? (
                <Loader2 className="animate-spin" data-icon="inline-start" />
              ) : (
                <Save data-icon="inline-start" />
              )}
              保存
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
