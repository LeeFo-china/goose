"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function CamerasWorkspaceTabs({
  cameras,
  devices,
  summary,
}: {
  cameras: ReactNode;
  devices: ReactNode;
  summary?: ReactNode;
}) {
  const [tab, setTab] = useState("cameras");

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-card px-4 py-0">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <TabsList className="h-auto w-full justify-start overflow-x-auto rounded-none border-0 bg-transparent p-0 md:w-auto">
              <TabsTrigger
                className="rounded-none border-0 border-b-2 border-transparent bg-transparent px-0 py-3 text-sm text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground"
                value="cameras"
              >
                项目摄像头
              </TabsTrigger>
              <TabsTrigger
                className="ml-5 rounded-none border-0 border-b-2 border-transparent bg-transparent px-0 py-3 text-sm text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground"
                value="devices"
              >
                设备接入
              </TabsTrigger>
            </TabsList>
            {summary ? (
              <div className="flex flex-wrap gap-2 pb-3 text-xs text-muted-foreground md:pb-0">
                {summary}
              </div>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <TabsContent value="cameras" className="m-0 data-[state=inactive]:hidden">
            {cameras}
          </TabsContent>
          <TabsContent value="devices" className="m-0 data-[state=inactive]:hidden">
            {devices}
          </TabsContent>
        </CardContent>
      </Card>
    </Tabs>
  );
}
