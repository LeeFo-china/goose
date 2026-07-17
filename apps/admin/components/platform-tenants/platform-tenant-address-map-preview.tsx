"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Loader2,
  MapPin,
} from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { requestBackendJson } from "@/lib/backend-client";

type MapConfig = {
  web_js_key: string | null;
  configured: boolean;
};

const COORDINATE_NUDGE_STEP = 0.00001;
const DEFAULT_MAP_LOCATION = { latitude: 35.8617, longitude: 104.1954 };
const DEFAULT_MAP_ZOOM = 4;
const ADDRESS_MAP_ZOOM = 16;

type MapLocation = {
  latitude: number;
  longitude: number;
};

declare global {
  interface Window {
    TMap?: any;
  }
}

let tencentMapScriptPromise: Promise<void> | null = null;

function loadTencentMapScript(key: string) {
  if (window.TMap) return Promise.resolve();
  if (tencentMapScriptPromise) return tencentMapScriptPromise;

  tencentMapScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://map.qq.com/api/gljs?v=1.exp&key=${encodeURIComponent(key)}`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      tencentMapScriptPromise = null;
      reject(new Error("腾讯地图脚本加载失败"));
    };
    document.head.appendChild(script);
  });

  return tencentMapScriptPromise;
}

function TencentMapCanvas({
  config,
  latitude,
  longitude,
  title,
  address,
  className,
  zoom,
  onPick,
  markerDraggable,
}: {
  config: MapConfig | null;
  latitude: number;
  longitude: number;
  title?: string | null;
  address?: string | null;
  className: string;
  zoom: number;
  onPick?: (location: MapLocation) => void;
  markerDraggable?: boolean;
}) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const markerRef = useRef<any>(null);
  const mapInstanceRef = useRef<any>(null);
  const isDraggingRef = useRef(false);
  const titleRef = useRef(title);
  const addressRef = useRef(address);
  const onPickRef = useRef(onPick);
  const zoomRef = useRef(zoom);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    titleRef.current = title;
    addressRef.current = address;
    onPickRef.current = onPick;
    zoomRef.current = zoom;
  }, [address, onPick, title, zoom]);

  const updateMarkerLocation = useCallback((
    location: MapLocation,
    notify = false,
    nextZoom = zoomRef.current,
  ) => {
    if (!window.TMap) return;
    const TMap = window.TMap;
    const position = new TMap.LatLng(location.latitude, location.longitude);
    mapInstanceRef.current?.setCenter?.(position);
    mapInstanceRef.current?.setZoom?.(nextZoom);
    markerRef.current?.setGeometries?.([{
      id: "tenant-address",
      position,
      properties: {
        title: titleRef.current || addressRef.current || "公司地址",
      },
    }]);
    if (notify) onPickRef.current?.(location);
  }, []);

  const stopDragging = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  const readEventLocation = useCallback((event: any) => {
    const latLng = event?.latLng;
    const nextLatitude = Number(latLng?.lat);
    const nextLongitude = Number(latLng?.lng);
    if (!Number.isFinite(nextLatitude) || !Number.isFinite(nextLongitude)) return null;
    return { latitude: nextLatitude, longitude: nextLongitude };
  }, []);

  useEffect(() => {
    if (!config?.web_js_key || !mapRef.current) return;

    let disposed = false;
    setLoading(true);
    setError("");
    loadTencentMapScript(config.web_js_key)
      .then(() => {
        if (disposed || !window.TMap || !mapRef.current) return;
        const TMap = window.TMap;
        const center = new TMap.LatLng(latitude, longitude);
        const map = new TMap.Map(mapRef.current, {
          center,
          zoom: zoomRef.current,
        });
        const marker = new TMap.MultiMarker({
          id: "tenant-address-marker",
          map,
          geometries: [{
            id: "tenant-address",
            position: center,
            properties: {
              title: titleRef.current || addressRef.current || "公司地址",
            },
          }],
        });
        mapInstanceRef.current = map;
        markerRef.current = marker;

        if (onPick) {
          map.on("click", (event: any) => {
            if (isDraggingRef.current) return;
            const location = readEventLocation(event);
            if (!location) return;
            updateMarkerLocation(location, true);
          });
        }

        if (onPick && markerDraggable) {
          marker.setStopPropagation?.(true);
          marker.on("mousedown", () => {
            isDraggingRef.current = true;
          });
          marker.on("touchstart", () => {
            isDraggingRef.current = true;
          });
          marker.on("mouseup", stopDragging);
          marker.on("touchend", stopDragging);
          map.on("mousemove", (event: any) => {
            if (!isDraggingRef.current) return;
            const location = readEventLocation(event);
            if (!location) return;
            updateMarkerLocation(location, true);
          });
          map.on("touchmove", (event: any) => {
            if (!isDraggingRef.current) return;
            const location = readEventLocation(event);
            if (!location) return;
            updateMarkerLocation(location, true);
          });
          map.on("mouseup", stopDragging);
          map.on("touchend", stopDragging);
          window.addEventListener("mouseup", stopDragging);
          window.addEventListener("touchend", stopDragging);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "腾讯地图加载失败"))
      .finally(() => setLoading(false));

    return () => {
      disposed = true;
      markerRef.current?.destroy?.();
      mapInstanceRef.current?.destroy?.();
      markerRef.current = null;
      mapInstanceRef.current = null;
      isDraggingRef.current = false;
      window.removeEventListener("mouseup", stopDragging);
      window.removeEventListener("touchend", stopDragging);
      if (mapRef.current) mapRef.current.innerHTML = "";
    };
  }, [
    config?.web_js_key,
    markerDraggable,
    readEventLocation,
    stopDragging,
    updateMarkerLocation,
  ]);

  useEffect(() => {
    updateMarkerLocation({ latitude, longitude }, false, zoom);
  }, [latitude, longitude, updateMarkerLocation, zoom]);

  return (
    <div className={`relative overflow-hidden rounded-md border bg-muted ${className}`}>
      {loading ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60">
          <Loader2 className="animate-spin" />
        </div>
      ) : null}
      {error ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 px-3 text-center text-sm text-destructive">
          {error}
        </div>
      ) : null}
      <div ref={mapRef} className="h-full w-full" />
    </div>
  );
}

