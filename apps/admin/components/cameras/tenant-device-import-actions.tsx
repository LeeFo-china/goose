"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

function getPayloadMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

async function requestBackend(path: string, payload: unknown) {
  const response = await fetch(`/api/backend${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.success === false) {
    throw new Error(getPayloadMessage(data, "纳入设备资产失败"));
  }
}

export function ImportTenantDeviceButton({
  projectId,
  payload,
  disabled,
}: {
  projectId: string;
  payload: Record<string, unknown>;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function importDevice() {
    if (pending || disabled) return;
    setError("");

    startTransition(async () => {
      try {
        await requestBackend("/tenant-devices", {
          ...payload,
          source_project_id: projectId,
        });
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "纳入设备资产失败");
      }
    });
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending || disabled}
        onClick={importDevice}
      >
        {pending ? (
          <Loader2 className="animate-spin" data-icon="inline-start" />
        ) : (
          <Plus data-icon="inline-start" />
        )}
        纳入资产
      </Button>
      {error ? <span className="max-w-[180px] text-xs text-destructive">{error}</span> : null}
    </div>
  );
}
