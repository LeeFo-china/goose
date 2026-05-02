"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw } from "lucide-react";
import { FormSelect } from "@/components/admin/form-select";
import { Button } from "@/components/ui/button";
import type { CameraProjectOption } from "@/components/cameras/camera-types";

function buildCamerasHref(projectId: string) {
  const params = new URLSearchParams();
  if (projectId) params.set("project_id", projectId);
  const query = params.toString();
  return query ? `/cameras?${query}` : "/cameras";
}

export function CameraProjectPicker({
  projects,
  selectedProjectId,
}: {
  projects: CameraProjectOption[];
  selectedProjectId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function navigate(projectId: string) {
    startTransition(() => {
      router.push(buildCamerasHref(projectId));
      router.refresh();
    });
  }

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(260px,420px)_auto]">
      <FormSelect
        id="camera-project"
        value={selectedProjectId}
        disabled={pending || projects.length === 0}
        placeholder="请选择项目"
        options={projects.map((project) => ({
          value: project.id,
          label: project.name || project.address || project.id,
        }))}
        onChange={navigate}
      />
      <Button
        type="button"
        variant="outline"
        disabled={pending || !selectedProjectId}
        onClick={() => navigate(selectedProjectId)}
      >
        {pending ? (
          <Loader2 className="animate-spin" data-icon="inline-start" />
        ) : (
          <RotateCcw data-icon="inline-start" />
        )}
        刷新
      </Button>
    </div>
  );
}
