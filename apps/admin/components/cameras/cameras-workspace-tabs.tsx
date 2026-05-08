"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function CamerasWorkspaceTabs({
  cameras,
  devices,
  config,
}: {
  cameras: ReactNode;
  devices: ReactNode;
  config: ReactNode;
}) {
  const [tab, setTab] = useState("cameras");

  return (
    <Tabs value={tab} onValueChange={setTab} className="gap-4">
      <TabsList className="w-full justify-start overflow-x-auto">
        <TabsTrigger value="cameras">项目摄像头</TabsTrigger>
        <TabsTrigger value="devices">设备接入</TabsTrigger>
        <TabsTrigger value="config">接入配置</TabsTrigger>
      </TabsList>
      <TabsContent value="cameras">{cameras}</TabsContent>
      <TabsContent value="devices">{devices}</TabsContent>
      <TabsContent value="config">{config}</TabsContent>
    </Tabs>
  );
}