export function PlatformTenantAddressMapPreview({
  latitude,
  longitude,
  title,
  address,
  disabled,
  mapConfigPath = "/api/backend/platform/location/map-config",
  previewClassName = "h-40",
  zoom = ADDRESS_MAP_ZOOM,
  onConfirm,
}: {
  latitude: number | null;
  longitude: number | null;
  title?: string | null;
  address?: string | null;
  disabled?: boolean;
  mapConfigPath?: string;
  previewClassName?: string;
  zoom?: number;
  onConfirm: (location: MapLocation) => void;
}) {
  const [config, setConfig] = useState<MapConfig | null>(null);
  const [open, setOpen] = useState(false);
  const [draftLocation, setDraftLocation] = useState({ latitude, longitude });
  const canOpenMap = Boolean(!disabled && config?.configured);
  const hasCoordinate = latitude != null && longitude != null;
  const resolvedLocation = hasCoordinate
    ? { latitude, longitude }
    : DEFAULT_MAP_LOCATION;
  const resolvedZoom = hasCoordinate ? zoom : DEFAULT_MAP_ZOOM;

  useEffect(() => {
    requestBackendJson<MapConfig>(mapConfigPath)
      .then(setConfig)
      .catch(() => setConfig({ web_js_key: null, configured: false }));
  }, [mapConfigPath]);

  useEffect(() => {
    setDraftLocation({ latitude, longitude });
  }, [latitude, longitude]);

  const handleNudge = useCallback((delta: { latitude: number; longitude: number }) => {
    setDraftLocation((current) => {
      const currentLatitude = current.latitude ?? resolvedLocation.latitude;
      const currentLongitude = current.longitude ?? resolvedLocation.longitude;

      return {
        latitude: Number((currentLatitude + delta.latitude).toFixed(7)),
        longitude: Number((currentLongitude + delta.longitude).toFixed(7)),
      };
    });
  }, [resolvedLocation.latitude, resolvedLocation.longitude]);

  return (
    <div className="rounded-md border bg-muted/20 p-3 text-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-medium">
            <MapPin className="size-4 text-muted-foreground" />
            {hasCoordinate ? "已保存坐标" : "待确认坐标"}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {hasCoordinate
              ? `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`
              : "选择区域或地址后自动定位"}
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canOpenMap}
          onClick={() => setOpen(true)}
        >
          调整位置
        </Button>
      </div>
      {config == null ? (
        <div className="mt-3 flex h-40 items-center justify-center rounded-md border bg-muted text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : config.configured ? (
        <div className="relative mt-3">
          <TencentMapCanvas
            config={config}
            latitude={resolvedLocation.latitude}
            longitude={resolvedLocation.longitude}
            title={title}
            address={address}
            className={previewClassName}
            zoom={resolvedZoom}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!canOpenMap}
            className="absolute right-2 top-2 h-7 shadow-sm"
            onClick={() => setOpen(true)}
          >
            微调
          </Button>
        </div>
      ) : (
        <div className="mt-2 flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>
            当前 WebService Key 使用签名校验，不能作为浏览器地图 Key 使用。请单独配置腾讯位置服务 Web JS Key。
          </span>
          <Button asChild type="button" variant="outline" size="sm" className="h-7 w-fit">
            <Link href="/settings?group=tencent_lbs">去配置</Link>
          </Button>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[760px]">
          <DialogHeader>
            <DialogTitle>调整公司位置</DialogTitle>
            <DialogDescription>拖放 marker 或点击地图更新位置，也可以用方向按钮做米级微调。</DialogDescription>
          </DialogHeader>
          {!config?.web_js_key ? (
            <StatusAlert>未配置腾讯位置服务 Web JS Key，暂不能打开地图选点。</StatusAlert>
          ) : null}
          <div className="flex flex-col gap-2 rounded-md border bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-muted-foreground">
              当前坐标：{(draftLocation.latitude ?? resolvedLocation.latitude).toFixed(7)}, {(draftLocation.longitude ?? resolvedLocation.longitude).toFixed(7)}
            </div>
            <div className="grid w-fit grid-cols-3 gap-1">
              <span />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-8"
                onClick={() => handleNudge({ latitude: COORDINATE_NUDGE_STEP, longitude: 0 })}
                aria-label="向北微调"
              >
                <ArrowUp className="size-4" />
              </Button>
              <span />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-8"
                onClick={() => handleNudge({ latitude: 0, longitude: -COORDINATE_NUDGE_STEP })}
                aria-label="向西微调"
              >
                <ArrowLeft className="size-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-8"
                onClick={() => setDraftLocation(resolvedLocation)}
                aria-label="还原坐标"
              >
                <MapPin className="size-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-8"
                onClick={() => handleNudge({ latitude: 0, longitude: COORDINATE_NUDGE_STEP })}
                aria-label="向东微调"
              >
                <ArrowRight className="size-4" />
              </Button>
              <span />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-8"
                onClick={() => handleNudge({ latitude: -COORDINATE_NUDGE_STEP, longitude: 0 })}
                aria-label="向南微调"
              >
                <ArrowDown className="size-4" />
              </Button>
              <span />
            </div>
          </div>
          {open && config?.web_js_key ? (
            <TencentMapCanvas
              config={config}
              latitude={draftLocation.latitude ?? resolvedLocation.latitude}
              longitude={draftLocation.longitude ?? resolvedLocation.longitude}
              title={title}
              address={address}
              className="h-[420px]"
              zoom={resolvedZoom}
              onPick={setDraftLocation}
              markerDraggable
            />
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button
              type="button"
              disabled={draftLocation.latitude == null || draftLocation.longitude == null}
              onClick={() => {
                if (draftLocation.latitude == null || draftLocation.longitude == null) return;
                onConfirm({
                  latitude: draftLocation.latitude,
                  longitude: draftLocation.longitude,
                });
                setOpen(false);
              }}
            >
              确认位置
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
