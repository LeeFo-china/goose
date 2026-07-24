"use client";

import { Pencil, Plus } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function CatalogDialogTrigger({
  editing,
  label,
}: {
  editing: boolean;
  label: string;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={editing ? "ghost" : "default"}
    >
      {editing
        ? <Pencil data-icon="inline-start" />
        : <Plus data-icon="inline-start" />}
      {label}
    </Button>
  );
}

export function CatalogConflictAlert({
  onRefresh,
}: {
  onRefresh: () => void;
}) {
  return (
    <Alert variant="destructive">
      <AlertTitle>数据版本已变化</AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        <p>其他人已更新这条数据，请刷新后重新检查本次修改。</p>
        <Button type="button" size="sm" variant="outline" onClick={onRefresh}>
          刷新最新数据
        </Button>
      </AlertDescription>
    </Alert>
  );
}
