"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin } from "lucide-react";
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
import { requestPlatformTenantJson } from "@/components/platform-tenants/platform-tenant-requests";

type MapConfig = {
  web_js_key: string | null;
  configured: boolean;
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
  onPick,
}: {
  config: MapConfig | null;
  latitude: number;
  longitude: number;
  title?: string | null;
  address?: string | null;
  className: string;
  onPick?: (location: { latitude: number; longitude: number }) => void;
}) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const markerRef = useRef<any>(null);
  const mapInstanceRef = useRef<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
          zoom: 16,
        });
        const marker = new TMap.MultiMarker({
          id: "tenant-address-marker",
          map,
          geometries: [{
            id: "tenant-address",
            position: center,
            properties: {
              title: title || address || "公司地址",
            },
          }],
        });
        mapInstanceRef.current = map;
        markerRef.current = marker;

        if (onPick) {
          map.on("click", (event: any) => {
            const latLng = event?.latLng;
            const nextLatitude = Number(latLng?.lat);
            const nextLongitude = Number(latLng?.lng);
            if (!Number.isFinite(nextLatitude) || !Number.isFinite(nextLongitude)) return;
            onPick({ latitude: nextLatitude, longitude: nextLongitude });
            marker.setGeometries?.([{
              id: "tenant-address",
              position: new TMap.LatLng(nextLatitude, nextLongitude),
              properties: {
                title: title || address || "公司地址",
              },
            }]);
          });
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
      if (mapRef.current) mapRef.current.innerHTML = "";
    };
  }, [address, config?.web_js_key, latitude, longitude, onPick, title]);

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
  onConfirm,
}: {
  latitude: number | null;
  longitude: number | null;
  title?: string | null;
  address?: string | null;
  disabled?: boolean;
  onConfirm: (location: { latitude: number; longitude: number }) => void;
}) {
  const [config, setConfig] = useState<MapConfig | null>(null);
  const [open, setOpen] = useState(false);
  const [draftLocation, setDraftLocation] = useState({ latitude, longitude });

  useEffect(() => {
    requestPlatformTenantJson<MapConfig>("/api/backend/platform/location/map-config")
      .then(setConfig)
      .catch(() => setConfig({ web_js_key: null, configured: false }));
  }, []);

  useEffect(() => {
    setDraftLocation({ latitude, longitude });
  }, [latitude, longitude]);

  if (latitude == null || longitude == null) return null;

  return (
    <div className="rounded-md border bg-muted/20 p-3 text-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-medium">
            <MapPin className="size-4 text-muted-foreground" />
            已保存坐标
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {latitude.toFixed(6)}, {longitude.toFixed(6)}
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || !config?.configured}
          onClick={() => setOpen(true)}
        >
          调整位置
        </Button>
      </div>
      {config?.configured ? (
        <div className="mt-3">
          <TencentMapCanvas
            config={config}
            latitude={latitude}
            longitude={longitude}
            title={title}
            address={address}
            className="h-40"
          />
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
            <DialogDescription>点击地图更新 marker 位置，确认后保存新的经纬度。</DialogDescription>
          </DialogHeader>
          {!config?.web_js_key ? (
            <StatusAlert>未配置腾讯位置服务 Web JS Key，暂不能打开地图选点。</StatusAlert>
          ) : null}
          {open && config?.web_js_key ? (
            <TencentMapCanvas
              config={config}
              latitude={draftLocation.latitude ?? latitude}
              longitude={draftLocation.longitude ?? longitude}
              title={title}
              address={address}
              className="h-[420px]"
              onPick={setDraftLocation}
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
