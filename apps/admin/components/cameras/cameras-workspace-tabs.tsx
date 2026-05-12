"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function CamerasWorkspaceTabs({
  cameras,
  devices,
}: {
  cameras: ReactNode;
  devices: ReactNode;
}) {
  const [tab, setTab] = useState("cameras");

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <Card>
        <CardHeader className="pb-3">
          <TabsList className="h-auto w-full justify-start overflow-x-auto">
            <TabsTrigger value="cameras">项目摄像头</TabsTrigger>
            <TabsTrigger value="devices">设备接入</TabsTrigger>
          </TabsList>
        </CardHeader>
        <CardContent className="p-0">
          <TabsContent value="cameras" className="m-0">{cameras}</TabsContent>
          <TabsContent value="devices" className="m-0">{devices}</TabsContent>
        </CardContent>
      </Card>
    </Tabs>
  );
}
