"use client";

import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AttachmentCheckpointStatus({
  error,
  editable,
  busy,
  onRetry,
}: {
  error?: string;
  editable: boolean;
  busy: boolean;
  onRetry: () => void;
}) {
  if (!error) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className="text-xs text-destructive">{error}</p>
      {editable ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={onRetry}
        >
          <RefreshCw data-icon="inline-start" />
          重试保存
        </Button>
      ) : null}
    </div>
  );
}
