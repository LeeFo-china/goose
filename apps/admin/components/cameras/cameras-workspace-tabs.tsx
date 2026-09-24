"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { adminTabsListClassName, adminTabsTriggerClassName } from "@/components/admin/admin-tabs";
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
    <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-none">
        <CardHeader className="shrink-0 border-b bg-card px-4 py-0">
          <TabsList className={adminTabsListClassName}>
            <TabsTrigger
              className={adminTabsTriggerClassName}
              value="cameras"
            >
              项目摄像头
            </TabsTrigger>
            <TabsTrigger
              className={adminTabsTriggerClassName}
              value="devices"
            >
              设备管理
            </TabsTrigger>
          </TabsList>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col p-0">
          <TabsContent value="cameras" className="m-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
            {cameras}
          </TabsContent>
          <TabsContent value="devices" className="m-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
            {devices}
          </TabsContent>
        </CardContent>
      </Card>
    </Tabs>
  );
}
