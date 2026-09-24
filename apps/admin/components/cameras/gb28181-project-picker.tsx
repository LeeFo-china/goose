"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import type { CameraProjectOption } from "@/components/cameras/camera-types";
import {
  canBindCameraToProject,
  getProjectOptionDescription,
  getProjectOptionLabel,
} from "@/components/cameras/camera-mutation-shared";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { requestBackendJson } from "@/lib/backend-client";
import { cn } from "@/lib/utils";

type ProjectOptionsResponse = {
  list: CameraProjectOption[];
};

export function Gb28181ProjectPicker({
  disabled,
  selectedProjectId,
  onSelect,
}: {
  disabled: boolean;
  selectedProjectId: string;
  onSelect: (project: CameraProjectOption | null) => void;
}) {
  const [keyword, setKeyword] = useState("");
  const [options, setOptions] = useState<CameraProjectOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let disposed = false;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ page: "1", pageSize: "20" });
      if (keyword.trim()) params.set("keyword", keyword.trim());

      setLoading(true);
      setError("");
      requestBackendJson<ProjectOptionsResponse>(
        `/projects/camera-bind-options?${params.toString()}`,
      )
        .then((result) => {
          if (!disposed) setOptions(result.list || []);
        })
        .catch((caught) => {
          if (!disposed) {
            setOptions([]);
            setError(caught instanceof Error ? caught.message : "项目加载失败");
          }
        })
        .finally(() => {
          if (!disposed) setLoading(false);
        });
    }, keyword.trim() ? 300 : 0);

    return () => {
      disposed = true;
      window.clearTimeout(timer);
    };
  }, [keyword]);

  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor="gb28181-project-search">所属项目</FieldLabel>
      <Input
        id="gb28181-project-search"
        value={keyword}
        disabled={disabled}
        placeholder="搜索客户、手机号、小区、房号或项目名"
        onChange={(event) => {
          setKeyword(event.target.value);
          onSelect(null);
        }}
      />
      <div className="max-h-56 overflow-y-auto rounded-md border bg-background p-1">
        {options.map((project) => {
          const projectDisabled = disabled || !canBindCameraToProject(project);
          const description = getProjectOptionDescription(project);
          return (
            <Button
              key={project.id}
              type="button"
              variant="ghost"
              disabled={projectDisabled}
              className={cn(
                "h-auto w-full flex-col items-start gap-1 rounded-sm px-3 py-2 text-left font-normal",
                project.id === selectedProjectId && "bg-accent text-accent-foreground",
              )}
              onClick={() => {
                setKeyword(getProjectOptionLabel(project));
                onSelect(project);
              }}
            >
              <span className="font-medium">{getProjectOptionLabel(project)}</span>
              {description ? (
                <span className="text-xs text-muted-foreground">{description}</span>
              ) : null}
            </Button>
          );
        })}
        {loading ? (
          <div className="flex items-center justify-center gap-2 px-3 py-5 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            正在加载项目
          </div>
        ) : null}
        {!loading && !options.length ? (
          <div className="px-3 py-5 text-center text-sm text-muted-foreground">
            暂无匹配项目
          </div>
        ) : null}
      </div>
      <FieldDescription>支持输入关键词查找，不受项目总数影响。</FieldDescription>
      {error ? <StatusAlert>{error}</StatusAlert> : null}
    </Field>
  );
}
