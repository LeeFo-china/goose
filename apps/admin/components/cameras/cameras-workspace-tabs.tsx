"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function CamerasWorkspaceTabs({
  actions,
  cameras,
  devices,
  summary,
}: {
  actions?: ReactNode;
  cameras: ReactNode;
  devices: ReactNode;
  summary?: ReactNode;
}) {
  const [tab, setTab] = useState("cameras");

  return (
    <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-none">
        <CardHeader className="shrink-0 border-b bg-card px-4 py-0">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <TabsList className="h-auto min-w-max justify-start gap-5 overflow-x-auto overflow-y-hidden rounded-none border-0 bg-transparent p-0">
              <TabsTrigger
                className="rounded-none border-0 border-b-2 border-transparent bg-transparent px-0 py-3 text-sm text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground"
                value="cameras"
              >
                项目摄像头
              </TabsTrigger>
              <TabsTrigger
                className="rounded-none border-0 border-b-2 border-transparent bg-transparent px-0 py-3 text-sm text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground"
                value="devices"
              >
                设备接入
              </TabsTrigger>
            </TabsList>
            {summary || actions ? (
              <div className="flex flex-wrap items-center gap-2 pb-3 md:ml-auto md:pb-0">
                {summary ? (
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {summary}
                  </div>
                ) : null}
                {actions ? (
                  <div className="flex shrink-0">{actions}</div>
                ) : null}
              </div>
            ) : null}
          </div>
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
