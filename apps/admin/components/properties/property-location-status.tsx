"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, Loader2, MapPin } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requestBackendJson } from "@/lib/backend-client";

export type PropertyLocationView = {
  id: string;
  province?: string | null;
  city?: string | null;
  district?: string | null;
  adcode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  location_status?: string | null;
  location_source?: string | null;
  location_confidence?: number | null;
  location_confirmed_at?: string | null;
};

const statusConfig: Record<string, {
  label: string;
  variant: "default" | "secondary" | "outline" | "success" | "warning" | "danger";
}> = {
  pending: { label: "位置待补全", variant: "warning" },
  partial: { label: "位置部分补全", variant: "warning" },
  geocoded: { label: "已自动解析", variant: "secondary" },
  confirmed: { label: "已人工确认", variant: "success" },
};

function locationStatusLabel(status: string | null | undefined) {
  return statusConfig[status || "pending"] ?? statusConfig.pending;
}

function formatCoordinate(value: number | null | undefined) {
  return typeof value === "number" ? value.toFixed(6) : "-";
}

function formatConfidence(value: number | null | undefined) {
  if (typeof value !== "number") return "-";
  return `${Math.round(value * 100)}%`;
}

function hasCompleteLocation(property: PropertyLocationView) {
  return Boolean(
    property.adcode &&
      typeof property.latitude === "number" &&
      typeof property.longitude === "number",
  );
}

export function PropertyLocationStatus({
  property,
  onConfirmed,
}: {
  property: PropertyLocationView;
  onConfirmed?: () => Promise<void> | void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const status = locationStatusLabel(property.location_status);
  const canConfirm = property.location_status !== "confirmed" &&
    hasCompleteLocation(property);
  const area = [property.province, property.city, property.district]
    .filter(Boolean)
    .join(" / ");

  function confirmLocation() {
    setError("");
    startTransition(async () => {
      try {
        await requestBackendJson(`/properties/${property.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            id: property.id,
            location_status: "confirmed",
            location_source: "manual",
            location_confirmed_at: new Date().toISOString(),
          }),
        });
        await onConfirmed?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : "确认位置失败");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-md bg-muted/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <MapPin />
          房产位置
        </div>
        <Badge variant={status.variant}>{status.label}</Badge>
      </div>
      <div className="grid gap-2 text-xs text-muted-foreground md:grid-cols-2">
        <div>行政区：{area || "-"}</div>
        <div>adcode：{property.adcode || "-"}</div>
        <div>纬度：{formatCoordinate(property.latitude)}</div>
        <div>经度：{formatCoordinate(property.longitude)}</div>
        <div>来源：{property.location_source || "-"}</div>
        <div>置信度：{formatConfidence(property.location_confidence)}</div>
      </div>
      {canConfirm ? (
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={confirmLocation}
          >
            {pending ? (
              <Loader2 className="animate-spin" data-icon="inline-start" />
            ) : (
              <CheckCircle2 data-icon="inline-start" />
            )}
            确认位置
          </Button>
        </div>
      ) : null}
      {!hasCompleteLocation(property) ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <AlertTriangle />
          需要先通过地址解析或补充标准地址获取坐标。
        </div>
      ) : null}
      {error ? <StatusAlert>{error}</StatusAlert> : null}
    </div>
  );
}
